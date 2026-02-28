export function parseInput(input: string): [string, string[]][] {
  const results: [string, string[]][] = [];

  for (const pipe of input.split(" | ")) {
    let command: string;
    let argsUnparsed: string[];

    if (pipe.startsWith("'") || pipe.startsWith('"')) {
      const match = pipe.match(/'([^']+)'|"([^"]+)"/);
      if (!match?.[1] && !match?.[2]) {
        throw Error(`Error parsing input (smth witn quotes): ${pipe}`);
      }

      command = (match[1] ?? match[2]).replace(/\\(.)/g, "$1");
      argsUnparsed = pipe.substring(command.length + 3).split(" ");
    } else {
      [command, ...argsUnparsed] = pipe.split(" ");
    }

    const args = normalizeArgs(argsUnparsed.join(" "));
    results.push([command, args]);
  }

  return results;
}

function normalizeArgs(argsStr: string): string[] {
  argsStr = argsStr.replace(/''|""/g, "");

  const args: string[] = [""];
  let wordIndex = 0;
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === "\\") {
      if (!inSingleQuotes && !inDoubleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[++i]);
      } else if (inSingleQuotes) {
        args[wordIndex] = args[wordIndex].concat(argsStr[i]);
      } else if (
        (inDoubleQuotes && argsStr[i + 1] === '"') ||
        argsStr[i + 1] === "\\"
      ) {
        args[wordIndex] = args[wordIndex].concat(argsStr[++i]);
      }
    } else if (/\S/.test(char) || inSingleQuotes || inDoubleQuotes) {
      args[wordIndex] = args[wordIndex].concat(char);
    } else if (char === " " && args[wordIndex].length !== 0) {
      args.push("");
      wordIndex++;
    }
  }

  return args.filter(Boolean);
}
