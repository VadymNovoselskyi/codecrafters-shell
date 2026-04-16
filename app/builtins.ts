import fs from "fs";
import type { ShellState } from "./ShellState";
import { getExecPath } from "./pathHelpers";

export const BUILTINS = [
	"cd",
	"pwd",
	"echo",
	"history",
	"jobs",
	"exit",
	"type",
] as const;

type BuiltinName = (typeof BUILTINS)[number];

export type BuiltinContext = {
	shellState: ShellState;
	stdout: NodeJS.WritableStream;
	stderr: NodeJS.WritableStream;
};

export function isBuiltin(command: string): command is BuiltinName {
	return BUILTINS.includes(command as BuiltinName);
}

export function runBuiltin(
	command: BuiltinName,
	args: string[],
	context: BuiltinContext,
): number {
	const { shellState, stdout, stderr } = context;

	switch (command) {
		case "cd": {
			let targetPath = args[0] ?? "";
			if (targetPath.startsWith("~")) {
				targetPath = `${process.env.HOME ?? ""}${targetPath.substring(1)}`;
			}

			if (targetPath && fs.existsSync(targetPath)) {
				process.chdir(targetPath);
			} else {
				stderr.write(`cd: ${targetPath}: No such file or directory\n`);
				return 1;
			}
			return 0;
		}

		case "pwd": {
			stdout.write(process.cwd() + "\n");
			return 0;
		}

		case "echo": {
			stdout.write(args.join(" ") + "\n");
			return 0;
		}

		case "history": {
			const mode = args[0];
			if (mode === "-r") {
				const filepath = args[1];
				try {
					shellState.history.load(filepath);
				} catch (error) {
					stderr.write(`Error reading file: ${error}\n`);
					return 1;
				}
				return 0;
			}

			if (mode === "-w" || mode === "-a") {
				const filepath = args[1];
				try {
					shellState.history.persist(filepath, mode === "-w" ? "w" : "a");
				} catch (error) {
					stderr.write(`Error writing file: ${error}\n`);
					return 1;
				}
				return 0;
			}

			const history = shellState.history.getHistory(Number(args[0]));
			const offset = shellState.history.length - history.length;
			for (let i = 0; i < history.length; i++) {
				stdout.write(`    ${i + offset + 1}  ${history[i]}\n`);
			}
			return 0;
		}

		case "jobs": {
			shellState.bgJobs.printJobs(stdout);
			shellState.bgJobs.filterRunning();
			return 0;
		}

		case "exit": {
			shellState.exitRequested = true;
			return 0;
		}

		case "type": {
			const searchedCommand = args[0];
			if (isBuiltin(searchedCommand)) {
				stdout.write(`${searchedCommand} is a shell builtin\n`);
			} else {
				const execPath = getExecPath(searchedCommand);
				if (execPath) {
					stdout.write(`${searchedCommand} is ${execPath}\n`);
				} else {
					stderr.write(`${searchedCommand}: not found\n`);
					return 1;
				}
			}
			return 0;
		}
	}
	return 1;
}
