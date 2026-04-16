import fs from "fs";

export class HistoryState {
	private history: string[];
	private lastAppendedIdx: number;

	constructor() {
		this.history = [];
		this.lastAppendedIdx = 0;
	}

	push(command: string): void {
		this.history.push(command);
	}

	getHistory(length: number = this.history.length): string[] {
		const amount = Math.min(this.history.length, length);
		return this.history.slice(-amount);
	}

	get length(): number {
		return this.history.length;
	}

	load(historyFile: string | undefined): void {
		if (!historyFile) return;

		const data = fs.readFileSync(historyFile, "utf-8");
		this.history.push(...data.split("\n").filter(Boolean));
	}

	persist(historyFile: string | undefined, mode: "w" | "a" = "w"): void {
		if (!historyFile) return;

		fs.writeFileSync(
			historyFile,
			this.history.slice(this.lastAppendedIdx).join("\n") + "\n",
			{ flag: mode === "w" ? "w+" : "a+" },
		);
		this.lastAppendedIdx = this.history.length;
	}
}
