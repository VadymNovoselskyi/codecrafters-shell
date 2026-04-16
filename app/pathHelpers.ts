import fs from "fs";
import path from "path";

export function getExecPath(searchedCommand: string): string | undefined {
	const paths = process.env.PATH?.split(path.delimiter);
	if (!paths) {
		return;
	}

	for (const pathEntry of paths) {
		if (!fs.existsSync(pathEntry)) continue;

		const contents = fs.readdirSync(pathEntry);
		if (!contents.includes(searchedCommand)) continue;

		try {
			fs.accessSync(`${pathEntry}/${searchedCommand}`, fs.constants.X_OK);
		} catch {
			continue;
		}

		return `${pathEntry}/${searchedCommand}`;
	}
}

export function getPathExecs(): string[] {
	const results: string[] = [];
	const paths = process.env.PATH?.split(path.delimiter);
	if (!paths) {
		return [];
	}

	for (const pathEntry of paths) {
		if (!fs.existsSync(pathEntry)) continue;

		const executables = fs.readdirSync(pathEntry);
		for (const executable of executables) {
			try {
				fs.accessSync(`${pathEntry}/${executable}`, fs.constants.X_OK);
				if (!results.includes(executable)) results.push(executable);
			} catch {
				continue;
			}
		}
	}

	return results;
}
