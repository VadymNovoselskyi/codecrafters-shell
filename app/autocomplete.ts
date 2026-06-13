import fs from "fs";
import { BUILTINS } from "./builtins";
import { parseInput } from "./parse";
import { getPathExecs } from "./pathHelpers";
import type { CompletionState } from "./CompletionState";
import { spawnSync } from "child_process";

let filepathTabState: { line: string; count: number } | null = null;

export type AutocompleteUi = {
  write: (text: string) => void;
  redraw: (line: string) => void;
};

export function handleAutocomplete(
  line: string,
  completionState: CompletionState,
  ui: AutocompleteUi,
): [string[], string] {
  const pipes = parseInput(line);
  let { executable, args } = pipes[pipes.length - 1].getEndingCommand();

  if (!args.length && !line.endsWith(" ")) {
    return handleCommandAutocomplete(executable, ui);
  } else {
    try {
      const path = completionState.getCompletion(executable);
      return handleProgrammableAutocomplete(line, executable, args, path, ui);
    } catch (_) {
      return handleFilepathAutocomplete(line, args, ui);
    }
  }
}

function handleCommandAutocomplete(command: string, ui: AutocompleteUi): [string[], string] {
  // Handle builtin command autocomplete
  const builtinHits = BUILTINS.filter(cmd => cmd.startsWith(command)).sort();

  if (!builtinHits.length) {
    ui.write("\x07");
  } else if (builtinHits.length === 1) {
    return [[builtinHits[0] + " "], command];
  } else {
    const longestPrefix = getLongestPrefix(command, builtinHits);
    if (longestPrefix) {
      return [[command + longestPrefix], command];
    }

    ui.write("\n" + builtinHits.join("  ") + "\n");
    ui.redraw(command);
    return [[], command];
  }

  // Handle path executables autocomplete
  const pathHits = getPathExecs()
    .filter(cmd => cmd.startsWith(command))
    .sort();

  if (!pathHits.length) return [[], command];
  if (pathHits.length === 1) return [[pathHits[0] + " "], command];

  const longestPrefix = getLongestPrefix(command, pathHits);
  if (longestPrefix) {
    return [[command + longestPrefix], command];
  }

  ui.write("\n" + pathHits.join("  ") + "\n");
  ui.redraw(command);
  return [[], command];
}

function handleFilepathAutocomplete(
  line: string,
  args: string[],
  ui: AutocompleteUi,
): [string[], string] {
  const filepath = args[args.length - 1] ?? "";
  let filename = filepath;
  let cwd: string;

  if (filepath.includes("/")) {
    cwd = filepath.substring(0, filepath.lastIndexOf("/"));
    filename = filepath.substring(filepath.lastIndexOf("/") + 1) ?? "";
  } else {
    cwd = process.cwd();
  }

  if (!fs.existsSync(cwd)) return [[], line];

  const files = fs.readdirSync(cwd);
  const fileHits = filename ? files.filter(file => file.startsWith(filename)).sort() : files;

  if (!fileHits.length) {
    filepathTabState = null;
    ui.write("\x07");
    return [[], line];
  } else if (fileHits.length === 1) {
    filepathTabState = null;
    return [
      [fileHits[0].concat(fs.lstatSync(`${cwd}/${fileHits[0]}`).isDirectory() ? "/" : " ")],
      filename,
    ];
  }

  const longestPrefix = getLongestPrefix(filename, fileHits);
  if (longestPrefix) {
    filepathTabState = null;
    return [[filename + longestPrefix], filename];
  }

  if (!filepathTabState || filepathTabState.line !== line) {
    filepathTabState = { line, count: 0 };
  }
  filepathTabState.count++;
  if (filepathTabState.count % 2 === 1) {
    ui.write("\x07");
    return [[], line];
  }
  filepathTabState = null;

  ui.write("\n" + fileHits.map(file => fileToString(file, cwd)).join("  ") + "\n");
  ui.redraw(line);
  return [[], line];
}

function handleProgrammableAutocomplete(
  line: string,
  executable: string,
  args: string[],
  completionPath: string,
  ui: AutocompleteUi,
): [string[], string] {
  const completionArg = args[args.length - 1] ?? "";
  const result = spawnSync(
    completionPath,
    [executable, completionArg, args[args.length - 2] ?? executable],
    {
      env: { ...process.env, COMP_LINE: line, COMP_POINT: String(line.length) },
      encoding: "utf8",
    },
  );
  const output = result.stdout.toString().trim();
  const lines = output.split("\n");
  //   const err = result.stderr;

  if (!output) {
    filepathTabState = null;
    ui.write("\x07");
    return [[], line];
  }

  const longestPrefix = getLongestPrefix(completionArg, lines);
  if (longestPrefix) {
    filepathTabState = null;
    return [[line + longestPrefix + (lines.length === 1 ? " " : "")], line];
  }

  if (!filepathTabState || filepathTabState.line !== line) {
    filepathTabState = { line, count: 0 };
  }
  filepathTabState.count++;
  if (filepathTabState.count % 2 === 1) {
    ui.write("\x07");
    return [[], line];
  }
  filepathTabState = null;

  ui.write("\n" + lines.join("  ") + "\n");
  ui.redraw(line);
  return [[], line];
}

function fileToString(filename: string, cwd: string): string {
  return filename.concat(fs.lstatSync(`${cwd}/${filename}`).isDirectory() ? "/" : "");
}

function getLongestPrefix(start: string, candidates: string[]): string {
  const shortestWord = candidates.reduce((acc: number, candidate: string) => {
    return Math.min(acc, candidate.length);
  }, Number.MAX_SAFE_INTEGER);
  let result = "";
  let index = start.length;

  while (shortestWord > index) {
    const letters = candidates.reduce((acc: Record<string, number>, candidate: string) => {
      acc[candidate[index]] ??= 1;
      return acc;
    }, {});

    if (Object.values(letters).length !== 1) break;
    result = result.concat(Object.keys(letters)[0]);
    index++;
  }

  return result;
}
