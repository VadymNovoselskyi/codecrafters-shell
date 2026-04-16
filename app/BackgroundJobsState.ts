export type BackgroundJob = {
	seq: number;
	pid: number;
	status: "Running" | "Done";
	commandStr: string;
};

export class BackgroundJobsState {
	backgroundJobs: BackgroundJob[];

	constructor() {
		this.backgroundJobs = [];
	}

	get length(): number {
		return this.backgroundJobs.length;
	}

	get(index: number): BackgroundJob | undefined {
		return this.backgroundJobs[index];
	}

	getBySeq(seq: number): BackgroundJob | undefined {
		return this.backgroundJobs.find((job) => job.seq === seq);
	}

	filterRunning(): void {
		this.backgroundJobs = this.backgroundJobs.filter(
			(job) => job.status === "Running",
		);
	}

	push(job: BackgroundJob): void {
		this.backgroundJobs.push(job);
		this.backgroundJobs.sort((a, b) => a.seq - b.seq);
	}

	getNextSeq(): number {
		for (let i = 1; i <= this.backgroundJobs.length; i++) {
			if (this.backgroundJobs[i - 1].seq !== i) return i;
		}
		return this.backgroundJobs.length + 1;
	}

	printJobs(stdout: NodeJS.WritableStream): void {
		for (let index = 0; index < this.backgroundJobs.length; index++) {
			const job = this.backgroundJobs[index];
			stdout.write(this.toString(job, index));
		}
	}

	printDoneJobs(stdout: NodeJS.WritableStream): void {
		for (let index = 0; index < this.backgroundJobs.length; index++) {
			const job = this.backgroundJobs[index];
			if (job.status !== "Done") continue;

			stdout.write(this.toString(job, index));
		}
	}

	private toString(job: BackgroundJob, index: number): string {
		let marker = " ";
		if (index === this.length - 2) marker = "-";
		else if (index === this.length - 1) marker = "+";
		return `[${job.seq}]${marker}  ${job.status.padEnd(24)}${job.commandStr}\n`;
	}
}
