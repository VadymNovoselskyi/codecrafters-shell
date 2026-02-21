import { createInterface } from "readline";

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
    default:
      console.log(`${command}: command not found`);
      rl.prompt();
    }
});

rl.on("close", () => {
  process.exit(0);
});
