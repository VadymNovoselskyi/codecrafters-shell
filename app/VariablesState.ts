export class VariablesState {
  private variables: Record<string, string>;

  constructor() {
    this.variables = {};
  }

  setVariable(name: string, value: string): void {
    this.variables[name] = value;
  }

  getVariable(name: string): string {
    const value = this.variables[name];
    if (!value) {
      throw Error(`No Variables path was found for command: ${name}`);
    }

    return value;
  }
}
