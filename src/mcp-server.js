const {
  listProjects,
  readProject,
  readTarget,
  readGroups,
  search,
  manageCompilerLists,
  updateTargetConfig,
  manageGroup,
  renameTarget,
  deleteTarget,
  manageFile,
  keilScan,
  keilBuild,
  keilFlash,
} = require('./api');
const { version: VERSION } = require('../package.json');
const PROTOCOL_VERSION = '2024-11-05';

const FILE_TYPE_ENUM = ['c', 'cpp', 'asm', 'lib', 'obj', 'text'];
const COMPILER_LIST_SECTIONS = [
  'cads_defines', 'cads_undefines', 'cads_include_paths',
  'aads_defines', 'aads_undefines', 'aads_include_paths',
];
const READ_TARGET_SECTIONS = [
  'summary', 'compiler', 'cads', 'aads', 'ldads', 'debug', 'memory', 'all',
];

const TOOLS = [
  {
    name: 'list_projects',
    description: 'Scan a directory or parse a Keil workspace (.uvmpw) to discover .uvprojx/.uvproj projects. Use this before reading or building any project. Pass file to read a workspace, or root to scan a directory. Returns absolute paths of projects found.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to a .uvmpw workspace file.' },
        root: { type: 'string', description: 'Directory to scan recursively. Defaults to the current working directory.' },
      },
    },
  },
  {
    name: 'read_project',
    description: 'Read high-level project information including schema version and target names. Use this to list available targets before calling read_target, keil_build, or keil_flash. Pass the absolute path to the .uvprojx file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
      },
      required: ['file'],
    },
  },
  {
    name: 'read_target',
    description: 'Read a specific target\'s configuration. Use section to select which configuration page to read: summary (Device/Target/Output/Listing/User), compiler (C/C++ + Asm + Linker), cads, aads, ldads, debug (Debug + Utilities), or memory. Use compact to control output size. Defaults to summary for minimal output. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        section: {
          oneOf: [
            { type: 'string', enum: READ_TARGET_SECTIONS },
            { type: 'array', items: { type: 'string', enum: READ_TARGET_SECTIONS } },
          ],
          description: 'Configuration section(s) to read. Defaults to summary.',
        },
        compact: { type: 'boolean', description: 'When true, fold arrays and long strings. Defaults to true.', default: true },
      },
      required: ['file'],
    },
  },
  {
    name: 'read_groups',
    description: 'List groups and optionally files for a target. Use include_files to see files inside each group. Supports pagination via page and perPage. Use this instead of read_target for group/file information. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        include_files: { type: 'boolean', description: 'Return files inside each group.', default: false },
        page: { type: 'integer', minimum: 1, description: 'Page number (default 1).', default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, description: 'Items per page (default 20, max 100).', default: 20 },
      },
      required: ['file'],
    },
  },
  {
    name: 'search',
    description: 'Search within a target\'s groups, files, or compiler/linker settings for a keyword. Use scope to select groups, files, cads_defines, cads_undefines, cads_include_paths, aads_defines, aads_undefines, aads_include_paths, ldads_scatter_file, ldads_include_libs, or ldads_linker_misc. Supports pagination. Use this to find specific files, groups, defines, include paths, or linker settings before modifying them. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        scope: {
          type: 'string',
          enum: [
            'groups', 'files',
            'cads_defines', 'cads_undefines', 'cads_include_paths',
            'aads_defines', 'aads_undefines', 'aads_include_paths',
            'ldads_scatter_file', 'ldads_include_libs', 'ldads_linker_misc',
          ],
          description: 'Search scope.',
        },
        keyword: { type: 'string', description: 'Search keyword.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive matching.', default: false },
        exactMatch: { type: 'boolean', description: 'Exact match only.', default: false },
        page: { type: 'integer', minimum: 1, description: 'Page number (default 1).', default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, description: 'Items per page (default 20, max 100).', default: 20 },
      },
      required: ['file', 'scope', 'keyword'],
    },
  },
  {
    name: 'manage_compiler_lists',
    description: 'Atomically add, remove, or set C/C++ or Asm preprocessor defines, undefines, and include paths. Use this for simple compiler option modifications. section must be one of: cads_defines, cads_undefines, cads_include_paths, aads_defines, aads_undefines, aads_include_paths. value can be a single string or an array for batch operations. For complex compiler/debug/memory/summary changes, use update_target_config instead.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        section: { type: 'string', enum: COMPILER_LIST_SECTIONS, description: 'List section to modify.' },
        action: { type: 'string', enum: ['add', 'remove', 'set'], description: 'add, remove, or set.' },
        value: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'String or array of strings.' },
      },
      required: ['file', 'section', 'action', 'value'],
    },
  },
  {
    name: 'update_target_config',
    description: 'Replace an entire target configuration section with a complete object. Use this only when you need to update multiple fields at once. section can be compiler, cads, aads, ldads, debug, memory, or summary. Always call read_target first to get the current section, then modify the object and pass it back. This operation overwrites the entire section, so partial updates risk losing existing settings.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        section: { type: 'string', enum: ['compiler', 'cads', 'aads', 'ldads', 'debug', 'memory', 'summary'], description: 'Section to replace.' },
        confirm: { type: 'boolean', description: 'Must be true when section is summary.' },
        data: { type: 'object', description: 'Complete section object from read_target with compact=false.' },
      },
      required: ['file', 'section', 'data'],
    },
  },
  {
    name: 'manage_group',
    description: 'Add, remove, or rename a group in a target. Groups are containers for source files. action can be add, remove, or rename. For rename, provide newName. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        action: { type: 'string', enum: ['add', 'remove', 'rename'], description: 'add, remove, or rename.' },
        group: { type: 'string', description: 'Group name.' },
        newName: { type: 'string', description: 'New group name (required for rename).' },
      },
      required: ['file', 'action', 'group'],
    },
  },
  {
    name: 'rename_target',
    description: 'Rename a target in the project. Provide the current target name and the new name. This changes the TargetName field in the project XML.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Current target name.' },
        newName: { type: 'string', description: 'New target name.' },
      },
      required: ['file', 'target', 'newName'],
    },
  },
  {
    name: 'delete_target',
    description: 'Delete a target from the project. The project must have more than one target (at least one target must remain). If target is omitted, the first target is used. Returns the path of the saved project file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name to delete. If omitted, the first target is used.' },
      },
      required: ['file'],
    },
  },
  {
    name: 'manage_file',
    description: 'Add, remove, or move multiple source files in groups. Use items to batch operations and reduce MCP calls. For add, provide group, type, and files array. For remove, provide group and files. For move, provide group, toGroup, and files. Files are matched by path case-insensitively. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the project file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        action: { type: 'string', enum: ['add', 'remove', 'move'], description: 'add, remove, or move.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              group: { type: 'string', description: 'Source group name.' },
              toGroup: { type: 'string', description: 'Destination group name (move only).' },
              type: { type: 'string', enum: FILE_TYPE_ENUM, description: 'File type (add only).' },
              files: { type: 'array', items: { type: 'string' }, description: 'File paths.' },
            },
            required: ['group', 'files'],
          },
        },
      },
      required: ['file', 'action', 'items'],
    },
  },
  {
    name: 'keil_scan',
    description: 'Detect the Keil UV4.exe environment. Use this before calling keil_build or keil_flash to verify the environment is ready. Returns the resolved UV4.exe path or an environment-missing error. Project discovery should use list_projects instead.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['detect'], description: 'Only detect is supported.', default: 'detect' },
        uv4: { type: 'string', description: 'Override path to UV4.exe. KEIL_UV4_EXE environment variable takes precedence.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'keil_build',
    description: 'Build, rebuild, clean, scan build artifacts, or detect the Keil environment for a project using UV4.exe. Requires Windows and UV4.exe. Returns build metrics and a log excerpt. Full build log is available via the returned log_file path. Use log_tail_lines to control how many log lines are included in the response. If target is omitted, the first target is used.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['build', 'rebuild', 'clean', 'scan-artifacts', 'detect'], description: 'Build action.', default: 'build' },
        project: { type: 'string', description: 'Absolute path to .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        uv4: { type: 'string', description: 'Override path to UV4.exe. KEIL_UV4_EXE environment variable takes precedence.' },
        log_tail_lines: { type: 'integer', minimum: 1, maximum: 1000, description: 'Number of trailing log lines to return (default 100, max 1000).', default: 100 },
        clean_first: { type: 'boolean', description: 'For rebuild: clean before rebuilding.' },
        operation_mode: { type: 'integer', enum: [1, 2, 3], description: '1=execute, 2=summary only, 3=confirm.' },
        confirm: { type: 'boolean', description: 'Required when operation_mode=3.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'keil_flash',
    description: 'Flash/download the built firmware to target hardware using UV4.exe. Requires a recent successful build. If target is omitted, the first target is used. Use skip_build_check with caution.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Absolute path to .uvprojx / .uvproj file.' },
        target: { type: 'string', description: 'Target name. If omitted, the first target is used.' },
        uv4: { type: 'string', description: 'Override path to UV4.exe. KEIL_UV4_EXE environment variable takes precedence.' },
        skip_build_check: { type: 'boolean', description: 'Skip the recent successful build check.', default: false },
      },
      required: ['project'],
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

function sendResult(result) {
  return jsonContent(result);
}

const HANDLERS = {
  list_projects: listProjects,
  read_project: readProject,
  read_target: readTarget,
  read_groups: readGroups,
  search,
  manage_compiler_lists: manageCompilerLists,
  update_target_config: updateTargetConfig,
  manage_group: manageGroup,
  rename_target: renameTarget,
  delete_target: deleteTarget,
  manage_file: manageFile,
  keil_scan: keilScan,
  keil_build: keilBuild,
  keil_flash: keilFlash,
};

async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'keil-project-tools', version: VERSION },
      },
    };
  }

  if (method === 'initialized' || method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const toolName = params.name;
    const args = params.arguments || {};
    const handler = HANDLERS[toolName];

    if (!handler) {
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
    }

    try {
      const result = await handler(args);
      return { jsonrpc: '2.0', id, result: sendResult(result) };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
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
