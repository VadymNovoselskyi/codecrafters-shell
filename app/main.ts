import { createInterface } from "readline";

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
      builtins.includes(args[0])
        ? console.log(`${args[0]} is a shell builtin`)
        : console.log(`${args[0]}: not found`);

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
