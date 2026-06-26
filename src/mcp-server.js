const {
  readProject,
  readWorkspace,
  listProjectsInWorkspace,
  readProjectSummary,
  listTargets,
  readTargetSummary,
  readTargetDefines,
  readTargetIncludePaths,
  readTargetGroups,
  readTargetFiles,
  readTargetLinkerSettings,
  readTargetDebugSettings,
  searchGroups,
  searchFiles,
  searchDefines,
  searchIncludePaths,
} = require('./reader');
const {
  createProject,
  setTargetName,
  setDefines,
  addDefine,
  removeDefine,
  setIncludePaths,
  addIncludePath,
  removeIncludePath,
  addGroup,
  removeGroup,
  renameGroup,
  addFile,
  removeFile,
  moveFile,
  saveProject,
} = require('./writer');
const {
  detectAction,
  scan,
  targets,
  build,
  rebuild,
  clean,
  flash,
  scanArtifactsAction,
} = require('./keil-runner');
const { version: VERSION } = require('../package.json');
const PROTOCOL_VERSION = '2024-11-05';

const FILE_TYPE_ENUM = ['c', 'cpp', 'asm', 'lib', 'obj', 'text'];

const TOOLS = [
  {
    name: 'list_projects_in_workspace',
    description: 'List all project paths referenced by a Keil multi-project workspace (.uvmpw). Use this when the input is a .uvmpw file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvmpw workspace file.' },
      },
      required: ['file'],
    },
  },
  {
    name: 'read_project_summary',
    description: 'Read high-level project info: schema version, header, and target names. Use this as the first step to understand a project before calling list_targets or read_target_groups.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
      },
      required: ['file'],
    },
  },
  {
    name: 'list_targets',
    description: 'List all target names in a Keil project. Use this after read_project_summary to pick a target for subsequent operations.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
      },
      required: ['file'],
    },
  },
  {
    name: 'read_target_summary',
    description: 'Read device, vendor, pack, CPU, output directory/name and output type flags for a target. Use this after list_targets to inspect target configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'read_target_defines',
    description: 'Read C preprocessor defines for a target. Use this to inspect existing defines before adding or removing them.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'read_target_include_paths',
    description: 'Read C include paths for a target. Use this to inspect existing paths before adding or removing them.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'read_target_groups',
    description: 'List all group names for a target. Use this after list_targets to pick a group before reading files or adding files.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'read_target_files',
    description: 'Read all files in a specific group of a target. Use this after read_target_groups to inspect source files. Output paths are relative to the project file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'Group name. Use read_target_groups to get valid names.' },
      },
      required: ['file', 'target', 'group'],
    },
  },
  {
    name: 'read_target_linker_settings',
    description: 'Read linker settings for a target: scatter file, include libs, include libs path, and linker misc. Use this to inspect the linker configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'read_target_debug_settings',
    description: 'Read debugger driver and flash driver for a target. Use this to inspect debug/flash settings.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
      },
      required: ['file', 'target'],
    },
  },
  {
    name: 'search_groups',
    description: 'Search group names by keyword within a target. Use this when you do not know the exact group name.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        keyword: { type: 'string', description: 'Search keyword.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
        exactMatch: { type: 'boolean', description: 'Exact match only. Default false.' },
      },
      required: ['file', 'target', 'keyword'],
    },
  },
  {
    name: 'search_files',
    description: 'Search source files by keyword within a target across all groups. Use this when you do not know the exact group or file name.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        keyword: { type: 'string', description: 'Search keyword.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
        exactMatch: { type: 'boolean', description: 'Exact match only. Default false.' },
      },
      required: ['file', 'target', 'keyword'],
    },
  },
  {
    name: 'search_defines',
    description: 'Search C preprocessor defines by keyword within a target. Use this when you do not know the exact define name.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        keyword: { type: 'string', description: 'Search keyword.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
        exactMatch: { type: 'boolean', description: 'Exact match only. Default false.' },
      },
      required: ['file', 'target', 'keyword'],
    },
  },
  {
    name: 'search_include_paths',
    description: 'Search C include paths by keyword within a target. Use this when you do not know the exact include path.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        keyword: { type: 'string', description: 'Search keyword.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
        exactMatch: { type: 'boolean', description: 'Exact match only. Default false.' },
      },
      required: ['file', 'target', 'keyword'],
    },
  },
  {
    name: 'rename_target',
    description: 'Rename a target in a Keil project. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name to rename.' },
        newName: { type: 'string', description: 'New target name.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'newName'],
    },
  },
  {
    name: 'set_defines',
    description: 'Replace all C preprocessor defines for a target. This overwrites the entire define list. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        defines: { type: 'array', items: { type: 'string' }, description: 'Complete list of defines.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'defines'],
    },
  },
  {
    name: 'add_define',
    description: 'Add a single C preprocessor define to a target. If the define already exists (case-insensitive), it is not added. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        define: { type: 'string', description: 'Define to add.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'define'],
    },
  },
  {
    name: 'remove_define',
    description: 'Remove a single C preprocessor define from a target. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        define: { type: 'string', description: 'Define to remove.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'define'],
    },
  },
  {
    name: 'set_include_paths',
    description: 'Replace all C include paths for a target. This overwrites the entire include path list. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Complete list of include paths.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'paths'],
    },
  },
  {
    name: 'add_include_path',
    description: 'Add a single C include path to a target. If the path already exists (case-insensitive, slash/backslash normalized), it is not added. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        path: { type: 'string', description: 'Include path to add.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'path'],
    },
  },
  {
    name: 'remove_include_path',
    description: 'Remove a single C include path from a target. Path matching is case-insensitive and slash/backslash normalized. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        path: { type: 'string', description: 'Include path to remove.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'path'],
    },
  },
  {
    name: 'add_group',
    description: 'Add a new file group to a target. If the group already exists, no change is made. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'New group name.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'group'],
    },
  },
  {
    name: 'remove_group',
    description: 'Remove a file group and all its files from a target. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'Group name. Use read_target_groups to get valid names.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'group'],
    },
  },
  {
    name: 'rename_group',
    description: 'Rename a file group in a target. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'Current group name.' },
        newName: { type: 'string', description: 'New group name.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'group', 'newName'],
    },
  },
  {
    name: 'add_file',
    description: 'Add a source file to a specific group in a target. The group is created if it does not exist. Use read_target_groups first to confirm the target group. The filePath can use / or \\ separators and can be relative. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'Group name. Use read_target_groups to get valid names.' },
        filePath: { type: 'string', description: 'Relative or absolute path to the source file.' },
        name: { type: 'string', description: 'Display name in the project. Defaults to file basename.' },
        type: { type: 'string', enum: FILE_TYPE_ENUM, description: 'File type. Default c.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'group', 'filePath'],
    },
  },
  {
    name: 'remove_file',
    description: 'Remove a source file from a specific group in a target. Use search_files first if unsure of the group. The filePath matching is case-insensitive and slash/backslash normalized. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        group: { type: 'string', description: 'Group name. Use read_target_groups to get valid names.' },
        filePath: { type: 'string', description: 'Path of the source file to remove.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'group', 'filePath'],
    },
  },
  {
    name: 'move_file',
    description: 'Move a source file from one group to another within a target. The destination group is created if it does not exist. Use search_files first if unsure of the source group. The original file is automatically backed up to .bak before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. Use list_targets to get valid names.' },
        filePath: { type: 'string', description: 'Path of the source file to move.' },
        fromGroup: { type: 'string', description: 'Source group name.' },
        toGroup: { type: 'string', description: 'Destination group name.' },
        output: { type: 'string', description: 'Output file path. Defaults to overwriting the input file.' },
      },
      required: ['file', 'target', 'filePath', 'fromGroup', 'toGroup'],
    },
  },
  {
    name: 'keil_scan',
    description: 'Scan for Keil .uvprojx/.uvproj/.uvmpw projects or list targets. Use this to discover projects before building or flashing.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['scan', 'targets', 'detect'],
          description: 'scan=find projects, targets=list targets, detect=check UV4 environment',
          default: 'scan',
        },
        root: { type: 'string', description: 'Directory to scan (required for scan)' },
        project: { type: 'string', description: 'Project path (required for targets, optional for detect)' },
        workspace: { type: 'string', description: 'Workspace root used for config resolution' },
        uv4: { type: 'string', description: 'Override path to UV4.exe for detect. Prefer KEIL_UV4_EXE environment variable; only provide this when env var is not set or must be overridden.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'keil_build',
    description: 'Build, rebuild, clean a Keil project or scan build artifacts. Requires Windows and UV4.exe. Reads and updates .em_skill.json in the target output directory (or project root as fallback). On success, writes artifact path and last build result to .em_skill.json. If you are unsure whether KEIL_UV4_EXE is set, call keil_scan action=detect first. Do not guess the uv4 path; rely on the environment variable or auto-detection.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['build', 'rebuild', 'clean', 'scan-artifacts', 'detect'],
          description: 'Build action to perform',
          default: 'build',
        },
        project: { type: 'string', description: 'Absolute path to .uvprojx / .uvproj file' },
        target: { type: 'string', description: 'Target name. Defaults to the first target.' },
        uv4: { type: 'string', description: 'Override path to UV4.exe. Only provide this when KEIL_UV4_EXE is not set or must be overridden. Do not guess a path.' },
        log_dir: { type: 'string', description: 'Directory for build logs (relative to workspace or absolute)' },
        clean_first: { type: 'boolean', description: 'For rebuild: use -cr to clean before rebuilding' },
        confirm: { type: 'boolean', description: 'Required when operation_mode=3' },
        operation_mode: { type: 'number', description: 'Override operation_mode: 1=execute, 2=summary only, 3=confirm' },
      },
      required: ['action'],
    },
  },
  {
    name: 'keil_flash',
    description: 'Flash a Keil project to target hardware via UV4.exe. Reads the last build state from .em_skill.json in the target output directory (or project root as fallback) and requires a recent successful build. After flash, writes the flash result back to .em_skill.json. Requires Windows. If you are unsure whether KEIL_UV4_EXE is set, call keil_scan action=detect first. Do not guess the uv4 path; rely on the environment variable or auto-detection.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['flash'],
          description: 'Flash firmware to target',
          default: 'flash',
        },
        project: { type: 'string', description: 'Absolute path to .uvprojx / .uvproj file' },
        target: { type: 'string', description: 'Target name. Defaults to the first target.' },
        uv4: { type: 'string', description: 'Override path to UV4.exe. Only provide this when KEIL_UV4_EXE is not set or must be overridden. Do not guess a path.' },
        log_dir: { type: 'string', description: 'Directory for flash logs' },
        confirm: { type: 'boolean', description: 'Required when operation_mode=3' },
        operation_mode: { type: 'number', description: 'Override operation_mode' },
        skip_build_check: { type: 'boolean', description: 'Skip last-build success check' },
      },
      required: ['action', 'project'],
    },
  },
];

