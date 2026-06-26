const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { listTargets, readTargetSummary } = require('./reader');

const PROJECT_PROFILE_NAME = '.em_skill.json';
const EMBEDDED_SKILLS_STATE = '.embeddedskills/state.json';

const ACTION_FLAGS = {
  build: '-b',
  rebuild: '-r',
  clean: '-c',
  flash: '-f',
};

const COMMON_KEIL_PATHS = [
  'C:\\Keil_v5\\UV4\\UV4.exe',
  'C:\\Keil_v5\\UV4\\Uv4.exe',
  'C:\\Keil\\UV4\\UV4.exe',
  'C:\\Keil\\UV4\\Uv4.exe',
  'C:\\Program Files\\Keil\\UV4\\UV4.exe',
  'C:\\Program Files (x86)\\Keil\\UV4\\UV4.exe',
  'C:\\Program Files\\Keil_v5\\UV4\\UV4.exe',
  'C:\\Program Files (x86)\\Keil_v5\\UV4\\UV4.exe',
];

function fileExists(filePath) {
  return typeof filePath === 'string' && filePath.length > 0 && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function loadJson(filePath, defaultValue = {}) {
  if (!filePath || !fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function findProjectRoot(projectPath) {
  return projectPath ? path.dirname(path.resolve(projectPath)) : process.cwd();
}

function resolveWorkspace(options = {}) {
  if (options.workspace) return path.resolve(options.workspace);
  if (options.project) return findProjectRoot(options.project);
  return process.cwd();
}

function loadProjectProfile(workspace) {
  if (!workspace) return {};
  return loadJson(path.resolve(workspace, PROJECT_PROFILE_NAME));
}

function saveProjectProfile(workspace, data) {
  if (!workspace) return;
  saveJson(path.resolve(workspace, PROJECT_PROFILE_NAME), data);
}

function loadEmbeddedSkillsState(workspace) {
  if (!workspace) return {};
  return loadJson(path.resolve(workspace, EMBEDDED_SKILLS_STATE));
}

function saveEmbeddedSkillsState(workspace, data) {
  if (!workspace) return;
  saveJson(path.resolve(workspace, EMBEDDED_SKILLS_STATE), data);
}

function resolveUv4Exe(options = {}) {
  // 1. Tool parameter has the highest priority.
  if (options.uv4) {
    const resolved = path.resolve(options.uv4);
    if (fileExists(resolved)) return resolved;
  }

  // 2. Environment variable.
  if (process.env.KEIL_UV4_EXE) {
    const resolved = path.resolve(process.env.KEIL_UV4_EXE);
    if (fileExists(resolved)) return resolved;
  }

  // 3. Transparent fallbacks: common install paths and PATH.
  for (const p of COMMON_KEIL_PATHS) {
    if (fileExists(p)) return p;
  }

  if (process.env.PATH) {
    const candidates = ['UV4.exe', 'Uv4.exe', 'uv4.exe'];
    for (const dir of process.env.PATH.split(path.delimiter)) {
      for (const name of candidates) {
        const full = path.join(dir, name);
        if (fileExists(full)) return path.resolve(full);
      }
    }
  }

  return null;
}

function scanProjects(root) {
  const resolvedRoot = path.resolve(root || process.cwd());
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Directory not found: ${resolvedRoot}`);
  }
  if (!fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Not a directory: ${resolvedRoot}`);
  }

  const projects = [];
  const skipDirs = new Set(['.git', 'node_modules', '.embeddedskills', 'Objects', 'Listings', 'DebugConfig', 'RTE']);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.uvprojx') || entry.name.endsWith('.uvproj') || entry.name.endsWith('.uvmpw')) {
          projects.push(fullPath);
        }
      }
    }
  }
  walk(resolvedRoot);
  return projects.sort();
}

function resolveTarget(projectPath, targetName) {
  const targets = listTargets(projectPath);
  if (targetName) {
    if (!targets.includes(targetName)) {
      throw new Error(`Target "${targetName}" not found in ${projectPath}. Available targets: ${targets.join(', ')}`);
    }
    return targetName;
  }
  if (targets.length === 0) {
    throw new Error(`No targets found in ${projectPath}`);
  }
  return targets[0];
}

function detectToolchain(targetSummary) {
  const name = targetSummary.toolset_name || '';
  if (name.includes('CLANG') || name.includes('clang')) return 'ARMCLANG';
  if (name.includes('GCC') || name.includes('gcc')) return 'ARMGCC';
  if (name.includes('ADS') || name.includes('ads')) return 'ARMCC';
  return name || 'ARMCC';
}

function decodeLogBuffer(buffer) {
  const candidates = ['utf8', 'latin1'];
  for (const enc of candidates) {
    try {
      const text = buffer.toString(enc);
      if (enc === 'utf8' && text.includes('\uFFFD')) continue;
      return text;
    } catch {
      continue;
    }
  }
  return buffer.toString('latin1');
}

