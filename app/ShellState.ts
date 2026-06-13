import { BackgroundJobsState } from "./BackgroundJobsState";
import { CompletionState } from "./CompletionState";
import { HistoryState } from "./HistoryState";

export class ShellState {
  history: HistoryState;
  bgJobs: BackgroundJobsState;
  completionState: CompletionState;
  exitRequested: boolean;

  constructor() {
    this.history = new HistoryState();
    this.bgJobs = new BackgroundJobsState();
    this.completionState = new CompletionState();
    this.exitRequested = false;
  }
}
