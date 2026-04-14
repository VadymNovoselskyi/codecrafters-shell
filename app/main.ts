import fs from "fs";
import path from "path";
import { ChildProcess, spawn } from "child_process";
import { PassThrough } from "stream";
import {
	isBuiltin,
	loadHistoryFromFile,
	persistHistoryToFile,
	runBuiltin,
	type ShellState,
} from "./builtins";
import { handleAutocomplete } from "./autocomplete";
import { parseInput, type CommandObj } from "./parse";
import { createInterface } from "readline";

const shellState: ShellState = {
	history: [],
	lastAppendedIdx: 0,
	exitRequested: false,
	backgroundJobSeq: 1,
};

loadHistoryFromFile(shellState, process.env.HISTFILE);

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: "$ ",
	completer: (line: string) =>
		handleAutocomplete(line, {
			write: (text: string) => fs.writeSync(1, text),
			redraw: (lineToDraw: string) => {
				rl.write(null, { ctrl: true, name: "u" });
				rl.prompt();
				rl.write(lineToDraw);
			},
		}),
});
rl.prompt();

rl.on("line", async (input) => {
	shellState.history.push(input);
	shellState.exitRequested = false;

	const stages = parseInput(input);
	const runs: Promise<number>[] = [];
	let upstream: NodeJS.ReadableStream | undefined;

	for (let i = 0; i < stages.length; i++) {
		const { command, args, nextCommand } = stages[i];
		const { stdout: redirectedStdout, stderr: redirectedStderr } =
			handleStreamRedirect(args);

		const isLastStage = i === stages.length - 1;
		const nextPipe =
			!isLastStage && !redirectedStdout ? new PassThrough() : undefined;
		const stdoutTarget = redirectedStdout ?? nextPipe ?? process.stdout;
		const stderrTarget = redirectedStderr ?? process.stderr;

		runs.push(
			run(command, args, nextCommand, upstream, stdoutTarget, stderrTarget),
		);

		if (shellState.exitRequested) {
			break;
		}

		if (!isLastStage) {
			if (nextPipe) {
				upstream = nextPipe;
			} else {
				const empty = new PassThrough();
				empty.end();
				upstream = empty;
			}
		}
	}

	if (runs.length > 0) {
		await runs[runs.length - 1];
	}

	if (shellState.exitRequested) {
		rl.close();
		return;
	}

	rl.prompt();
});

rl.on("close", () => {
	persistHistoryToFile(shellState, process.env.HISTFILE);
	process.exit(0);
});

async function run(
	command: string,
	args: string[],
	nextCommand: CommandObj | undefined,
	stdin: NodeJS.ReadableStream | undefined,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
): Promise<number> {
	const runInBackground = shouldRunInBackground(args, nextCommand);

	if (isBuiltin(command) && !runInBackground) {
		runBuiltin(command, args, {
			stdout,
			stderr,
			findExecPath,
			shellState,
		});

		if (stdout !== process.stdout) stdout.end();
		if (stderr !== process.stderr) stderr.end();
		return 0;
	}

	if (findExecPath(command)) {
		// console.log(
		// 	`Original: command: ${command}; args: ${args.join(", ")}; nextCommand: ${JSON.stringify(nextCommand)}`,
		// );
		const proc = spawn(command, args, {
			stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
		});
		if (stdin) stdin.pipe(proc.stdin!);

		if (runInBackground) {
			proc.on("close", () => {
				// console.log("Orig closed, running the next one: ");

				if (proc.stdout) {
					proc.stdout.pipe(stdout, { end: stdout !== process.stdout });
				}
				if (proc.stderr) {
					proc.stderr.pipe(stderr, { end: stderr !== process.stderr });
				}
				runNextOrEnd(nextCommand, stdout, stderr);
			});

			stdout.write(`[${shellState.backgroundJobSeq}] ${proc.pid}\n`);

			shellState.backgroundJobSeq += 1;
			return 0;
		}

		if (proc.stdout) {
			proc.stdout.pipe(stdout, { end: stdout !== process.stdout });
		}
		if (proc.stderr) {
			proc.stderr.pipe(stderr, { end: stderr !== process.stderr });
		}

		return await new Promise<number>((resolve) => {
			proc.on("close", (code) => resolve(code ?? 0));
			proc.on("error", () => resolve(1));
		});
	}

	stderr.write(`${command}: command not found\n`);
	if (stderr !== process.stderr) stderr.end();
	if (stdout !== process.stdout) stdout.end();
	return 127;
}

function shouldRunInBackground(
	args: string[],
	nextCommand: CommandObj | undefined,
): boolean {
	let runInBackground = false;
	let _args: string[] | undefined = args;

	do {
		if (_args[_args.length - 1] === "&") {
			_args.pop();
			runInBackground = true;
			break;
		}

		_args = nextCommand?.args;
		nextCommand = nextCommand?.nextCommand;
	} while (_args);
	return runInBackground;
}

function runNextOrEnd(
	commandObj: CommandObj | undefined,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
) {
	if (!commandObj) return;
	// console.log(
	// 	`Next: command: ${commandObj.command}; args: ${commandObj.args.join(", ")}`,
	// );

	const proc = spawn(commandObj.command, commandObj.args, {
		stdio: ["inherit", "pipe", "pipe"],
	});

	proc.stdout.on("data", (chunk: Buffer | string) => {
		stdout.write(chunk);
	});
	proc.stdout.on("end", () => {
		if (stdout !== process.stdout) stdout.end();
	});

	proc.stderr.on("data", (chunk: Buffer | string) => {
		stderr.write(chunk);
	});
	proc.stderr.on("end", () => {
		if (stderr !== process.stderr) stderr.end();
	});

	proc.on("close", () => {
		// console.log(`command ${commandObj.command} closed`);
		runNextOrEnd(commandObj.nextCommand, stdout, stderr);
	});
}

function handleStreamRedirect(args: string[]): {
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

	fs.writeFileSync(outFile, "", { flag });

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

function findExecPath(searchedCommand: string): string | undefined {
	const paths = process.env.PATH?.split(path.delimiter);
	if (!paths) {
		return;
	}

	for (const pathEntry of paths) {
		if (!fs.existsSync(pathEntry)) continue;

		const contents = fs.readdirSync(pathEntry);
		if (!contents.includes(searchedCommand)) continue;

		try {
			fs.accessSync(`${pathEntry}/${searchedCommand}`, fs.constants.X_OK);
		} catch {
			continue;
		}

		return `${pathEntry}/${searchedCommand}`;
	}
}
