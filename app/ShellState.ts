import { BackgroundJobsState } from "./BackgroundJobsState";
import { HistoryState } from "./HistoryState";

export class ShellState {
	history: HistoryState;
	bgJobs: BackgroundJobsState;
	exitRequested: boolean;

	constructor() {
		this.history = new HistoryState();
		this.bgJobs = new BackgroundJobsState();
		this.exitRequested = false;
	}
}