function sendMessage(message) {
  const line = JSON.stringify(message);
  process.stdout.write(line + '\n');
}

function textContent(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonContent(value) {
  return textContent(JSON.stringify(value, null, 2));
}

function handleListProjectsInWorkspace(args) {
  return jsonContent(listProjectsInWorkspace(args.file));
}

function handleReadProjectSummary(args) {
  return jsonContent(readProjectSummary(args.file));
}

function handleListTargets(args) {
  return jsonContent(listTargets(args.file));
}

function handleReadTargetSummary(args) {
  return jsonContent(readTargetSummary(args.file, args.target));
}

function handleReadTargetDefines(args) {
  return jsonContent(readTargetDefines(args.file, args.target));
}

function handleReadTargetIncludePaths(args) {
  return jsonContent(readTargetIncludePaths(args.file, args.target));
}

function handleReadTargetGroups(args) {
  return jsonContent(readTargetGroups(args.file, args.target));
}

function handleReadTargetFiles(args) {
  return jsonContent(readTargetFiles(args.file, args.target, args.group));
}

function handleReadTargetLinkerSettings(args) {
  return jsonContent(readTargetLinkerSettings(args.file, args.target));
}

function handleReadTargetDebugSettings(args) {
  return jsonContent(readTargetDebugSettings(args.file, args.target));
}

function handleSearchGroups(args) {
  return jsonContent(searchGroups(args.file, args.target, args.keyword, args.caseSensitive, args.exactMatch));
}

function handleSearchFiles(args) {
  return jsonContent(searchFiles(args.file, args.target, args.keyword, args.caseSensitive, args.exactMatch));
}

function handleSearchDefines(args) {
  return jsonContent(searchDefines(args.file, args.target, args.keyword, args.caseSensitive, args.exactMatch));
}

function handleSearchIncludePaths(args) {
  return jsonContent(searchIncludePaths(args.file, args.target, args.keyword, args.caseSensitive, args.exactMatch));
}

function handleRenameTarget(args) {
  const project = createProject(args.file);
  setTargetName(project, args.target, args.newName);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, renamed: `${args.target} -> ${args.newName}` });
}

