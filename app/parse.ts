import fs from "fs";
import { Command } from "./Command";

export function parseInput(input: string): Command[] {
	const results: Command[] = [];

	// Split on | only when it is not part of || (list OR) (chat GPT)
	for (const pipe of input.split(/\s*(?<!\|)\|(?!\|)\s*/)) {
		let prevCommand: Command | null = null;

		// Split on whitespace followed by &&, ||, or ;
		const commandObjs = pipe.split(/\s*(&&|\|\||;)\s*/);
		for (let i = 0; i < commandObjs.length; i += 2) {
			const commandObj = commandObjs[i];
			const nextCommandCondition = commandObjs[i + 1] as "&&" | "||" | ";";
			let command: string;
			let argsUnparsed: string[];

			if (commandObj.startsWith("'") || commandObj.startsWith('"')) {
				// Extract the quoted string
				const match = commandObj.match(/'([^']+)'|"([^"]+)"/);
				if (!match?.[1] && !match?.[2]) {
					throw Error(`Error parsing input (smth witin quotes): ${commandObj}`);
				}

				// Remove backslashes from the quoted string
				command = (match[1] ?? match[2]).replace(/\\(.)/g, "$1");
				argsUnparsed = commandObj.substring(command.length + 3).split(" ");
			} else {
				[command, ...argsUnparsed] = commandObj.split(" ");
			}

			const args = normalizeArgs(argsUnparsed.join(" "));

			const commandResult = new Command(
				command,
				args,
				undefined,
				nextCommandCondition,
			);
			if (prevCommand) prevCommand.nextCommand = commandResult;
			else results.push(commandResult);

			prevCommand = commandResult;
		}
	}

	return results;
}

function normalizeArgs(argsStr: string): string[] {
	// Remove single and double quotes
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

export function getStreamTargets(args: string[]): {
	stdout: NodeJS.WritableStream | undefined;
	stderr: NodeJS.WritableStream | undefined;
} {
	if (
		!(
			args.includes(">") ||
			args.includes("1>") ||
			args.includes("2>") ||
			args.includes(">>") ||
			args.includes("1>>") ||
			args.includes("2>>")
		)
	) {
		return { stdout: undefined, stderr: undefined };
	}

	const outFile = args[args.length - 1];
	const flag =
		args.includes(">") || args.includes("1>") || args.includes("2>")
			? "w+"
			: "a+";

	if (args.includes("2>") || args.includes("2>>")) {
		args.splice(-2);
		return {
			stdout: undefined,
			stderr: fs.createWriteStream(outFile, { flags: flag }),
		};
	}

	args.splice(-2);
	return {
		stdout: fs.createWriteStream(outFile, { flags: flag }),
		stderr: undefined,
	};
}