function parseBuildLog(logText) {
  const summaryMatch = logText.match(/(\d+)\s+Error\(s\),\s+(\d+)\s+Warning\(s\)/i);
  let errors = 0;
  let warnings = 0;
  if (summaryMatch) {
    errors = parseInt(summaryMatch[1], 10);
    warnings = parseInt(summaryMatch[2], 10);
  } else {
    errors = (logText.match(/^.*?\berror\b.*?$/gim) || []).length;
    warnings = (logText.match(/^.*?\bwarning\b.*?$/gim) || []).length;
  }

  const sizeMatch = logText.match(/Code[=\s]+(\d+)\s+RO-data[=\s]+(\d+)\s+RW-data[=\s]+(\d+)\s+ZI-data[=\s]+(\d+)/i);
  const memory = {};
  if (sizeMatch) {
    memory.code = parseInt(sizeMatch[1], 10);
    memory.ro_data = parseInt(sizeMatch[2], 10);
    memory.rw_data = parseInt(sizeMatch[3], 10);
    memory.zi_data = parseInt(sizeMatch[4], 10);
    memory.flash = memory.code + memory.ro_data;
    memory.ram = memory.rw_data + memory.zi_data;
  }

  const elapsedMatch = logText.match(/Build Time Elapsed:\s+(\d{2}:\d{2}:\d{2})/i);
  const elapsed = elapsedMatch ? elapsedMatch[1] : null;

  const lines = logText.split('\n');
  let firstError = null;
  for (const line of lines) {
    if (/\berror\b/i.test(line) && !/Error\(s\)/i.test(line)) {
      firstError = line.trim();
      break;
    }
  }

  return { errors, warnings, memory, elapsed, first_error: firstError };
}

function parseFlashLog(logText) {
  const steps = [];
  if (/Erase\s+Done/i.test(logText)) steps.push('Erase Done');
  if (/Program\s+Done|Programming\s+Done/i.test(logText)) steps.push('Programming Done');
  if (/Verify\s+OK/i.test(logText)) steps.push('Verify OK');
  if (/Application\s+running/i.test(logText)) steps.push('Application running');
  if (/Flash\s+Load\s+finished/i.test(logText)) steps.push('Flash Load finished');
  return steps;
}

function classifyFailure(action, exitCode, metrics, logText) {
  if (exitCode === null) return 'environment-missing';
  if (action === 'flash') {
    if (/connection|connect|fail|unable|not found/i.test(logText)) return 'connection-failure';
    return 'project-config-error';
  }
  if (/cannot find|not found|no such file/i.test(logText)) return 'project-config-error';
  if (metrics.errors > 0) return 'project-config-error';
  return 'environment-missing';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log10(bytes) / 3);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

