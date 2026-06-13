export class CompletionState {
  private completions: Record<string, string>;

  constructor() {
    this.completions = {};
  }

  setCompletion(command: string, path: string): void {
    this.completions[command] = path;
  }

  getCompletion(command: string): string {
    const path = this.completions[command];
    if (!path) {
      throw Error(`No completion path was found for command: ${command}`);
    }

    return path;
  }
}
