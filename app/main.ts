import { createInterface } from "readline";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { PassThrough } from "stream";

const history: string[] = [];
let lastAppendedIdx = 0;
if (process.env.HISTFILE) {
  fs.readFile(process.env.HISTFILE, "utf-8", (err, data) => {
    if (err) return;
    history.push(...data.split("\n").filter(Boolean));
  });
}

const builtins = ["cd", "pwd", "echo", "history", "exit", "type"];
const handlers: Record<string, Function> = {
  cd: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => {
    let path = args[0];
    if (path.startsWith("~")) {
      path = `${process.env.HOME}${path.substring(1)}`;
    }

    if (fs.existsSync(path)) {
      process.chdir(path);
    } else {
      stderr.write(`cd: ${path}: No such file or directory` + "\n");
    }
  },
  pwd: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => stdout.write(process.cwd() + "\n"),
  echo: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => stdout.write(args.join(" ") + "\n"),
  history: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => {
    if (args[0] === "-r") {
      const filepath = args[1];
      fs.readFile(filepath, "utf-8", (err, data) => {
        if (err) {
          stderr.write(`Error reading file: ${err}`);
          return;
        }

        history.push(...data.split("\n").filter(Boolean));
      });
      return;
    } else if (args[0] === "-w" || args[0] === "-a") {
      const filepath = args[1];
      fs.writeFileSync(
        filepath,
        history.slice(lastAppendedIdx).join("\n") + "\n",
        { flag: args[0] === "-w" ? "w+" : "a+" },
      );
      lastAppendedIdx = history.length;
    }

    const amount = Math.min(history.length, Number(args[0] || history.length));
    for (let i = history.length - amount; i < history.length; i++) {
      stdout.write(`    ${i + 1}  ${history[i]}\n`);
    }
  },
  exit: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => rl.close(),
  type: (
    args: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => {
    const searchedCommand = args[0];
    if (builtins.includes(searchedCommand)) {
      stdout.write(`${searchedCommand} is a shell builtin` + "\n");
    } else if (findExecPath(searchedCommand)) {
      const execPath = findExecPath(searchedCommand);
      stdout.write(`${searchedCommand} is ${execPath}` + "\n");
    } else {
      stderr.write(`${searchedCommand}: not found` + "\n");
    }
  },
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
  completer: handleAutocomplete,
});
rl.prompt();

rl.on("line", async (input) => {
  history.push(input);
  const stages = parseInput(input);
  const runs: Promise<number>[] = [];
  let upstream: NodeJS.ReadableStream | undefined;

  for (let i = 0; i < stages.length; i++) {
    const [command, args] = stages[i];
    const { stdout: redirectedStdout, stderr: redirectedStderr } =
      handleStreamRedirect(args);

    const isLastStage = i === stages.length - 1;
    const nextPipe =
      !isLastStage && !redirectedStdout ? new PassThrough() : undefined;
    const stdoutTarget = redirectedStdout ?? nextPipe ?? process.stdout;
    const stderrTarget = redirectedStderr ?? process.stderr;

    runs.push(run(command, args, upstream, stdoutTarget, stderrTarget));

    if (!isLastStage) {
      if (nextPipe) {
        upstream = nextPipe;
      } else {
        const empty = new PassThrough();
        empty.end();
        upstream = empty;
      }
    }
  }

  if (runs.length > 0) {
    await runs[runs.length - 1];
  }
  rl.prompt();
});

rl.on("close", () => {
  if (process.env.HISTFILE) {
    fs.writeFileSync(
      process.env.HISTFILE,
      history.slice(lastAppendedIdx).join("\n") + "\n",
      { flag: "w+" },
    );
  }
  process.exit(0);
});

async function run(
  command: string,
  args: string[],
  stdin: NodeJS.ReadableStream | undefined,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  if (builtins.includes(command)) {
    handlers[command](args, stdout, stderr);
    if (stdout !== process.stdout) stdout.end();
    if (stderr !== process.stderr) stderr.end();
    return 0;
  }

  if (findExecPath(command)) {
    const proc = spawn(command, args.length && args[0] ? args : [], {
      stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
    });

    if (stdin) {
      stdin.pipe(proc.stdin!);
    }

    if (proc.stdout) {
      proc.stdout.pipe(stdout, { end: stdout !== process.stdout });
    }
    if (proc.stderr) {
      proc.stderr.pipe(stderr, { end: stderr !== process.stderr });
    }

    return await new Promise<number>((resolve) => {
      proc.on("close", (code) => resolve(code ?? 0));
      proc.on("error", () => resolve(1));
    });
  }

  stderr.write(`${command}: command not found` + "\n");
  if (stderr !== process.stderr) stderr.end();
  if (stdout !== process.stdout) stdout.end();
  return 127;
}

