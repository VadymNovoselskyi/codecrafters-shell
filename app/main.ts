import { createInterface } from "readline";
import fs from "fs";
import path from "path";

const builtins = ["cd", "pwd", "echo", "exit", "type"];
const handlers: Record<string, Function> = {
  cd: (args: string[]) => {
    if (fs.existsSync(args[0])) {
      process.chdir(args[0]);
    } else {
      console.log(`cd: ${args[0]}: No such file or directory`);
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
  const [command, ...args] = commandsStr.split(" ");

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
