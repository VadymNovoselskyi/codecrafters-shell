import { createInterface } from "readline";
import fs from "fs";
import path from "path";

const builtins = ["echo", "exit", "type"];
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

rl.prompt();

rl.on("line", async (commandsStr) => {
  const [command, ...args] = commandsStr.split(" ");

  switch (command) {
    case "exit":
      rl.close();
      break;
    case "echo":
      console.log(args.join(" "));
      rl.prompt();
      break;
    case "type":
      const searchedCommand = args[0];

      if (builtins.includes(searchedCommand)) {
        console.log(`${searchedCommand} is a shell builtin`);
      } else if (findExecPath(searchedCommand)) {
        const execPath = findExecPath(searchedCommand);
        console.log(`${searchedCommand} is ${execPath}`);
      } else {
        console.log(`${searchedCommand}: not found`);
      }

      rl.prompt();
      break;
    default:
      if (findExecPath(command)) {
        const execPath = findExecPath(command);
        const proc = Bun.spawn([command, ...args]);
        const output = await new Response(proc.stdout).text()
        console.log(output)
      } else {
        console.log(`${command}: command not found`);
      }

      rl.prompt();
  }
});

rl.on("close", () => {
  process.exit(0);
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
