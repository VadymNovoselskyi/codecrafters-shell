# Shell (CodeCrafters)

A small interactive shell built for the [CodeCrafters “Build Your Own Shell”](https://app.codecrafters.io/courses/shell/overview) challenge.

## Features

- **Interactive loop** — readline prompt
- **Quoting and escapes** — single and double quoted commands; argument parsing with quote and backslash rules
- **Pipelines** — `|` between stages
- **Conditional chains** — `&&` within a pipeline segment
- **Redirection** — stdout/stderr to file (`>`, `>>`, `1>`, `2>`, etc.)
- **History** — in-memory lines; optional `HISTFILE` load at startup and persist on exit
- **Builtins** — `cd`, `pwd`, `echo`, `history`, `jobs`, `exit`, `type`
- **External commands** — resolve executables on `PATH`, `spawn` with piped stdio
- **Background jobs** — trailing `&`, job list, completion notifications
- **Tab completion** — builtin and `PATH` command names; filesystem paths for arguments

## Code layout

See **[implementation.md](./implementation.md)** for what each source file owns and how the pieces connect.