function handleAutocomplete(line: string) {
  const pipes = parseInput(line);
  const [command, args] = pipes[pipes.length - 1];

  if (args.length === 1 && !args[0]) {
    const builtinHits = builtins
      .filter((cmd) => cmd.startsWith(command))
      .sort();

    if (!builtinHits.length) process.stdout.write("\x07");
    else if (builtinHits.length === 1) return [[builtinHits[0] + " "], command];
    else {
      const longestPrefix = getLongestPrefix(command, builtinHits);
      if (longestPrefix) {
        return [[command + longestPrefix], command];
      }

      process.stdout.write("\n" + builtinHits.join("  ") + "\n");
      rl.write(null, { ctrl: true, name: "u" }); // clear current input line in rl
      rl.prompt();
      rl.write(command);
      return [[], command];
    }

    const pathHits = getPathExecs()
      .filter((cmd) => cmd.startsWith(command))
      .sort();

    if (!pathHits.length) return [[], command];
    else if (pathHits.length === 1) return [[pathHits[0] + " "], command];
    else {
      const longestPrefix = getLongestPrefix(command, pathHits);
      if (longestPrefix) {
        return [[command + longestPrefix], command];
      }

      process.stdout.write("\n" + pathHits.join("  ") + "\n");
      rl.write(null, { ctrl: true, name: "u" }); // clear current input line in rl
      rl.prompt();
      rl.write(command);
      return [[], command];
    }
  }

  const filename = args[args.length - 1];
  const files = fs.readdirSync(process.cwd());
  const fileHits = files.filter((file) => file.startsWith(filename)).sort();

  if (!fileHits.length) {
    process.stdout.write("\x07");
    return [[], line];
  } else if (fileHits.length === 1) return [[fileHits[0] + " "], filename];
  else {
    const longestPrefix = getLongestPrefix(filename, fileHits);
    if (longestPrefix) {
      return [[filename + longestPrefix], filename];
    }

    process.stdout.write("\n" + fileHits.join("  ") + "\n");
    rl.write(null, { ctrl: true, name: "u" }); // clear current input line in rl
    rl.prompt();
    rl.write(line);
    return [[], line];
  }
}

function parseInput(input: string): [string, string[]][] {
  const results: [string, string[]][] = [];
  for (const pipe of input.split(" | ")) {
    let command: string, argsUnparsed: string[];
    if (pipe.startsWith("'") || pipe.startsWith('"')) {
      // This is really not the best thing, but like how do we know what string to normalize?
      const match = pipe.match(/'([^']+)'|"([^"]+)"/);
      if (!match?.[1] && !match?.[2]) {
        throw Error(`Error parsing input (smth witn quotes): ${pipe}`);
      }
      command = match[1] ?? match[2].replace(/\\(.)/g, "$1");

      // Also the +3 here will break if more than one \\ escape
      argsUnparsed = pipe.substring(command.length + 3).split(" ");
    } else {
      [command, ...argsUnparsed] = pipe.split(" ");
    }
    // console.log(`command: '${command}'; argsUnparsed: "${argsUnparsed.join(" ")}"`);
    const args = normalizeArgs(argsUnparsed.join(" "));

    results.push([command, args]);
  }
  return results;
}

function handleStreamRedirect(args: string[]): {
  stdout: NodeJS.WritableStream | undefined;
  stderr: NodeJS.WritableStream | undefined;
} {
  if (
    !(
      args.includes(">") ||
      args.includes("1>") ||
      args.includes("2>") ||
      args.includes(">>") ||
      args.includes("1>>") ||
      args.includes("2>>")
    )
  )
    return { stdout: undefined, stderr: undefined };

  const outFile = args[args.length - 1];
  const flag =
    args.includes(">") || args.includes("1>") || args.includes("2>")
      ? "w+"
      : "a+";

  fs.writeFileSync(outFile, "", { flag });

  if (args.includes("2>") || args.includes("2>>")) {
    args.splice(-2);
    return {
      stdout: undefined,
      stderr: fs.createWriteStream(outFile, { flags: flag }),
    };
  } else {
    args.splice(-2);
    return {
      stdout: fs.createWriteStream(outFile, { flags: flag }),
      stderr: undefined,
    };
  }
}

function normalizeArgs(argsStr: string): string[] {
  argsStr = argsStr.replace(/''|""/g, "");

  const args: string[] = [""];
  let wordIndex = 0;
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if (char == "\'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char == '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char == "\\") {
      if (!inSingleQuotes && !inDoubleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[++i]);
      } else if (inSingleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[i]);
      } else if (
        (inDoubleQuotes && argsStr[i + 1] == '"') ||
        argsStr[i + 1] == "\\"
      ) {
        // We don't yet handle things like vars, newlines etc etc
        args[wordIndex] = args[wordIndex].concat(argsStr[++i]);
      }
    } else if (/\S/.test(char) || inSingleQuotes || inDoubleQuotes) {
      args[wordIndex] = args[wordIndex].concat(char);
    } else if (char == " " && args[wordIndex].length !== 0) {
      args.push("");
      wordIndex++;
    } else {
      // console.log(`Can't match char: "${char}"`);
    }
  }
  // console.log(args);
  return args;
}

function findExecPath(searchedCommand: string): string | undefined {
  const paths = process.env.PATH?.split(path.delimiter);
  if (!paths) {
    return;
  }

  for (const path of paths) {
    if (!fs.existsSync(path)) continue;

    const contents = fs.readdirSync(path);
    if (!contents.includes(searchedCommand)) continue;

    try {
      fs.accessSync(`${path}/${searchedCommand}`, fs.constants.X_OK);
    } catch {
      continue;
    }

    return `${path}/${searchedCommand}`;
  }
}

function getPathExecs(): string[] {
  const results: string[] = [];
  const paths = process.env.PATH?.split(path.delimiter);
  if (!paths) {
    return [];
  }

  for (const path of paths) {
    if (!fs.existsSync(path)) continue;

    const executables = fs.readdirSync(path);
    for (const executable of executables) {
      try {
        fs.accessSync(`${path}/${executable}`, fs.constants.X_OK);
        if (!results.includes(executable)) results.push(executable);
      } catch {
        continue;
      }
    }
  }
  return results;
}

function getLongestPrefix(start: string, execs: string[]): string {
  let result = "";

  let index = start.length;
  while (true) {
    const letters = execs.reduce(
      (letters: Record<string, number>, exec: string) => {
        letters[exec[index]] ??= 1;
        return letters;
      },
      {},
    );
    if (Object.keys(letters).length !== 1) break;
    result = result.concat(Object.keys(letters)[0]);
    index++;
  }
  return result;
}
