import fs from "fs";
import path from "path";
import { BUILTINS } from "./builtins";
import { parseInput } from "./parse";

export type AutocompleteUi = {
  write: (text: string) => void;
  redraw: (line: string) => void;
};

export function handleAutocomplete(
  line: string,
  ui: AutocompleteUi,
): [string[], string] {
  const pipes = parseInput(line);
  const [command, args] = pipes[pipes.length - 1];

  if (!args.length && !line.endsWith(" ")) {
    return handleCommandAutocomplete(command, ui);
  }
  return handleFilepathAutocomplete(line, args, ui);
}

function handleCommandAutocomplete(
  command: string,
  ui: AutocompleteUi,
): [string[], string] {
  // Handle builtin command autocomplete
  const builtinHits = BUILTINS.filter((cmd) => cmd.startsWith(command)).sort();

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
    .filter((cmd) => cmd.startsWith(command))
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
  const fileHits = filename
    ? files.filter((file) => file.startsWith(filename)).sort()
    : files;

  if (!fileHits.length) {
    ui.write("\x07");
    return [[], line];
  } else if (fileHits.length === 1) {
    return [
      [
        fileHits[0].concat(
          fs.lstatSync(`${cwd}/${fileHits[0]}`).isDirectory() ? "/" : " ",
        ),
      ],
      filename,
    ];
  }

  ui.write("\x07");
  const longestPrefix = getLongestPrefix(filename, fileHits);
  if (longestPrefix) {
    return [[filename + longestPrefix], filename];
  }

  ui.write(
    "\n" + fileHits.map((file) => fileToString(file, cwd)).join("  ") + "\n",
  );
  ui.redraw(line);
  return [[], line];
}

function fileToString(filename: string, cwd: string): string {
  return filename.concat(
    fs.lstatSync(`${cwd}/${filename}`).isDirectory() ? "/" : "",
  );
}

function getPathExecs(): string[] {
  const results: string[] = [];
  const paths = process.env.PATH?.split(path.delimiter);
  if (!paths) {
    return [];
  }

  for (const pathEntry of paths) {
    if (!fs.existsSync(pathEntry)) continue;

    const executables = fs.readdirSync(pathEntry);
    for (const executable of executables) {
      try {
        fs.accessSync(`${pathEntry}/${executable}`, fs.constants.X_OK);
        if (!results.includes(executable)) results.push(executable);
      } catch {
        continue;
      }
    }
  }

  return results;
}

function getLongestPrefix(start: string, candidates: string[]): string {
  let result = "";
  let index = start.length;

  while (true) {
    const letters = candidates.reduce(
      (acc: Record<string, number>, candidate: string) => {
        acc[candidate[index]] ??= 1;
        return acc;
      },
      {},
    );

    if (Object.keys(letters).length !== 1) break;
    result = result.concat(Object.keys(letters)[0]);
    index++;
  }

  return result;
}
