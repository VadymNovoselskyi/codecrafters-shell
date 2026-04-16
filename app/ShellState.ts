import { HistoryState } from "./HistoryState";

export class ShellState {
	history: HistoryState;
	backgroundJobs: {
		seq: number;
		pid: number;
		status: "Running" | "Done";
		commandStr: string;
	}[];
	exitRequested: boolean;

	constructor() {
		this.history = new HistoryState();
		this.backgroundJobs = [];
		this.exitRequested = false;
	}
}
