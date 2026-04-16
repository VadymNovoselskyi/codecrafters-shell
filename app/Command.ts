import { spawn } from "child_process";
import { isBuiltin, runBuiltin } from "./builtins";
import { ShellState } from "./ShellState";
import { getExecPath } from "./helpers";

export class Command {
	executable: string;
	args: string[];
	nextCommand?: Command;

	constructor(command: string, args: string[], nextCommand?: Command) {
		this.executable = command;
		this.args = args;
		this.nextCommand = nextCommand;
	}

	async run(
		shellState: ShellState,
		stdin: NodeJS.ReadableStream | undefined,
		stdout: NodeJS.WritableStream,
		stderr: NodeJS.WritableStream,
	): Promise<number> {
		if (this.shouldRunInBackground()) {
			let currentBackgroundJobSeq = shellState.bgJobs.getNextSeq();
			const pid = this.runBackgroundProcess(
				this,
				() => {
					const job = shellState.bgJobs.getBySeq(currentBackgroundJobSeq);
					if (!job) return;
					job.status = "Done";
				},
				stdout,
				stderr,
				stdin,
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

		if (isBuiltin(this.executable)) {
			runBuiltin(this.executable, this.args, {
				shellState,
				stdout,
				stderr,
			});

			if (stdout !== process.stdout) stdout.end();
			if (stderr !== process.stderr) stderr.end();
			return 0;
		}

		if (getExecPath(this.executable)) {
			const proc = spawn(this.executable, this.args, {
				stdio: [stdin ? "pipe" : "inherit", "pipe", "pipe"],
			});
			if (stdin) stdin.pipe(proc.stdin!);

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

		stderr.write(`${this.executable}: command not found\n`);
		if (stdout !== process.stdout) stdout.end();
		if (stderr !== process.stderr) stderr.end();
		return 127;
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
		stdout: NodeJS.WritableStream,
		stderr: NodeJS.WritableStream,
		stdin?: NodeJS.ReadableStream,
	): number | undefined {
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
				if (stdout !== process.stdout) stdout.end();
			});
		}
		if (proc.stderr) {
			proc.stderr.on("data", (chunk: Buffer | string) => {
				stderr.write(chunk);
			});
			proc.stderr.on("end", () => {
				if (stderr !== process.stderr) stderr.end();
			});
		}

		proc.on("close", () => {
			this.runBackgroundProcess(
				command.nextCommand,
				finalCallback,
				stdout,
				stderr,
			);
		});

		return proc.pid;
	}

	private buildCommandStr(): string {
		let commandStr = "";

		let currentCommand: Command | undefined = this;
		let nextCommand = this.nextCommand;
		do {
			commandStr += `${currentCommand.executable} ${currentCommand.args.join(" ")} ${nextCommand ? "&& " : ""}`;

			currentCommand = nextCommand;
			nextCommand = currentCommand?.nextCommand;
		} while (currentCommand);
		return commandStr;
	}
}