function handleSetDefines(args) {
  const project = createProject(args.file);
  setDefines(project, args.target, args.defines);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, defines: args.defines });
}

function handleAddDefine(args) {
  const project = createProject(args.file);
  addDefine(project, args.target, args.define);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, added: args.define });
}

function handleRemoveDefine(args) {
  const project = createProject(args.file);
  removeDefine(project, args.target, args.define);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, removed: args.define });
}

function handleSetIncludePaths(args) {
  const project = createProject(args.file);
  setIncludePaths(project, args.target, args.paths);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, include_paths: args.paths });
}

function handleAddIncludePath(args) {
  const project = createProject(args.file);
  addIncludePath(project, args.target, args.path);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, added: args.path });
}

function handleRemoveIncludePath(args) {
  const project = createProject(args.file);
  removeIncludePath(project, args.target, args.path);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, removed: args.path });
}

function handleAddGroup(args) {
  const project = createProject(args.file);
  addGroup(project, args.target, args.group);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, added_group: args.group });
}

function handleRemoveGroup(args) {
  const project = createProject(args.file);
  removeGroup(project, args.target, args.group);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, removed_group: args.group });
}

function handleRenameGroup(args) {
  const project = createProject(args.file);
  renameGroup(project, args.target, args.group, args.newName);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, renamed: `${args.group} -> ${args.newName}` });
}

