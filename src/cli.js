const { Command } = require('commander');
const { version } = require('../package.json');
const api = require('./api');
const { startMcpServer } = require('./mcp-server');

function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function toCamelCase(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function runCli() {
  const program = new Command();
  program
    .name('keil-project-tools')
    .description('Keil µVision project tools for AI Agents (MCP server and CLI)')
    .version(version);

  program
    .command('mcp')
    .description('Start the MCP server (stdio)')
    .action(() => startMcpServer());

  program
    .command('call <tool> [args]')
    .description('Call an MCP tool directly with JSON arguments. Example: keil-project-tools call read_project \'{"file":"x.uvprojx"}\'')
    .action(async (tool, args) => {
      const handler = api[toCamelCase(tool)];
      if (!handler) {
        console.error(`Unknown tool: ${tool}`);
        process.exit(1);
      }
      try {
        const parsed = args ? JSON.parse(args) : {};
        const result = await handler(parsed);
        outputJson(result);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });

  program.parse();
}

module.exports = { runCli };
