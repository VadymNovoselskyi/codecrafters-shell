import { createInterface } from "readline";
import fs from "fs";

const builtins = ["echo", "exit", "type"];
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

rl.prompt();

rl.on("line", (commandsStr) => {
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
      let commandFound = false;
      const searchedCommand = args[0];

      if (builtins.includes(searchedCommand)) {
        console.log(`${searchedCommand} is a shell builtin`);
        commandFound = true;
      } else {
        const paths = process.env.PATH?.split(":");
        if (!paths) {
          break;
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

          commandFound = true
          console.log(`${searchedCommand} is ${path}/${searchedCommand}`);
          break;
        }
      }

      if (!commandFound) {
        console.log(`${searchedCommand}: not found`);
      }
      rl.prompt();
      break;
    default:
      console.log(`${command}: command not found`);
      rl.prompt();
  }
});

rl.on("close", () => {
  process.exit(0);
});