function handleAddFile(args) {
  const project = createProject(args.file);
  const fileName = args.name || require('path').basename(args.filePath.replace(/\\/g, '/'));
  addFile(project, args.target, args.group, fileName, args.filePath, args.type || 'c');
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, added: args.filePath, group: args.group });
}

function handleRemoveFile(args) {
  const project = createProject(args.file);
  removeFile(project, args.target, args.group, args.filePath);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, removed: args.filePath, group: args.group });
}

function handleMoveFile(args) {
  const project = createProject(args.file);
  moveFile(project, args.target, args.filePath, args.fromGroup, args.toGroup);
  const outPath = saveProject(project, args.output);
  return jsonContent({ saved: outPath, moved: args.filePath, from: args.fromGroup, to: args.toGroup });
}

async function handleKeilScan(args) {
  const action = args.action || 'scan';
  let result;
  if (action === 'scan') {
    result = await scan(args);
  } else if (action === 'targets') {
    result = await targets(args);
  } else {
    result = await detectAction(args);
  }
  return jsonContent(result);
}

async function handleKeilBuild(args) {
  const action = args.action || 'build';
  let result;
  if (action === 'build') {
    result = await build(args);
  } else if (action === 'rebuild') {
    result = await rebuild(args);
  } else if (action === 'clean') {
    result = await clean(args);
  } else if (action === 'scan-artifacts') {
    result = await scanArtifactsAction(args);
  } else {
    result = await detectAction(args);
  }
  return jsonContent(result);
}

async function handleKeilFlash(args) {
  return jsonContent(await flash(args));
}

const HANDLERS = {
  list_projects_in_workspace: handleListProjectsInWorkspace,
  read_project_summary: handleReadProjectSummary,
  list_targets: handleListTargets,
  read_target_summary: handleReadTargetSummary,
  read_target_defines: handleReadTargetDefines,
  read_target_include_paths: handleReadTargetIncludePaths,
  read_target_groups: handleReadTargetGroups,
  read_target_files: handleReadTargetFiles,
  read_target_linker_settings: handleReadTargetLinkerSettings,
  read_target_debug_settings: handleReadTargetDebugSettings,
  search_groups: handleSearchGroups,
  search_files: handleSearchFiles,
  search_defines: handleSearchDefines,
  search_include_paths: handleSearchIncludePaths,
  rename_target: handleRenameTarget,
  set_defines: handleSetDefines,
  add_define: handleAddDefine,
  remove_define: handleRemoveDefine,
  set_include_paths: handleSetIncludePaths,
  add_include_path: handleAddIncludePath,
  remove_include_path: handleRemoveIncludePath,
  add_group: handleAddGroup,
  remove_group: handleRemoveGroup,
  rename_group: handleRenameGroup,
  add_file: handleAddFile,
  remove_file: handleRemoveFile,
  move_file: handleMoveFile,
  keil_scan: handleKeilScan,
  keil_build: handleKeilBuild,
  keil_flash: handleKeilFlash,
};

async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'keil-project-tools',
          version: VERSION,
        },
      },
    };
  }

  if (method === 'initialized' || method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === 'tools/call') {
    const toolName = params.name;
    const args = params.arguments || {};
    const handler = HANDLERS[toolName];

    if (!handler) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    try {
      const result = await handler(args);
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err.message },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

function startMcpServer() {
  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = await handleRequest(request);
        if (response) {
          sendMessage(response);
        }
      } catch (err) {
        sendMessage({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` },
        });
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

module.exports = { startMcpServer, TOOLS };
