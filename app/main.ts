import { createInterface } from "readline";
import fs from "fs";
import path from "path";

const builtins = ["cd", "pwd", "echo", "exit", "type"];
const handlers: Record<string, Function> = {
  cd: (args: string[]) => {
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
  pwd: (args: string[]) => stdout.write(process.cwd() + "\n"),
  echo: (args: string[]) => stdout.write(args.join(" ") + "\n"),
  exit: (args: string[]) => {
    rl.close();
    process.exit(0);
  },
  type: (args: string[]) => {
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

let stdout: NodeJS.WriteStream | fs.WriteStream = process.stdout;
let stderr: NodeJS.WriteStream | fs.WriteStream = process.stdout;
const rl = createInterface({
  input: process.stdin,
  output: stdout,
  prompt: "$ ",
  completer: handleAutocomplete,
});
rl.prompt();

rl.on("line", async (input) => {
  const [command, args] = parseInput(input);
  handleStreamRedirect(args);

  if (builtins.includes(command)) {
    handlers[command].call(this, args);
  } else {
    if (findExecPath(command)) {
      const proc = Bun.spawn([command, ...args], {
        stdio: ["inherit", "pipe", "pipe"],
      });
      const output = await new Response(proc.stdout).text();
      const error = await new Response(proc.stderr).text();
      stdout.write(output);
      stderr.write(error);
    } else {
      stderr.write(`${command}: command not found` + "\n");
    }
  }

  stdout = process.stdout;
  stderr = process.stdout;
  rl.prompt();
});

function handleAutocomplete(line: string) {
  const [command, args] = parseInput(line);

  if (args.length === 1 && !args[0]) {
    const builtinHits = builtins
      .filter((cmd) => cmd.startsWith(command))
      .map((hit) => hit + " ");

    if (builtinHits.length) return [builtinHits, command];

    const pathHits = getPathExecs()
      .filter((cmd) => cmd.startsWith(command))
      .map((hit) => hit + " ");
    if (!pathHits.length) stdout.write("\x07");

    return [pathHits.length ? pathHits : [command], command];
  }

  return ["", args.join(" ")];
}

function parseInput(input: string): [string, string[]] {
  let command: string, argsUnparsed: string[];
  if (input.startsWith("'") || input.startsWith('"')) {
    // This is really not the best thing, but like how do we know what string to normalize?
    const match = input.match(/'([^']+)'|"([^"]+)"/);
    if (!match?.[1] && !match?.[2]) {
      throw Error(`Error parsing input (smth witn quotes): ${input}`);
    }
    command = match[1] ?? match[2].replace(/\\(.)/g, "$1");

    // Also the +3 here will break if more than one \\ escape
    argsUnparsed = input.substring(command.length + 3).split(" ");
  } else {
    [command, ...argsUnparsed] = input.split(" ");
  }
  // console.log(`command: '${command}'; argsUnparsed: "${argsUnparsed.join(" ")}"`);
  const args = normalizeArgs(argsUnparsed.join(" "));

  return [command, args];
}

function handleStreamRedirect(args: string[]): void {
  if (
    args.includes(">") ||
    args.includes("1>") ||
    args.includes("2>") ||
    args.includes(">>") ||
    args.includes("1>>") ||
    args.includes("2>>")
  ) {
    const outFile = args[args.length - 1];
    const flag =
      args.includes(">") || args.includes("1>") || args.includes("2>")
        ? "w+"
        : "a+";

    fs.writeFileSync(outFile, "", { flag });

    if (args.includes("2>") || args.includes("2>>"))
      stderr = fs.createWriteStream(outFile, { flags: flag });
    else stdout = fs.createWriteStream(outFile, { flags: flag });

    args.splice(-2);
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
