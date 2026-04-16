import fs from "fs";
import { Command } from "./Command";

export function parseInput(input: string): Command[] {
	const results: Command[] = [];

	for (const pipe of input.split(" | ")) {
		let prevCommand: Command | null = null;

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

			const commandResult = new Command(command, args);
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
