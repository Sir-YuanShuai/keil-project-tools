const { Command } = require('commander');
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

const program = new Command();

function runCli() {
  program
    .name('keil-project-tools')
    .description('Read and modify local Keil µVision project files')
    .version('0.1.0');

  program
    .command('read')
    .description('Read a Keil project file and output JSON summary')
    .argument('<file>', 'Keil project file (.uvprojx / .uvproj / .uvmpw)')
    .option('-t, --target <name>', 'filter by target name')
    .option('-o, --output <format>', 'output format: json or pretty', 'pretty')
    .action((file, options) => {
      const suffix = file.toLowerCase().endsWith('.uvmpw') ? 'uvmpw' : 'uvprojx';
      const result = suffix === 'uvmpw' ? readWorkspace(file) : readProject(file);

      if (options.target && result.targets) {
        result.targets = result.targets.filter((t) => t.target_name === options.target);
        if (result.targets.length === 0) {
          console.error(`Target not found: ${options.target}`);
          process.exit(1);
        }
      }

      if (options.output === 'json') {
        console.log(JSON.stringify(result, null, null));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command('rename-target')
    .description('Rename a target')
    .argument('<file>', 'Keil project file')
    .argument('<newName>', 'new target name')
    .option('-t, --target <name>', 'target to rename (default: first target)')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, newName, options) => {
      const project = createProject(file);
      setTargetName(project, options.target, newName);
      const outPath = saveProject(project, options.output);
      console.log(`Saved: ${outPath}`);
    });

  program
    .command('set-defines')
    .description('Set C preprocessor defines')
    .argument('<file>', 'Keil project file')
    .argument('<defines>', 'comma-separated defines')
    .option('-t, --target <name>', 'target to modify (default: first target)')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, defines, options) => {
      const project = createProject(file);
      setDefines(project, options.target, defines.split(',').map((s) => s.trim()));
      const outPath = saveProject(project, options.output);
      console.log(`Saved: ${outPath}`);
    });

  program
    .command('set-includes')
    .description('Set C include paths')
    .argument('<file>', 'Keil project file')
    .argument('<paths>', 'semicolon-separated include paths')
    .option('-t, --target <name>', 'target to modify (default: first target)')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, paths, options) => {
      const project = createProject(file);
      setIncludePaths(project, options.target, paths.split(';').map((s) => s.trim()));
      const outPath = saveProject(project, options.output);
      console.log(`Saved: ${outPath}`);
    });

  program
    .command('add-file')
    .description('Add a source file to a group')
    .argument('<file>', 'Keil project file')
    .argument('<group>', 'target group name')
    .argument('<filePath>', 'path to source file')
    .option('-n, --name <name>', 'file name displayed in project')
    .option('-T, --type <type>', 'file type: c, cpp, asm, lib, obj, text', 'c')
    .option('-t, --target <name>', 'target to modify (default: first target)')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, group, filePath, options) => {
      const project = createProject(file);
      const fileName = options.name || require('path').basename(filePath);
      addFile(project, options.target, group, fileName, filePath, options.type);
      const outPath = saveProject(project, options.output);
      console.log(`Saved: ${outPath}`);
    });

  program
    .command('remove-file')
    .description('Remove a source file from all groups')
    .argument('<file>', 'Keil project file')
    .argument('<filePath>', 'path to source file to remove')
    .option('-t, --target <name>', 'target to modify (default: first target)')
    .option('-o, --output <file>', 'output file (default: overwrite input)')
    .action((file, filePath, options) => {
      const project = createProject(file);
      removeFile(project, options.target, filePath);
      const outPath = saveProject(project, options.output);
      console.log(`Saved: ${outPath}`);
    });

  program.parse();
}

module.exports = { runCli };
