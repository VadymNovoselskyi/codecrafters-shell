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
      console.log(`cd: ${path}: No such file or directory`);
    }
  },
  pwd: (args: string[]) => console.log(process.cwd()),
  echo: (args: string[]) => console.log(args.join(" ")),
  exit: (args: string[]) => {
    rl.close();
    process.exit(0);
  },
  type: (args: string[]) => {
    const searchedCommand = args[0];
    if (builtins.includes(searchedCommand)) {
      console.log(`${searchedCommand} is a shell builtin`);
    } else if (findExecPath(searchedCommand)) {
      const execPath = findExecPath(searchedCommand);
      console.log(`${searchedCommand} is ${execPath}`);
    } else {
      console.log(`${searchedCommand}: not found`);
    }
  },
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

rl.prompt();

rl.on("line", async (commandsStr) => {
  const [command, ...argsUnparsed] = commandsStr.split(" ");
  const args = normalizeArgs(argsUnparsed.join(" "));

  if (builtins.includes(command)) {
    handlers[command].call(this, args);
  } else {
    if (findExecPath(command)) {
      const proc = Bun.spawn([command, ...args]);
      const output = await new Response(proc.stdout).text();
      process.stdout.write(output);
    } else {
      console.log(`${command}: command not found`);
    }
  }

  rl.prompt();
});

function normalizeArgs(argsStr: string): string[] {
  argsStr = argsStr.replace(/''|""/g, "");

  const args: string[] = [""];
  let wordIndex = 0;
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  // let inSingleQuotes = false;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    // console.log(`char: ${char}`);

    if (char == "\'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char == '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char == "\\") {
      if (!inSingleQuotes && !inDoubleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[++i]);
      }
      else if (inSingleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[i]);
      }
      else if (inDoubleQuotes && argsStr[i+1] == "\"" || argsStr[i+1] == "\\") {
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
  // // The String.raw`` and otherWordsMatch is gen by ChatGPT
  // const singleQuotesMatch = String.raw`'[^']+'`;
  // const singleQuotesCapture = String.raw`'([^']+)'`;

  // const doubleQuotesMatch = String.raw`"[^"]+"`;
  // const doubleQuotesCapture = String.raw`"([^"]+)"`;

  // const otherWordsMatch = String.raw`((?:${singleQuotesMatch}|${doubleQuotesMatch}|[^\s\\]+|\\.)+)`;
  // const tokenMatch = new RegExp(
  //   `${singleQuotesCapture}|${doubleQuotesCapture}|${otherWordsMatch}`,
  //   "g",
  // );
  // const args = [...argsStr.matchAll(tokenMatch)].map((m) => {
  //   console.log(m);
  //   return m[1] ?? m[2] ?? m[3].replace(/\\(.)/g, "$1");
  // });

  // // The backslash stripping is also done by ChatGPT
  // // return args.map((arg) => arg.replace(/\\(.)/g, "$1"));
  // console.log(args);
  // return args;
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
