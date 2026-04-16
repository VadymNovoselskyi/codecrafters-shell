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
