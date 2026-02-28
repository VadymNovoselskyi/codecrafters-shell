import fs from "fs";

export const BUILTINS = [
  "cd",
  "pwd",
  "echo",
  "history",
  "exit",
  "type",
] as const;

type BuiltinName = (typeof BUILTINS)[number];

export type ShellState = {
  history: string[];
  lastAppendedIdx: number;
  exitRequested: boolean;
};

export type BuiltinContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  findExecPath: (command: string) => string | undefined;
  shellState: ShellState;
};

export function isBuiltin(command: string): command is BuiltinName {
  return BUILTINS.includes(command as BuiltinName);
}

export function runBuiltin(
  command: BuiltinName,
  args: string[],
  context: BuiltinContext,
): void {
  const { stdout, stderr, findExecPath, shellState } = context;

  switch (command) {
    case "cd": {
      let targetPath = args[0] ?? "";
      if (targetPath.startsWith("~")) {
        targetPath = `${process.env.HOME ?? ""}${targetPath.substring(1)}`;
      }

      if (targetPath && fs.existsSync(targetPath)) {
        process.chdir(targetPath);
      } else {
        stderr.write(`cd: ${targetPath}: No such file or directory\n`);
      }
      return;
    }

    case "pwd": {
      stdout.write(process.cwd() + "\n");
      return;
    }

    case "echo": {
      stdout.write(args.join(" ") + "\n");
      return;
    }

    case "history": {
      const mode = args[0];
      if (mode === "-r") {
        const filepath = args[1];
        try {
          const data = fs.readFileSync(filepath, "utf-8");
          shellState.history.push(...data.split("\n").filter(Boolean));
        } catch (error) {
          stderr.write(`Error reading file: ${error}\n`);
        }
        return;
      }

      if (mode === "-w" || mode === "-a") {
        const filepath = args[1];
        fs.writeFileSync(
          filepath,
          shellState.history.slice(shellState.lastAppendedIdx).join("\n") +
            "\n",
          { flag: mode === "-w" ? "w+" : "a+" },
        );
        shellState.lastAppendedIdx = shellState.history.length;
        return;
      }

      const requestedAmount = Number(args[0] || shellState.history.length);
      const amount = Math.min(shellState.history.length, requestedAmount);
      for (
        let i = shellState.history.length - amount;
        i < shellState.history.length;
        i++
      ) {
        stdout.write(`    ${i + 1}  ${shellState.history[i]}\n`);
      }
      return;
    }

    case "exit": {
      shellState.exitRequested = true;
      return;
    }

    case "type": {
      const searchedCommand = args[0];
      if (BUILTINS.includes(searchedCommand as BuiltinName)) {
        stdout.write(`${searchedCommand} is a shell builtin\n`);
      } else {
        const execPath = findExecPath(searchedCommand);
        if (execPath) {
          stdout.write(`${searchedCommand} is ${execPath}\n`);
        } else {
          stderr.write(`${searchedCommand}: not found\n`);
        }
      }
      return;
    }
  }
}

export function loadHistoryFromFile(
  shellState: ShellState,
  historyFile: string | undefined,
): void {
  if (!historyFile) return;

  try {
    const data = fs.readFileSync(historyFile, "utf-8");
    shellState.history.push(...data.split("\n").filter(Boolean));
  } catch {}
}

export function persistHistoryToFile(
  shellState: ShellState,
  historyFile: string | undefined,
): void {
  if (!historyFile) return;

  fs.writeFileSync(
    historyFile,
    shellState.history.slice(shellState.lastAppendedIdx).join("\n") + "\n",
    { flag: "w+" },
  );
}
