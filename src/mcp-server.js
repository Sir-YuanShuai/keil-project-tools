const { readProject, readWorkspace } = require('./reader');
const {
  createProject,
  setTargetName,
  setDefines,
  setIncludePaths,
  addFile,
  removeFile,
  saveProject,
} = require('./writer');
const { version: VERSION } = require('../package.json');
const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'read_project',
    description: 'Read a Keil project file (.uvprojx / .uvproj) and return its metadata, targets, groups, files, defines and include paths.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        target: {
          type: 'string',
          description: 'Optional target name to filter results.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'read_workspace',
    description: 'Read a Keil multi-project workspace (.uvmpw) and return the list of referenced project paths.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the workspace file.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'rename_target',
    description: 'Rename a target in a Keil project.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        newName: {
          type: 'string',
          description: 'New target name.',
        },
        target: {
          type: 'string',
          description: 'Current target name to rename. Defaults to the first target.',
        },
        output: {
          type: 'string',
          description: 'Output file path. Defaults to overwriting the input file.',
        },
      },
      required: ['file', 'newName'],
    },
  },
  {
    name: 'set_defines',
    description: 'Set C preprocessor defines for a target.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        defines: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of C preprocessor defines.',
        },
        target: {
          type: 'string',
          description: 'Target name to modify. Defaults to the first target.',
        },
        output: {
          type: 'string',
          description: 'Output file path. Defaults to overwriting the input file.',
        },
      },
      required: ['file', 'defines'],
    },
  },
  {
    name: 'set_includes',
    description: 'Set C include paths for a target.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of include paths.',
        },
        target: {
          type: 'string',
          description: 'Target name to modify. Defaults to the first target.',
        },
        output: {
          type: 'string',
          description: 'Output file path. Defaults to overwriting the input file.',
        },
      },
      required: ['file', 'paths'],
    },
  },
  {
    name: 'add_file',
    description: 'Add a source file to a group in a Keil project.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        group: {
          type: 'string',
          description: 'Group name where the file should be added.',
        },
        filePath: {
          type: 'string',
          description: 'Relative or absolute path to the source file.',
        },
        name: {
          type: 'string',
          description: 'Display name in the project. Defaults to the file basename.',
        },
        type: {
          type: 'string',
          enum: ['c', 'cpp', 'asm', 'lib', 'obj', 'text'],
          description: 'File type.',
        },
        target: {
          type: 'string',
          description: 'Target name to modify. Defaults to the first target.',
        },
        output: {
          type: 'string',
          description: 'Output file path. Defaults to overwriting the input file.',
        },
      },
      required: ['file', 'group', 'filePath'],
    },
  },
  {
    name: 'remove_file',
    description: 'Remove a source file from all groups in a Keil project.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the Keil project file.',
        },
        filePath: {
          type: 'string',
          description: 'Path of the source file to remove.',
        },
        target: {
          type: 'string',
          description: 'Target name to modify. Defaults to the first target.',
        },
        output: {
          type: 'string',
          description: 'Output file path. Defaults to overwriting the input file.',
        },
      },
      required: ['file', 'filePath'],
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

function handleReadProject(args) {
  const suffix = args.file.toLowerCase().endsWith('.uvmpw') ? 'uvmpw' : 'uvprojx';
  const result = suffix === 'uvmpw' ? readWorkspace(args.file) : readProject(args.file);

  if (args.target && result.targets) {
    result.targets = result.targets.filter((t) => t.target_name === args.target);
    if (result.targets.length === 0) {
      throw new Error(`Target not found: ${args.target}`);
    }
  }

  return textContent(JSON.stringify(result, null, 2));
}

function handleReadWorkspace(args) {
  const result = readWorkspace(args.file);
  return textContent(JSON.stringify(result, null, 2));
}

function handleRenameTarget(args) {
  const project = createProject(args.file);
  setTargetName(project, args.target, args.newName);
  const outPath = saveProject(project, args.output);
  return textContent(JSON.stringify({ saved: outPath }, null, 2));
}

function handleSetDefines(args) {
  const project = createProject(args.file);
  setDefines(project, args.target, args.defines);
  const outPath = saveProject(project, args.output);
  return textContent(JSON.stringify({ saved: outPath, defines: args.defines }, null, 2));
}

function handleSetIncludes(args) {
  const project = createProject(args.file);
  setIncludePaths(project, args.target, args.paths);
  const outPath = saveProject(project, args.output);
  return textContent(JSON.stringify({ saved: outPath, include_paths: args.paths }, null, 2));
}

function handleAddFile(args) {
  const project = createProject(args.file);
  const fileName = args.name || require('path').basename(args.filePath);
  addFile(project, args.target, args.group, fileName, args.filePath, args.type || 'c');
  const outPath = saveProject(project, args.output);
  return textContent(JSON.stringify({ saved: outPath, added: args.filePath, group: args.group }, null, 2));
}

function handleRemoveFile(args) {
  const project = createProject(args.file);
  removeFile(project, args.target, args.filePath);
  const outPath = saveProject(project, args.output);
  return textContent(JSON.stringify({ saved: outPath, removed: args.filePath }, null, 2));
}

const HANDLERS = {
  read_project: handleReadProject,
  read_workspace: handleReadWorkspace,
  rename_target: handleRenameTarget,
  set_defines: handleSetDefines,
  set_includes: handleSetIncludes,
  add_file: handleAddFile,
  remove_file: handleRemoveFile,
};

function handleRequest(request) {
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
      const result = handler(args);
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
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = handleRequest(request);
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
