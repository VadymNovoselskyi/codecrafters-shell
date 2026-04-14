export type CommandObj = {
	command: string;
	args: string[];
	nextCommand?: CommandObj;
};

export function parseInput(input: string): CommandObj[] {
	const results: CommandObj[] = [];

	for (const pipe of input.split(" | ")) {
		let prevCommand: CommandObj | null = null;

		for (const commandObj of pipe.split(" && ")) {
			let command: string;
			let argsUnparsed: string[];

			if (commandObj.startsWith("'") || commandObj.startsWith('"')) {
				const match = commandObj.match(/'([^']+)'|"([^"]+)"/);
				if (!match?.[1] && !match?.[2]) {
					throw Error(`Error parsing input (smth witn quotes): ${commandObj}`);
				}

				command = (match[1] ?? match[2]).replace(/\\(.)/g, "$1");
				argsUnparsed = commandObj.substring(command.length + 3).split(" ");
			} else {
				[command, ...argsUnparsed] = commandObj.split(" ");
			}

			const args = normalizeArgs(argsUnparsed.join(" "));

			const commandResult: CommandObj = { command, args };
			if (prevCommand) prevCommand.nextCommand = commandResult;
			else results.push(commandResult);

			prevCommand = commandResult;
		}
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