function runUv4(action, projectPath, targetName, options = {}) {
  return new Promise((resolve) => {
    const uv4Exe = resolveUv4Exe({ ...options, project: projectPath });
    if (!uv4Exe) {
      return resolve({
        status: 'error',
        action,
        error: {
          code: 'environment-missing',
          message: 'UV4.exe not found. Set KEIL_UV4_EXE environment variable (preferred), or pass the uv4 tool parameter to override.',
        },
      });
    }

    if (process.platform !== 'win32' && action !== 'scan-artifacts') {
      return resolve({
        status: 'error',
        action,
        error: {
          code: 'environment-missing',
          message: `Keil MDK ${action} requires Windows. Current platform: ${process.platform}`,
        },
      });
    }

    const workspace = resolveWorkspace({ ...options, project: projectPath });
    const logDir = options.log_dir
      ? path.resolve(workspace, options.log_dir)
      : path.join(workspace, '.embeddedskills', 'build');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logFile = path.join(
      logDir,
      `${path.basename(projectPath, path.extname(projectPath))}-${targetName}-${action}-${timestamp}.log`
    );

    const flag = ACTION_FLAGS[action];
    const args = [flag, projectPath, '-t', targetName, '-j0'];
    if (action === 'rebuild' && options.clean_first) {
      args.push('-cr');
    }

    const startTime = Date.now();
    const child = spawn(uv4Exe, args, { windowsHide: true });
    const chunks = [];
    const errChunks = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errChunks.push(chunk));

    child.on('error', (err) => {
      const logText = err.message || String(err);
      fs.writeFileSync(logFile, logText, 'utf8');
      resolve({
        status: 'error',
        action,
        error: { code: 'spawn-error', message: err.message },
        details: { project: projectPath, target: targetName, uv4_exe: uv4Exe, log_file: logFile },
      });
    });

    child.on('close', (exitCode) => {
      const allBuffer = Buffer.concat([Buffer.concat(chunks), Buffer.concat(errChunks)]);
      const logText = decodeLogBuffer(allBuffer);
      fs.writeFileSync(logFile, logText, 'utf8');

      const elapsedMs = Date.now() - startTime;
      const metrics = action === 'flash' ? {} : parseBuildLog(logText);
      const flashSteps = action === 'flash' ? parseFlashLog(logText) : [];

      const result = {
        status: exitCode === 0 ? 'ok' : 'error',
        action,
        summary: `${action} ${exitCode === 0 ? 'success' : 'failed'}, errors=${metrics.errors || 0} warnings=${metrics.warnings || 0}`,
        details: {
          project: projectPath,
          target: targetName,
          uv4_exe: uv4Exe,
          log_file: logFile,
          exit_code: exitCode,
        },
        metrics,
        timing: { elapsed_ms: elapsedMs, elapsed_formatted: formatElapsed(elapsedMs) },
      };

      if (action === 'flash') {
        result.metrics = { flash_steps: flashSteps };
      }

      if (exitCode !== 0) {
        result.error = {
          code: exitCode === null ? 'spawn-error' : `${action}-failed`,
          message: metrics.first_error || `UV4 exited with code ${exitCode}`,
          classification: classifyFailure(action, exitCode, metrics, logText),
        };
      }

      resolve(result);
    });
  });
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function scanArtifacts(projectPath, targetName) {
  const target = readTargetSummary(projectPath, targetName);
  const projectDir = path.dirname(path.resolve(projectPath));
  const outputDir = path.resolve(projectDir, (target.output_directory || '.').replace(/\\/g, '/'));
  const outputName = target.output_name || path.basename(projectPath, path.extname(projectPath));

  const artifacts = [];
  const kinds = [
    { ext: '.axf', kind: 'elf' },
    { ext: '.hex', kind: 'hex' },
    { ext: '.bin', kind: 'bin' },
  ];

  for (const { ext, kind } of kinds) {
    const filePath = path.join(outputDir, `${outputName}${ext}`);
    if (fileExists(filePath)) {
      const stat = fs.statSync(filePath);
      artifacts.push({ path: filePath, kind, size: stat.size, size_human: formatBytes(stat.size) });
    }
  }

  // Fallback: search all files in output directory matching the output name prefix.
  if (artifacts.length === 0 && fs.existsSync(outputDir) && fs.statSync(outputDir).isDirectory()) {
    const entries = fs.readdirSync(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.startsWith(outputName.toLowerCase())) {
        const kind = lower.endsWith('.axf') ? 'elf' : lower.endsWith('.hex') ? 'hex' : lower.endsWith('.bin') ? 'bin' : null;
        if (kind) {
          const filePath = path.join(outputDir, entry.name);
          const stat = fs.statSync(filePath);
          artifacts.push({ path: filePath, kind, size: stat.size, size_human: formatBytes(stat.size) });
        }
      }
    }
  }

  artifacts.sort((a, b) => {
    const order = { elf: 0, hex: 1, bin: 2 };
    return order[a.kind] - order[b.kind];
  });

  return {
    project: projectPath,
    target: targetName,
    output_directory: outputDir,
    artifacts,
    preferred: artifacts[0] || null,
  };
}

async function checkOperationMode(options, action) {
  const mode = options.operation_mode ?? 1;
  if (mode === 3 && !options.confirm) {
    return {
      allowed: false,
      reason: `operation_mode=3 requires explicit confirmation. Pass confirm=true to execute ${action}.`,
    };
  }
  return { allowed: true, mode };
}

async function checkLastBuild(workspace) {
  const profile = loadProjectProfile(workspace);
  const state = loadEmbeddedSkillsState(workspace);
  const last = profile.last_build || state.last_build || {};
  return last.status === 'ok' && last.action !== 'clean';
}

