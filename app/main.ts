import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import {
  isBuiltin,
  loadHistoryFromFile,
  persistHistoryToFile,
  runBuiltin,
  type ShellState,
} from "./builtins";
import { handleAutocomplete } from "./autocomplete";
import { parseInput } from "./parse";
import { createInterface } from "readline";

const shellState: ShellState = {
  history: [],
  lastAppendedIdx: 0,
  exitRequested: false,
};

loadHistoryFromFile(shellState, process.env.HISTFILE);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
  completer: (line: string) =>
    handleAutocomplete(line, {
      write: (text: string) => fs.writeSync(1, text),
      redraw: (lineToDraw: string) => {
        rl.write(null, { ctrl: true, name: "u" });
        rl.prompt();
        rl.write(lineToDraw);
      },
    }),
});
rl.prompt();

rl.on("line", async (input) => {
  shellState.history.push(input);
  shellState.exitRequested = false;

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

    if (shellState.exitRequested) {
      break;
    }

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

  if (shellState.exitRequested) {
    rl.close();
    return;
  }

  rl.prompt();
});

rl.on("close", () => {
  persistHistoryToFile(shellState, process.env.HISTFILE);
  process.exit(0);
});

async function run(
  command: string,
  args: string[],
  stdin: NodeJS.ReadableStream | undefined,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  if (isBuiltin(command)) {
    runBuiltin(command, args, {
      stdout,
      stderr,
      findExecPath,
      shellState,
    });

    if (stdout !== process.stdout) stdout.end();
    if (stderr !== process.stderr) stderr.end();
    return 0;
  }

  if (findExecPath(command)) {
    const proc = spawn(command, args, {
      stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
    });

    if (stdin) stdin.pipe(proc.stdin!);

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

  stderr.write(`${command}: command not found\n`);
  if (stderr !== process.stderr) stderr.end();
  if (stdout !== process.stdout) stdout.end();
  return 127;
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
  ) {
    return { stdout: undefined, stderr: undefined };
  }

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
  }

  args.splice(-2);
  return {
    stdout: fs.createWriteStream(outFile, { flags: flag }),
    stderr: undefined,
  };
}

function findExecPath(searchedCommand: string): string | undefined {
  const paths = process.env.PATH?.split(path.delimiter);
  if (!paths) {
    return;
  }

  for (const pathEntry of paths) {
    if (!fs.existsSync(pathEntry)) continue;

    const contents = fs.readdirSync(pathEntry);
    if (!contents.includes(searchedCommand)) continue;

    try {
      fs.accessSync(`${pathEntry}/${searchedCommand}`, fs.constants.X_OK);
    } catch {
      continue;
    }

    return `${pathEntry}/${searchedCommand}`;
  }
}
