import { BackgroundJobsState } from "./BackgroundJobsState";
import { CompletionState } from "./CompletionState";
import { HistoryState } from "./HistoryState";
import { VariablesState } from "./VariablesState";

export class ShellState {
  history: HistoryState;
  bgJobs: BackgroundJobsState;
  completionState: CompletionState;
  variablesState: VariablesState;
  exitRequested: boolean;

  constructor() {
    this.history = new HistoryState();
    this.bgJobs = new BackgroundJobsState();
    this.completionState = new CompletionState();
    this.variablesState = new VariablesState();
    this.exitRequested = false;
  }
}
