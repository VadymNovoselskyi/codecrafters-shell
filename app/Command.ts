import { spawn } from "child_process";
import { isBuiltin, runBuiltin } from "./builtins";
import { ShellState } from "./ShellState";
import { getExecPath } from "./pathHelpers";

export class Command {
	executable: string;
	args: string[];
	nextCommand?: Command;
	nextCommandCondition?: "&&" | "||" | ";";

	constructor(
		command: string,
		args: string[],
		nextCommand?: Command,
		nextCommandCondition?: "&&" | "||" | ";",
	) {
		this.executable = command;
		this.args = args;
		this.nextCommand = nextCommand;
		this.nextCommandCondition = nextCommandCondition;
	}

	getLastCommand(): Command {
		let command: Command = this;
		while (command.nextCommand) {
			command = command.nextCommand;
		}
		return command;
	}

	async run(
		shellState: ShellState,
		streams: {
			stdin?: NodeJS.ReadableStream;
			stdout: NodeJS.WritableStream;
			stderr: NodeJS.WritableStream;
		},
	): Promise<number> {
		const { stdin, stdout, stderr } = streams;
		if (this.shouldRunInBackground()) {
			let currentBackgroundJobSeq = shellState.bgJobs.getNextSeq();
			const pid = this.runBackgroundProcess(
				this,
				() => {
					const job = shellState.bgJobs.getBySeq(currentBackgroundJobSeq);
					if (!job) return;
					job.status = "Done";
				},
				{ stdin, stdout, stderr },
			);
			stdout.write(`[${currentBackgroundJobSeq}] ${pid}\n`);

			shellState.bgJobs.push({
				seq: currentBackgroundJobSeq,
				pid: pid!,
				status: "Running",
				commandStr: this.buildCommandStr(),
			});
			return 0;
		}

		let command: Command | undefined = this;
		let result = 0;
		let condition: "&&" | "||" | ";" | undefined = undefined;
		while (
			command &&
			!(result !== 0 && condition === "&&") &&
			!(result === 0 && condition === "||")
		) {
			if (isBuiltin(command.executable)) {
				result = runBuiltin(command.executable, command.args, {
					shellState,
					stdout,
					stderr,
				});
			} else if (getExecPath(command.executable)) {
				const proc = spawn(command.executable, command.args, {
					stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
				});
				if (stdin) stdin.pipe(proc.stdin!);

				if (proc.stdout) proc.stdout.pipe(stdout, { end: false });
				if (proc.stderr) proc.stderr.pipe(stderr, { end: false });

				const code = await new Promise<number>((resolve) => {
					proc.on("close", (code) => resolve(code ?? 0));
					proc.on("error", () => resolve(1));
				});
				result = code;
			} else {
				stderr.write(`${command.executable}: command not found\n`);
				result = 127;
			}
			condition = command?.nextCommandCondition;
			command = command.nextCommand;
		}

		if (stdout !== process.stdout) stdout.end();
		if (stderr !== process.stderr) stderr.end();
		return result;
	}

	private shouldRunInBackground(): boolean {
		let args: string[] | undefined = this.args;
		let nextCommand: Command | undefined = this.nextCommand;

		do {
			if (args[args.length - 1] === "&") {
				args.pop();
				return true;
			}

			args = nextCommand?.args;
			nextCommand = nextCommand?.nextCommand;
		} while (args);
		return false;
	}

	private runBackgroundProcess(
		command: Command | undefined,
		finalCallback: () => void,
		streams: {
			stdin?: NodeJS.ReadableStream;
			stdout: NodeJS.WritableStream;
			stderr: NodeJS.WritableStream;
		},
	): number | undefined {
		const { stdin, stdout, stderr } = streams;
		if (!command) {
			finalCallback();
			return;
		}

		const proc = spawn(command.executable, command.args, {
			stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
		});
		if (stdin) stdin.pipe(proc.stdin!);

		if (proc.stdout) {
			proc.stdout.on("data", (chunk: Buffer | string) => {
				stdout.write(chunk);
			});
			proc.stdout.on("end", () => {
				if (stdout !== process.stdout && !command.nextCommand) stdout.end();
			});
		}
		if (proc.stderr) {
			proc.stderr.on("data", (chunk: Buffer | string) => {
				stderr.write(chunk);
			});
			proc.stderr.on("end", () => {
				if (stderr !== process.stderr && !command.nextCommand) stderr.end();
			});
		}

		proc.on("close", (code) => {
			if (code !== 0 && command.nextCommandCondition === "&&") {
				finalCallback();
				return;
			}
			if (code === 0 && command.nextCommandCondition === "||") {
				finalCallback();
				return;
			}

			this.runBackgroundProcess(command.nextCommand, finalCallback, {
				stdin,
				stdout,
				stderr,
			});
		});

		return proc.pid;
	}

	private buildCommandStr(): string {
		let commandStr = "";

		let currentCommand: Command | undefined = this;
		let nextCommand = this.nextCommand;
		do {
			commandStr += `${currentCommand.executable} ${currentCommand.args.join(" ")} ${currentCommand.nextCommandCondition ? ` ${currentCommand.nextCommandCondition} ` : ""}`;
			currentCommand = nextCommand;
			nextCommand = currentCommand?.nextCommand;
		} while (currentCommand);
		return commandStr;
	}
}
