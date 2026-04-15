import fs from "fs";

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

export type ShellState = {
	history: string[];
	lastAppendedIdx: number;
	exitRequested: boolean;
	backgroundJobs: {
		seq: number;
		pid: number;
		status: "Running" | "Done";
		commandStr: string;
	}[];
};

export type BuiltinContext = {
	stdout: NodeJS.WritableStream;
	stderr: NodeJS.WritableStream;
	findExecPath: (command: string) => string | undefined;
	shellState: ShellState;
};

export function isBuiltin(command: string): command is BuiltinName {
	return BUILTINS.includes(command as BuiltinName);
}

export function runBuiltin(
	command: BuiltinName,
	args: string[],
	context: BuiltinContext,
): void {
	const { stdout, stderr, findExecPath, shellState } = context;

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
			}
			return;
		}

		case "pwd": {
			stdout.write(process.cwd() + "\n");
			return;
		}

		case "echo": {
			stdout.write(args.join(" ") + "\n");
			return;
		}

		case "history": {
			const mode = args[0];
			if (mode === "-r") {
				const filepath = args[1];
				try {
					const data = fs.readFileSync(filepath, "utf-8");
					shellState.history.push(...data.split("\n").filter(Boolean));
				} catch (error) {
					stderr.write(`Error reading file: ${error}\n`);
				}
				return;
			}

			if (mode === "-w" || mode === "-a") {
				const filepath = args[1];
				fs.writeFileSync(
					filepath,
					shellState.history.slice(shellState.lastAppendedIdx).join("\n") +
						"\n",
					{ flag: mode === "-w" ? "w+" : "a+" },
				);
				shellState.lastAppendedIdx = shellState.history.length;
				return;
			}

			const requestedAmount = Number(args[0] || shellState.history.length);
			const amount = Math.min(shellState.history.length, requestedAmount);
			for (
				let i = shellState.history.length - amount;
				i < shellState.history.length;
				i++
			) {
				stdout.write(`    ${i + 1}  ${shellState.history[i]}\n`);
			}
			return;
		}

		case "jobs": {
			for (let i = 0; i < shellState.backgroundJobs.length; i++) {
				const job = shellState.backgroundJobs[i];
				let marker = " ";
				if (i === shellState.backgroundJobs.length - 2) marker = "-";
				else if (i === shellState.backgroundJobs.length - 1) marker = "+";

				stdout.write(
					`[${job.seq}]${marker}  ${job.status.padEnd(24)}${job.commandStr}\n`,
				);
			}
			shellState.backgroundJobs = shellState.backgroundJobs.filter(
				(job) => job.status === "Running",
			);
			return;
		}

		case "exit": {
			shellState.exitRequested = true;
			return;
		}

		case "type": {
			const searchedCommand = args[0];
			if (isBuiltin(searchedCommand)) {
				stdout.write(`${searchedCommand} is a shell builtin\n`);
			} else {
				const execPath = findExecPath(searchedCommand);
				if (execPath) {
					stdout.write(`${searchedCommand} is ${execPath}\n`);
				} else {
					stderr.write(`${searchedCommand}: not found\n`);
				}
			}
			return;
		}
	}
}

export function printDoneJobs(
	shellState: ShellState,
	stdout: NodeJS.WritableStream,
) {
	for (let i = 0; i < shellState.backgroundJobs.length; i++) {
		const job = shellState.backgroundJobs[i];
		if (job.status !== "Done") continue;

		let marker = " ";
		if (i === shellState.backgroundJobs.length - 2) marker = "-";
		else if (i === shellState.backgroundJobs.length - 1) marker = "+";

		stdout.write(
			`[${job.seq}]${marker}  ${job.status.padEnd(24)}${job.commandStr}\n`,
		);
	}
	shellState.backgroundJobs = shellState.backgroundJobs.filter(
		(job) => job.status === "Running",
	);
	return;
}

export function findOpenJobSeq(backgroundJobs: ShellState["backgroundJobs"]) {
	for (let i = 1; i <= backgroundJobs.length; i++) {
		if (backgroundJobs[i - 1].seq !== i) return i;
	}
	return backgroundJobs.length + 1;
}

export function loadHistoryFromFile(
	shellState: ShellState,
	historyFile: string | undefined,
): void {
	if (!historyFile) return;

	try {
		const data = fs.readFileSync(historyFile, "utf-8");
		shellState.history.push(...data.split("\n").filter(Boolean));
	} catch {}
}

export function persistHistoryToFile(
	shellState: ShellState,
	historyFile: string | undefined,
): void {
	if (!historyFile) return;

	fs.writeFileSync(
		historyFile,
		shellState.history.slice(shellState.lastAppendedIdx).join("\n") + "\n",
		{ flag: "w+" },
	);
}
