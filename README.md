# keil-project-tools

A Node.js CLI tool and library to read and modify local Keil µVision project files (`.uvprojx`, `.uvproj`, `.uvmpw`).

## Features

- **Read** project metadata, targets, source files, groups, defines, include paths, and debug/flash settings.
- **Modify** target name, C defines, C include paths.
- **Add/remove** source files in groups.
- **Parse** multi-project workspaces (`.uvmpw`).
- **Preserve XML node order** when writing back to keep compatibility with µVision.

## Installation

### Local development

```bash
git clone https://github.com/Sir-YuanShuai/keil-project-tools.git
cd keil-project-tools
npm install
npm link
keil-project-tools --help
```

### Via npm / npx

```bash
# Install globally
npm install -g keil-project-tools

# Or run without installing
npx keil-project-tools read /path/to/Project.uvprojx
```

## CLI Commands

### `read`

```bash
keil-project-tools read /path/to/Project.uvprojx
keil-project-tools read /path/to/Project.uvprojx --target <TargetName> --output json
keil-project-tools read /path/to/Workspace.uvmpw
```

### `rename-target`

```bash
keil-project-tools rename-target /path/to/Project.uvprojx <NewTargetName>
keil-project-tools rename-target /path/to/Project.uvprojx <NewTargetName> --target <OldTargetName> -o /path/to/output.uvprojx
```

### `set-defines`

```bash
keil-project-tools set-defines /path/to/Project.uvprojx "DEF1,DEF2,DEF3"
```

### `set-includes`

```bash
keil-project-tools set-includes /path/to/Project.uvprojx "../Inc;../Drivers/CMSIS/Device"
```

### `add-file`

```bash
keil-project-tools add-file /path/to/Project.uvprojx "Application/User" "../Src/newfile.c" --name newfile.c --type c
```

Supported file types: `c` (default), `cpp`, `asm`, `lib`, `obj`, `text`.

### `remove-file`

```bash
keil-project-tools remove-file /path/to/Project.uvprojx "../Src/oldfile.c"
```

### `mcp`

```bash
keil-project-tools mcp
```

Starts the MCP server on stdio. Use this command to connect the tool from any MCP client (Claude Desktop, Cline, etc.).

## MCP Server

`keil-project-tools` can be used as an [MCP](https://modelcontextprotocol.io/) server, exposing read/write tools to AI assistants.

### Available MCP tools

- `read_project` — read a Keil project and return metadata/targets/groups/files.
- `read_workspace` — read a `.uvmpw` workspace and list referenced projects.
- `rename_target` — rename a target.
- `set_defines` — set C preprocessor defines for a target.
- `set_includes` — set C include paths for a target.
- `add_file` — add a source file to a group.
- `remove_file` — remove a source file from all groups.

### Configure in Claude Desktop

Add the following to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "keil-project-tools": {
      "command": "npx",
      "args": ["-y", "keil-project-tools@latest", "mcp"]
    }
  }
}
```

Location of the config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

After saving, restart Claude Desktop and the tools will be available in the conversation.

### Configure in Cline / VS Code

Add this entry to the MCP settings JSON used by your MCP extension:

```json
{
  "keil-project-tools": {
    "command": "npx",
    "args": ["-y", "keil-project-tools@latest", "mcp"]
  }
}
```

## Programmatic API

```js
const { createProject, setDefines, addFile, saveProject } = require('keil-project-tools');

const project = createProject('/path/to/Project.uvprojx');
setDefines(project, 'Target1', ['DEF1', 'DEF2']);
addFile(project, 'Target1', 'Application/User', 'newfile.c', '../Src/newfile.c', 'c');
saveProject(project);
```

## Notes

- Keil project files are internal/proprietary XML files. The format may change between MDK versions. Use write operations with care and keep backups.
- The tool keeps XML node order when writing back to remain compatible with µVision.
- Paths in `.uvprojx` typically use backslashes. The CLI preserves them in the output file.

## License

MIT
