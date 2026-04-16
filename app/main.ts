import fs from "fs";
import { PassThrough } from "stream";
import { handleAutocomplete } from "./autocomplete";
import { getStreamTargets, parseInput } from "./parse";
import { createInterface } from "readline";
import { ShellState } from "./ShellState";

const shellState = new ShellState();

shellState.history.load(process.env.HISTFILE);

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
		const command = stages[i];
		const { stdout: redirectedStdout, stderr: redirectedStderr } =
			getStreamTargets(command.args);

		const isLastStage = i === stages.length - 1;
		const nextPipe =
			!isLastStage && !redirectedStdout ? new PassThrough() : undefined;
		const stdoutTarget = redirectedStdout ?? nextPipe ?? process.stdout;
		const stderrTarget = redirectedStderr ?? process.stderr;

		runs.push(command.run(shellState, upstream, stdoutTarget, stderrTarget));

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

	shellState.bgJobs.printDoneJobs(process.stdout);
	shellState.bgJobs.filterRunning();
	rl.prompt();
});

rl.on("close", () => {
	shellState.history.persist(process.env.HISTFILE);
	process.exit(0);
});
