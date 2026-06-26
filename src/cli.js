const { Command } = require('commander');
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
const { startMcpServer } = require('./mcp-server');

const program = new Command();

function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function runCli() {
  program
    .name('keil-project-tools')
    .description('Keil µVision project tools for AI Agents (MCP server and CLI)')
    .version('0.3.0');

  // Read commands
  program
    .command('read')
    .description('Read a Keil project file and output JSON summary (legacy)')
    .argument('<file>', 'Keil project file (.uvprojx / .uvproj / .uvmpw)')
    .option('-t, --target <name>', 'filter by target name')
    .action((file, options) => {
      const suffix = file.toLowerCase().endsWith('.uvmpw') ? 'uvmpw' : 'uvprojx';
      const result = suffix === 'uvmpw' ? readWorkspace(file) : readProject(file);
      if (options.target && result.targets) {
        result.targets = result.targets.filter((t) => t.target_name === options.target);
      }
      outputJson(result);
    });

  program
    .command('list-projects-in-workspace')
    .description('List project paths in a workspace')
    .argument('<file>', 'workspace file (.uvmpw)')
    .action((file) => outputJson(listProjectsInWorkspace(file)));

  program
    .command('read-project-summary')
    .description('Read project summary')
    .argument('<file>', 'project file')
    .action((file) => outputJson(readProjectSummary(file)));

  program
    .command('list-targets')
    .description('List target names')
    .argument('<file>', 'project file')
    .action((file) => outputJson(listTargets(file)));

  program
    .command('read-target-summary')
    .description('Read target summary')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetSummary(file, options.target)));

  program
    .command('read-target-defines')
    .description('Read C defines for a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetDefines(file, options.target)));

  program
    .command('read-target-include-paths')
    .description('Read C include paths for a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetIncludePaths(file, options.target)));

  program
    .command('read-target-groups')
    .description('Read group names for a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetGroups(file, options.target)));

  program
    .command('read-target-files')
    .description('Read files in a specific group')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .requiredOption('-g, --group <name>', 'group name')
    .action((file, options) => outputJson(readTargetFiles(file, options.target, options.group)));

  program
    .command('read-target-linker-settings')
    .description('Read linker settings for a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetLinkerSettings(file, options.target)));

  program
    .command('read-target-debug-settings')
    .description('Read debug settings for a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .action((file, options) => outputJson(readTargetDebugSettings(file, options.target)));

  // Search commands
  program
    .command('search-groups')
    .description('Search groups by keyword')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<keyword>', 'search keyword')
    .option('--case-sensitive', 'case-sensitive matching')
    .option('--exact', 'exact match')
    .action((file, keyword, options) => {
      outputJson(searchGroups(file, options.target, keyword, !!options.caseSensitive, !!options.exact));
    });

  program
    .command('search-files')
    .description('Search files by keyword')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<keyword>', 'search keyword')
    .option('--case-sensitive', 'case-sensitive matching')
    .option('--exact', 'exact match')
    .action((file, keyword, options) => {
      outputJson(searchFiles(file, options.target, keyword, !!options.caseSensitive, !!options.exact));
    });

  program
    .command('search-defines')
    .description('Search defines by keyword')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<keyword>', 'search keyword')
    .option('--case-sensitive', 'case-sensitive matching')
    .option('--exact', 'exact match')
    .action((file, keyword, options) => {
      outputJson(searchDefines(file, options.target, keyword, !!options.caseSensitive, !!options.exact));
    });

  program
    .command('search-include-paths')
    .description('Search include paths by keyword')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<keyword>', 'search keyword')
    .option('--case-sensitive', 'case-sensitive matching')
    .option('--exact', 'exact match')
    .action((file, keyword, options) => {
      outputJson(searchIncludePaths(file, options.target, keyword, !!options.caseSensitive, !!options.exact));
    });

  // Write commands
  program
    .command('rename-target')
    .description('Rename a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target to rename')
    .argument('<newName>', 'new target name')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, newName, options) => {
      const project = createProject(file);
      setTargetName(project, options.target, newName);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, renamed: `${options.target} -> ${newName}` });
    });

  program
    .command('set-defines')
    .description('Set all C preprocessor defines')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<defines>', 'comma-separated defines')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, defines, options) => {
      const project = createProject(file);
      setDefines(project, options.target, defines.split(',').map((s) => s.trim()));
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath });
    });

  program
    .command('add-define')
    .description('Add a single C preprocessor define')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<define>', 'define to add')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, define, options) => {
      const project = createProject(file);
      addDefine(project, options.target, define);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, added: define });
    });

  program
    .command('remove-define')
    .description('Remove a single C preprocessor define')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<define>', 'define to remove')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, define, options) => {
      const project = createProject(file);
      removeDefine(project, options.target, define);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, removed: define });
    });

  program
    .command('set-include-paths')
    .description('Set all C include paths')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<paths>', 'semicolon-separated include paths')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, paths, options) => {
      const project = createProject(file);
      setIncludePaths(project, options.target, paths.split(';').map((s) => s.trim()));
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath });
    });

  program
    .command('add-include-path')
    .description('Add a single C include path')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<path>', 'include path to add')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, includePath, options) => {
      const project = createProject(file);
      addIncludePath(project, options.target, includePath);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, added: includePath });
    });

  program
    .command('remove-include-path')
    .description('Remove a single C include path')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<path>', 'include path to remove')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, includePath, options) => {
      const project = createProject(file);
      removeIncludePath(project, options.target, includePath);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, removed: includePath });
    });

  program
    .command('add-group')
    .description('Add a group to a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<group>', 'group name')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, group, options) => {
      const project = createProject(file);
      addGroup(project, options.target, group);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, added_group: group });
    });

  program
    .command('remove-group')
    .description('Remove a group from a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<group>', 'group name')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, group, options) => {
      const project = createProject(file);
      removeGroup(project, options.target, group);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, removed_group: group });
    });

  program
    .command('rename-group')
    .description('Rename a group in a target')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<group>', 'current group name')
    .argument('<newName>', 'new group name')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, group, newName, options) => {
      const project = createProject(file);
      renameGroup(project, options.target, group, newName);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, renamed: `${group} -> ${newName}` });
    });

  program
    .command('add-file')
    .description('Add a source file to a group')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .requiredOption('-g, --group <name>', 'group name')
    .argument('<filePath>', 'path to source file')
    .option('-n, --name <name>', 'file name displayed in project')
    .option('-T, --type <type>', 'file type: c, cpp, asm, lib, obj, text', 'c')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, filePath, options) => {
      const project = createProject(file);
      const fileName = options.name || require('path').basename(filePath.replace(/\\/g, '/'));
      addFile(project, options.target, options.group, fileName, filePath, options.type);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, added: filePath, group: options.group });
    });

  program
    .command('remove-file')
    .description('Remove a source file from a specific group')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .requiredOption('-g, --group <name>', 'group name')
    .argument('<filePath>', 'path to source file to remove')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, filePath, options) => {
      const project = createProject(file);
      removeFile(project, options.target, options.group, filePath);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, removed: filePath, group: options.group });
    });

  program
    .command('move-file')
    .description('Move a source file between groups')
    .argument('<file>', 'project file')
    .requiredOption('-t, --target <name>', 'target name')
    .argument('<filePath>', 'path to source file')
    .requiredOption('--from <group>', 'source group')
    .requiredOption('--to <group>', 'destination group')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, filePath, options) => {
      const project = createProject(file);
      moveFile(project, options.target, filePath, options.from, options.to);
      const outPath = saveProject(project, options.output);
      outputJson({ saved: outPath, moved: filePath, from: options.from, to: options.to });
    });

  program
    .command('mcp')
    .description('Start the MCP server (stdio)')
    .action(() => {
      startMcpServer();
    });

  program.parse();
}

module.exports = { runCli };
