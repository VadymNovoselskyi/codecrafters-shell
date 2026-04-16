## Data flow (short)

1. `**main.ts**` reads a line, appends it to history, and parses it into a list of `**Command**` instances (pipeline stages).
2. For each stage, `**parse.getStreamTargets**` may open file streams for redirection; `**Command.run**` executes the stage (builtin, external process, or background job chain).
3. `**ShellState**` holds cross-command state: history and background jobs.

---

## `your_program.sh`

Local launcher used by the repo: runs `bun run …/app/main.ts`. Remote runs use CodeCrafters’ own runner; changing this script does not affect their environment.

---

## `app/main.ts`

**Role:** Entry point and REPL.

**Does:**

- Instantiates `**ShellState**`, loads history from `**HISTFILE**` if set.
- Configures `**readline**` and wires `**handleAutocomplete**` for Tab completion.
- On each line: pushes to history, `**parseInput**` → pipeline stages, then runs stages in order with `**PassThrough**` pipes between stages when there is no stdout redirection.
- Waits on the **last** stage’s promise only.
- On `**exit**` (via builtin), closes the readline interface; on close, persists history and exits.

---

## `app/parse.ts`

**Role:** Turn a single input string into executable units and handle simple redirection metadata.

**Does:**

- `**parseInput**` — Splits on `|` for pipelines. Each segment splits on `&&` into a chain of `**Command**` objects linked by `**nextCommand**`. Supports a leading quoted token for the executable name; remaining text is split and normalized into arguments.
- `**normalizeArgs**` — Walks the argument string with state for single/double quotes and backslashes, producing the final `args` array.
- `**getStreamTargets**` — If the args contain redirection operators, strips the last two tokens (operator + file) and returns `stdout` and/or `stderr` `**WriteStream`**s.

---

## `app/autocomplete.ts`

**Role:** Readline completer: Tab completion for command names and file paths.

**Does:**

- **Command position** (no args yet, line does not end with space): match `**BUILTINS`** prefix, then `**PATH**` executables (scan directories, dedupe); single match completes with a space; multiple matches print a list or extend the longest common prefix; no match rings the bell (`\x07`).
- **Argument position:** Complete the last token as a path under the current directory or a directory prefix; directories get a trailing `/`; ambiguous Tab cycles bell then listing on second press (`**filepathTabState`**).

---

## `app/Command.ts`

**Role:** One pipeline stage: executable name, arguments, and optional next command for `&&` chains.

**Does:** Runs the stage as a background job (trailing `&`), a builtin, or an external program; connects stdin/stdout/stderr and respects redirection from `**parse`**. Builds the commandStr used in `**jobs**` output.

---

## `app/builtins.ts`

**Role:** Builtin command names and implementations.

**Provides:**

- `**BUILTINS`** list and `**isBuiltin**` / `**runBuiltin**`
- `**cd**` — `~` prefix to `$HOME`
- `**pwd**`
- `**echo**`
- `**history**` — print last *n* lines with indices; `**-r*`* / `**-w**` / `**-a**` with a file path delegate to `**HistoryState**`
- `**jobs**` — print and prune completed jobs via `**BackgroundJobsState**`
- `**exit**` — sets `**shellState.exitRequested**`
- `**type**` — builtin vs `**getExecPath**` resolution

---

## `app/pathHelpers.ts`

**Role:** **`PATH`** lookups: resolve a single command, or list runnable names for completion.

**Does:**

- **`getExecPath`** — Walk **`PATH`** in order; return the first absolute path where the given name exists and is executable (`X_OK`). Used by **`Command`**, **`type`**, and similar.
- **`getPathExecs`** — Collect unique executable basenames across all **`PATH`** entries (used by **`autocomplete`** for command-name Tab completion).

---

## `app/ShellState.ts`

**Role:** Aggregate shell session state.

**Holds:** `**HistoryState`**, `**BackgroundJobsState**`, `**exitRequested**`.

---

## `app/HistoryState.ts`

**Role:** In-memory command history and optional file persistence.

**Does:** `**push`**, `**getHistory**` (tail slice), `**load**` (append lines from file at startup), `**persist**` (append or rewrite from `**lastAppendedIdx**` so repeated saves do not duplicate).

---

## `app/BackgroundJobsState.ts`

**Role:** Background job table and formatting.

**Does:** Stable `**seq`** allocation (`**getNextSeq**`), sorted storage, `**filterRunning**`, `**printJobs**` / `**printDoneJobs**` with `jobs -l`-style markers for the current/previous job line.