async function performBuild(action, projectPath, targetName, options = {}) {
  const permission = await checkOperationMode(options, action);
  if (!permission.allowed) {
    return {
      status: 'error',
      action,
      error: { code: 'confirmation-required', message: permission.reason },
    };
  }

  const result = await runUv4(action, projectPath, targetName, options);
  if (result.status === 'ok' && action !== 'clean') {
    const artifacts = scanArtifacts(projectPath, targetName);
    result.artifacts = artifacts;
    result.details.flash_file = artifacts.artifacts.find((a) => a.kind === 'hex')?.path || null;
    result.details.debug_file = artifacts.artifacts.find((a) => a.kind === 'elf')?.path || null;
    result.details.artifact = artifacts.preferred?.path || null;

    if (!artifacts.preferred) {
      result.status = 'error';
      result.error = {
        code: 'artifact-missing',
        message: 'Build succeeded but no AXF/HEX/BIN artifact was found in the output directory.',
      };
    }

    const workspace = resolveWorkspace({ ...options, project: projectPath });
    const targetSummary = readTargetSummary(projectPath, targetName);
    const profile = loadProjectProfile(workspace);
    profile.project = projectPath;
    profile.target = targetName;
    profile.target_mcu = targetSummary.device || targetSummary.cpu || null;
    profile.toolchain = detectToolchain(targetSummary);
    if (artifacts.preferred) {
      profile.artifact_path = artifacts.preferred.path;
      profile.artifact_kind = artifacts.preferred.kind;
    }
    profile.last_build = {
      status: result.status,
      action,
      timestamp: new Date().toISOString(),
      target: targetName,
    };
    saveProjectProfile(workspace, profile);

    const state = loadEmbeddedSkillsState(workspace);
    state.keil = state.keil || {};
    state.keil.project = projectPath;
    state.keil.target = targetName;
    state.keil.last_build = profile.last_build;
    saveEmbeddedSkillsState(workspace, state);
  }

  return result;
}

async function performFlash(action, projectPath, targetName, options = {}) {
  const workspace = resolveWorkspace({ ...options, project: projectPath });

  if (!options.skip_build_check) {
    const lastBuildOk = await checkLastBuild(workspace);
    if (!lastBuildOk) {
      return {
        status: 'error',
        action,
        error: {
          code: 'build_not_clean',
          message: 'Recent build failed or not found. Build first, or pass skip_build_check=true.',
        },
      };
    }
  }

  const permission = await checkOperationMode(options, action);
  if (!permission.allowed) {
    return {
      status: 'error',
      action,
      error: { code: 'confirmation-required', message: permission.reason },
    };
  }

  const result = await runUv4(action, projectPath, targetName, options);
  const targetSummary = readTargetSummary(projectPath, targetName);
  result.details.target_mcu = targetSummary.device || targetSummary.cpu || null;
  result.details.debugger = targetSummary.debugger_driver || null;

  const profile = loadProjectProfile(workspace);
  profile.last_flash = {
    status: result.status,
    timestamp: new Date().toISOString(),
    target: targetName,
  };
  saveProjectProfile(workspace, profile);

  return result;
}

async function detectEnvironment(options = {}) {
  const uv4Exe = resolveUv4Exe(options);

  return {
    status: uv4Exe ? 'ok' : 'error',
    uv4_exe: uv4Exe,
    platform: process.platform,
    config_sources: {
      parameter: options.uv4 || null,
      env: process.env.KEIL_UV4_EXE || null,
    },
    error: uv4Exe
      ? null
      : {
          code: 'environment-missing',
          message: 'UV4.exe not found. Set KEIL_UV4_EXE environment variable (preferred), or pass the uv4 tool parameter to override.',
        },
  };
}

async function scan(options = {}) {
  const root = options.root || resolveWorkspace(options);
  const projects = scanProjects(root);
  return {
    status: 'ok',
    action: 'scan',
    root,
    projects,
    count: projects.length,
  };
}

async function targets(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'targets', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targets = listTargets(options.project);
  return {
    status: 'ok',
    action: 'targets',
    project: options.project,
    targets,
    count: targets.length,
  };
}

async function scanArtifactsAction(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'scan-artifacts', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targetName = resolveTarget(options.project, options.target);
  const artifacts = scanArtifacts(options.project, targetName);
  return {
    status: 'ok',
    action: 'scan-artifacts',
    project: options.project,
    target: targetName,
    ...artifacts,
  };
}

async function build(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'build', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targetName = resolveTarget(options.project, options.target);
  return performBuild('build', options.project, targetName, options);
}

async function rebuild(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'rebuild', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targetName = resolveTarget(options.project, options.target);
  return performBuild('rebuild', options.project, targetName, options);
}

async function clean(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'clean', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targetName = resolveTarget(options.project, options.target);
  return performBuild('clean', options.project, targetName, options);
}

async function flash(options = {}) {
  if (!options.project) {
    return { status: 'error', action: 'flash', error: { code: 'missing-project', message: 'project path is required' } };
  }
  const targetName = resolveTarget(options.project, options.target);
  return performFlash('flash', options.project, targetName, options);
}

async function detectAction(options = {}) {
  return detectEnvironment(options);
}

module.exports = {
  resolveUv4Exe,
  detectEnvironment,
  scanProjects,
  resolveTarget,
  scanArtifacts,
  runUv4,
  parseBuildLog,
  parseFlashLog,
  formatBytes,
  formatElapsed,
  build,
  rebuild,
  clean,
  flash,
  scan,
  targets,
  scanArtifactsAction,
  detectAction,
  loadProjectProfile,
  saveProjectProfile,
  loadEmbeddedSkillsState,
};
