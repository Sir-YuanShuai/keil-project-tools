const fs = require('fs');
const path = require('path');
const reader = require('./reader');
const writer = require('./writer');
const keil = require('./keil-runner');
const { makeError, errorResponse } = require('./errors');

const FILE_TYPE_ENUM = ['c', 'cpp', 'asm', 'lib', 'obj', 'text'];
const COMPACT_PLACEHOLDER_KEYS = new Set(['_count', '_length', '_preview', '_returned']);
const VALID_READ_SECTIONS = ['summary', 'compiler', 'cads', 'aads', 'ldads', 'debug', 'memory'];
const ALL_READ_SECTIONS = ['summary', 'compiler', 'cads', 'aads', 'ldads', 'debug', 'memory'];
const VALID_SEARCH_SCOPES = [
  'groups', 'files',
  'cads_defines', 'cads_undefines', 'cads_include_paths',
  'aads_defines', 'aads_undefines', 'aads_include_paths',
  'ldads_scatter_file', 'ldads_include_libs', 'ldads_linker_misc',
];
const COMPILER_LIST_SECTIONS = [
  'cads_defines', 'cads_undefines', 'cads_include_paths',
  'aads_defines', 'aads_undefines', 'aads_include_paths',
];
const COMPILER_LIST_MAP = {
  cads_defines: {
    getter: (t) => (t.compiler && t.compiler.cads ? t.compiler.cads.defines || [] : []),
    setter: writer.setDefines,
  },
  cads_undefines: {
    getter: (t) => (t.compiler && t.compiler.cads ? t.compiler.cads.undefines || [] : []),
    setter: writer.setCadsUndefines,
  },
  cads_include_paths: {
    getter: (t) => (t.compiler && t.compiler.cads ? t.compiler.cads.include_paths || [] : []),
    setter: writer.setIncludePaths,
  },
  aads_defines: {
    getter: (t) => (t.compiler && t.compiler.aads ? t.compiler.aads.asm_defines || [] : []),
    setter: writer.setAadsDefines,
  },
  aads_undefines: {
    getter: (t) => (t.compiler && t.compiler.aads ? t.compiler.aads.asm_undefines || [] : []),
    setter: writer.setAadsUndefines,
  },
  aads_include_paths: {
    getter: (t) => (t.compiler && t.compiler.aads ? t.compiler.aads.asm_include_paths || [] : []),
    setter: writer.setAadsIncludePaths,
  },
};

function resolveProjectPath(file) {
  if (typeof file !== 'string' || !file.trim()) {
    throw makeError('file-not-found', 'Project file path is required.');
  }
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    throw makeError('file-not-found', `Project file not found: ${resolved}`);
  }
  return resolved;
}

function resolveTargetName(projectPath, targetName) {
  const targets = reader.listTargets(projectPath);
  if (!targets.length) {
    throw makeError('target-not-found', `No targets found in project ${projectPath}`);
  }
  if (targetName) {
    if (!targets.includes(targetName)) {
      throw makeError('target-not-found', `Target '${targetName}' not found in project '${projectPath}'. Available targets: ${JSON.stringify(targets)}`);
    }
    return targetName;
  }
  return targets[0];
}

function assertString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw makeError('invalid-argument', `${name} is required and must be a non-empty string.`);
  }
}

function clampPageArgs(args) {
  const page = Math.max(1, parseInt(args.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(args.perPage, 10) || 20));
  return { page, perPage };
}

function paginateItems(items, args) {
  const { page, perPage } = clampPageArgs(args);
  const total = items.length;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  return { items: items.slice(start, end), total, page, perPage };
}

function summarizeString(value, maxLength = 120) {
  if (typeof value !== 'string' || value.length <= maxLength) return value;
  return { _length: value.length, _preview: value.slice(0, maxLength) + '...' };
}

function compactValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return { _count: value.length };
  if (typeof value === 'string') return summarizeString(value);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = compactValue(v);
    }
    return out;
  }
  return value;
}

function limitArray(arr, max = 100) {
  if (arr.length <= max) return arr;
  return { _count: arr.length, _returned: max };
}

function expandValue(value, compact) {
  if (compact) return compactValue(value);
  if (Array.isArray(value)) return limitArray(value, 100);
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandValue(v, false);
    }
    return out;
  }
  return value;
}

function mapError(err) {
  if (err && err.code) return errorResponse(err.code, err.message);
  const msg = err && err.message ? err.message : String(err);
  if (/target not found/i.test(msg)) return errorResponse('target-not-found', msg);
  if (/group not found/i.test(msg)) return errorResponse('group-not-found', msg);
  if (/group already exists/i.test(msg)) return errorResponse('group-already-exists', msg);
  if (/file not found in group/i.test(msg)) return errorResponse('file-not-found-in-group', msg);
  if (/file already exists/i.test(msg)) return errorResponse('file-already-exists', msg);
  if (/project file not found/i.test(msg)) return errorResponse('file-not-found', msg);
  return errorResponse('internal-error', msg);
}

function runSafe(fn) {
  try {
    return fn();
  } catch (err) {
    return mapError(err);
  }
}

async function runSafeAsync(fn) {
  try {
    return await fn();
  } catch (err) {
    return mapError(err);
  }
}

function buildSummary(target) {
  return {
    toolset_name: target.toolset_name || null,
    device: target.device || null,
    vendor: target.vendor || null,
    pack_id: target.pack_id || null,
    cpu: target.cpu || null,
    output_directory: target.output_directory || null,
    output_name: target.output_name || null,
    create_executable: target.create_executable || false,
    create_hex_file: target.create_hex_file || false,
    before_compile: target.before_compile || null,
    before_make: target.before_make || null,
    after_make: target.after_make || null,
  };
}

function readTargetSection(target, section) {
  switch (section) {
    case 'summary':
      return buildSummary(target);
    case 'compiler':
      return target.compiler || null;
    case 'cads':
      return target.compiler && target.compiler.cads ? target.compiler.cads : null;
    case 'aads':
      return target.compiler && target.compiler.aads ? target.compiler.aads : null;
    case 'ldads':
      return target.compiler && target.compiler.ldads ? target.compiler.ldads : null;
    case 'debug':
      return {
        common_property: target.common_property || null,
        dll_option: target.dll_option || null,
        debug_option: target.debug_option || null,
        utilities: target.utilities || null,
      };
    case 'memory':
      return target.on_chip_memories || null;
    default:
      return null;
  }
}

function listProjects(args = {}) {
  return runSafe(() => {
    if (args.file) {
      const filePath = resolveProjectPath(args.file);
      const workspace = reader.readWorkspace(filePath);
      return { projects: workspace.projects };
    }
    const root = args.root || process.cwd();
    const projects = keil.scanProjects(root);
    return { projects };
  });
}

function readProject(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const summary = reader.readProjectSummary(projectPath);
    return {
      project_path: summary.project_path,
      schema_version: summary.schema_version,
      targets: summary.targets,
    };
  });
}

function readTarget(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    const project = reader.readProject(projectPath);
    const target = project.targets.find((t) => t.target_name === targetName);
    const compact = args.compact !== false;

    let requested = args.section || 'summary';
    if (typeof requested === 'string') {
      if (requested === 'all') requested = ALL_READ_SECTIONS;
      else requested = [requested];
    }
    if (!Array.isArray(requested) || requested.some((s) => !VALID_READ_SECTIONS.includes(s))) {
      throw makeError('invalid-section', `section must be one of ${JSON.stringify(VALID_READ_SECTIONS)} or 'all'.`);
    }

    const includeMemory = requested.includes('memory') || requested.includes('all');
    const result = { target_name: targetName };

    if (requested.length === 1) {
      result.section = args.section || 'summary';
    } else {
      result.sections = args.section === 'all' ? ALL_READ_SECTIONS : requested;
    }

    for (const section of requested) {
      const raw = readTargetSection(target, section);
      if (section === 'memory') {
        if (raw && typeof raw === 'object') {
          result.memory = compact ? { _count: Object.keys(raw).length } : expandValue(raw, false);
        } else {
          result.memory = null;
        }
      } else {
        result[section] = compact ? compactValue(raw) : expandValue(raw, false);
      }
    }

    return result;
  });
}

function readGroups(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    const project = reader.readProject(projectPath);
    const target = project.targets.find((t) => t.target_name === targetName);
    const groups = target.groups || [];
    const includeFiles = args.include_files === true;
    const { page, perPage } = clampPageArgs(args);
    const total = groups.length;
    const start = (page - 1) * perPage;
    const end = Math.min(start + perPage, total);
    const sliced = groups.slice(start, end);

    const items = includeFiles
      ? sliced.map((g) => ({
          name: g.name,
          files: (g.files || []).map((f) => ({
            name: f.name,
            type: f.type,
            path: summarizeString(f.path),
          })),
        }))
      : sliced.map((g) => g.name);

    return { items, total, page, perPage };
  });
}

function createMatcher(keyword, caseSensitive = false, exactMatch = false) {
  if (!keyword) return () => true;
  const target = caseSensitive ? keyword : keyword.toLowerCase();
  if (exactMatch) {
    return (text) => (caseSensitive ? text : text.toLowerCase()) === target;
  }
  return (text) => (caseSensitive ? text : text.toLowerCase()).includes(target);
}

function search(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    assertString(args.scope, 'scope');
    assertString(args.keyword, 'keyword');
    if (!VALID_SEARCH_SCOPES.includes(args.scope)) {
      throw makeError('invalid-section', `scope must be one of ${JSON.stringify(VALID_SEARCH_SCOPES)}.`);
    }

    const project = reader.readProject(projectPath);
    const target = project.targets.find((t) => t.target_name === targetName);
    const match = createMatcher(args.keyword, args.caseSensitive === true, args.exactMatch === true);
    let all = [];

    switch (args.scope) {
      case 'groups':
        all = (target.groups || []).map((g) => g.name).filter((name) => match(name));
        break;
      case 'files':
        for (const group of target.groups || []) {
          for (const file of group.files || []) {
            if (args.exactMatch === true) {
              if (match(file.path)) {
                all.push({ name: file.name, type: file.type, path: file.path });
              }
            } else {
              const haystack = `${file.name} ${file.path} ${file.absolute_path || ''}`;
              if (match(haystack)) {
                all.push({ name: file.name, type: file.type, path: file.path });
              }
            }
          }
        }
        break;
      case 'cads_defines':
        all = ((target.compiler && target.compiler.cads && target.compiler.cads.defines) || []).filter((d) => match(d));
        break;
      case 'cads_undefines':
        all = ((target.compiler && target.compiler.cads && target.compiler.cads.undefines) || []).filter((d) => match(d));
        break;
      case 'cads_include_paths':
        all = ((target.compiler && target.compiler.cads && target.compiler.cads.include_paths) || []).filter((p) => match(p));
        break;
      case 'aads_defines':
        all = ((target.compiler && target.compiler.aads && target.compiler.aads.asm_defines) || []).filter((d) => match(d));
        break;
      case 'aads_undefines':
        all = ((target.compiler && target.compiler.aads && target.compiler.aads.asm_undefines) || []).filter((d) => match(d));
        break;
      case 'aads_include_paths':
        all = ((target.compiler && target.compiler.aads && target.compiler.aads.asm_include_paths) || []).filter((p) => match(p));
        break;
      case 'ldads_scatter_file':
        all = [((target.compiler && target.compiler.ldads && target.compiler.ldads.scatter_file) || '')].filter((s) => s && match(s));
        break;
      case 'ldads_include_libs':
        all = ((target.compiler && target.compiler.ldads && target.compiler.ldads.include_libs) || []).filter((s) => match(s));
        break;
      case 'ldads_linker_misc':
        all = [((target.compiler && target.compiler.ldads && target.compiler.ldads.linker_misc) || '')].filter((s) => s && match(s));
        break;
      default:
        break;
    }

    const paginated = paginateItems(all, args);
    return { scope: args.scope, ...paginated };
  });
}

function normalizePathForCompare(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

function manageCompilerLists(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    assertString(args.section, 'section');
    assertString(args.action, 'action');
    if (!COMPILER_LIST_SECTIONS.includes(args.section)) {
      throw makeError('invalid-section', `section must be one of ${JSON.stringify(COMPILER_LIST_SECTIONS)}.`);
    }
    if (!['add', 'remove', 'set'].includes(args.action)) {
      throw makeError('invalid-action', `action must be one of ['add', 'remove', 'set'].`);
    }
    if (args.value === undefined || args.value === null) {
      throw makeError('invalid-argument', 'value is required.');
    }
    const isPathSection = args.section.endsWith('_include_paths');
    const values = Array.isArray(args.value) ? args.value : [args.value];
    if (values.some((v) => typeof v !== 'string')) {
      throw makeError('invalid-argument', 'All values must be strings.');
    }
    if (args.action === 'set' && !Array.isArray(args.value)) {
      throw makeError('invalid-argument', 'set action requires an array value.');
    }

    const project = writer.createProject(projectPath);
    const target = project.data.Project.Targets.Target;
    // Prefer reading the already-parsed project to get the current list.
    const parsedProject = reader.readProject(projectPath);
    const parsedTarget = parsedProject.targets.find((t) => t.target_name === targetName);
    const map = COMPILER_LIST_MAP[args.section];
    const current = map.getter(parsedTarget);

    let newList;
    let count = 0;
    if (args.action === 'set') {
      newList = values.slice();
      count = newList.length;
    } else if (args.action === 'add') {
      newList = current.slice();
      const existing = isPathSection
        ? new Set(newList.map(normalizePathForCompare))
        : new Set(newList);
      for (const v of values) {
        const key = isPathSection ? normalizePathForCompare(v) : v;
        if (!existing.has(key)) {
          newList.push(v);
          existing.add(key);
          count += 1;
        }
      }
    } else {
      // remove
      const removeSet = isPathSection
        ? new Set(values.map(normalizePathForCompare))
        : new Set(values);
      const originalLength = current.length;
      newList = current.filter((c) => {
        const key = isPathSection ? normalizePathForCompare(c) : c;
        return !removeSet.has(key);
      });
      count = originalLength - newList.length;
    }

    map.setter(project, targetName, newList);
    const saved = writer.saveProject(project);
    return { saved, section: args.section, action: args.action, value: args.value, count };
  });
}

function hasCompactPlaceholder(data) {
  if (data === null || data === undefined || typeof data !== 'object') return false;
  if (Array.isArray(data)) return false;
  for (const key of Object.keys(data)) {
    if (COMPACT_PLACEHOLDER_KEYS.has(key)) return true;
    if (hasCompactPlaceholder(data[key])) return true;
  }
  return false;
}

function updateTargetConfig(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    assertString(args.section, 'section');
    if (!args.data || typeof args.data !== 'object' || Array.isArray(args.data)) {
      throw makeError('invalid-argument', 'data must be an object.');
    }
    const validSections = ['compiler', 'cads', 'aads', 'ldads', 'debug', 'memory', 'summary'];
    if (!validSections.includes(args.section)) {
      throw makeError('invalid-section', `section must be one of ${JSON.stringify(validSections)}.`);
    }
    if (hasCompactPlaceholder(args.data)) {
      throw makeError('invalid-compact-data', 'data contains compact placeholders (_count, _length, _preview, _returned). Read with compact=false first.');
    }
    if (args.section === 'summary' && args.confirm !== true) {
      throw makeError('confirm-required', 'Updating summary requires confirm: true because it contains sensitive Device/Pack/Toolset fields.');
    }

    const project = writer.createProject(projectPath);
    const updaterMap = {
      compiler: writer.updateTargetCompiler,
      cads: writer.updateCads,
      aads: writer.updateAads,
      ldads: writer.updateLDads,
      debug: writer.updateTargetDebugUtilities,
      memory: writer.updateOnChipMemories,
    };
    if (updaterMap[args.section]) {
      updaterMap[args.section](project, targetName, args.data);
    } else if (args.section === 'summary') {
      const commonData = { ...args.data };
      delete commonData.toolset_name;
      delete commonData.toolset_number;
      writer.updateTargetCommonOption(project, targetName, commonData);
      const targets = project.data.Project.Targets.Target;
      const targetArray = Array.isArray(targets) ? targets : [targets];
      const target = targetArray.find((t) => t.TargetName === targetName);
      if (target) {
        if (args.data.toolset_name !== undefined) target.ToolsetName = String(args.data.toolset_name);
        if (args.data.toolset_number !== undefined) target.ToolsetNumber = String(args.data.toolset_number);
      }
    }
    const saved = writer.saveProject(project);
    return { saved, section: args.section };
  });
}

function manageGroup(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    assertString(args.action, 'action');
    assertString(args.group, 'group');
    if (!['add', 'remove', 'rename'].includes(args.action)) {
      throw makeError('invalid-action', `action must be one of ['add', 'remove', 'rename'].`);
    }
    const project = writer.createProject(projectPath);
    const targets = project.data.Project.Targets.Target;
    const targetArray = Array.isArray(targets) ? targets : [targets];
    const target = targetName ? targetArray.find((t) => t.TargetName === targetName) : targetArray[0];
    if (!target) {
      throw makeError('target-not-found', `Target '${targetName}' not found.`);
    }
    const groups = target.Groups ? (Array.isArray(target.Groups.Group) ? target.Groups.Group : target.Groups.Group ? [target.Groups.Group] : []) : [];

    if (args.action === 'add') {
      if (groups.some((g) => g.GroupName === args.group)) {
        throw makeError('group-already-exists', `Group '${args.group}' already exists in target '${targetName}'.`);
      }
      writer.addGroup(project, targetName, args.group);
    } else if (args.action === 'remove') {
      if (!groups.some((g) => g.GroupName === args.group)) {
        throw makeError('group-not-found', `Group '${args.group}' not found in target '${targetName}'.`);
      }
      writer.removeGroup(project, targetName, args.group);
    } else if (args.action === 'rename') {
      assertString(args.newName, 'newName');
      if (!groups.some((g) => g.GroupName === args.group)) {
        throw makeError('group-not-found', `Group '${args.group}' not found in target '${targetName}'.`);
      }
      if (groups.some((g) => g.GroupName === args.newName)) {
        throw makeError('group-name-conflict', `Group '${args.newName}' already exists in target '${targetName}'.`);
      }
      writer.renameGroup(project, targetName, args.group, args.newName);
    }

    const saved = writer.saveProject(project);
    return { saved, action: args.action, group: args.group, newName: args.newName || undefined };
  });
}

function renameTarget(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    assertString(args.target, 'target');
    assertString(args.newName, 'newName');
    const targets = reader.listTargets(projectPath);
    if (!targets.includes(args.target)) {
      throw makeError('target-not-found', `Target '${args.target}' not found in project '${projectPath}'. Available targets: ${JSON.stringify(targets)}`);
    }
    if (targets.includes(args.newName)) {
      throw makeError('target-name-conflict', `Target '${args.newName}' already exists in project '${projectPath}'.`);
    }
    const project = writer.createProject(projectPath);
    writer.setTargetName(project, args.target, args.newName);
    const saved = writer.saveProject(project);
    return { saved, target: args.target, newName: args.newName };
  });
}

function manageFile(args = {}) {
  return runSafe(() => {
    const projectPath = resolveProjectPath(args.file);
    const targetName = resolveTargetName(projectPath, args.target);
    assertString(args.action, 'action');
    if (!['add', 'remove', 'move'].includes(args.action)) {
      throw makeError('invalid-action', `action must be one of ['add', 'remove', 'move'].`);
    }
    if (!Array.isArray(args.items) || !args.items.length) {
      throw makeError('invalid-argument', 'items must be a non-empty array.');
    }

    for (const item of args.items) {
      assertString(item.group, 'items[].group');
      if (!Array.isArray(item.files) || !item.files.length) {
        throw makeError('invalid-argument', 'items[].files must be a non-empty array.');
      }
      if (args.action === 'add') {
        if (!FILE_TYPE_ENUM.includes(item.type)) {
          throw makeError('invalid-argument', `type must be one of ${JSON.stringify(FILE_TYPE_ENUM)}.`);
        }
      }
      if (args.action === 'move') {
        assertString(item.toGroup, 'items[].toGroup');
      }
    }

    const project = writer.createProject(projectPath);
    const result = writer.manageFile(project, targetName, args.action, args.items);
    const saved = writer.saveProject(project);

    if (result.failures && result.failures.length) {
      return {
        error: true,
        code: 'partial-failure',
        message: `Some files were not matched in their groups.`,
        saved,
        action: args.action,
        count: result.count,
        failures: result.failures,
      };
    }
    return { saved, action: args.action, count: result.count };
  });
}

async function keilScan(args = {}) {
  const result = await keil.detectEnvironment(args);
  if (result.status === 'ok' && result.uv4_exe) {
    return { uv4: result.uv4_exe, detected: true };
  }
  return errorResponse('environment-missing', result.error ? result.error.message : 'UV4.exe not found. Set KEIL_UV4_EXE environment variable or pass uv4 path.');
}

function tailLog(logFile, lines) {
  if (!logFile || !fs.existsSync(logFile)) return '';
  const text = fs.readFileSync(logFile, 'utf8');
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

async function keilBuild(args = {}) {
  const action = args.action || 'build';
  const validActions = ['build', 'rebuild', 'clean', 'scan-artifacts', 'detect'];
  if (!validActions.includes(action)) {
    return errorResponse('invalid-action', `action must be one of ${JSON.stringify(validActions)}.`);
  }
  if (!args.project && action !== 'detect') {
    return errorResponse('invalid-argument', 'project is required.');
  }

  if (action === 'detect') {
    if (args.project) {
      resolveProjectPath(args.project);
      resolveTargetName(args.project, args.target);
    }
    const result = await keil.detectEnvironment(args);
    if (result.status === 'ok') {
      return { success: true, detected: true, uv4: result.uv4_exe };
    }
    return errorResponse('environment-missing', result.error ? result.error.message : 'UV4.exe not found.');
  }

  if (action === 'scan-artifacts') {
    return runSafeAsync(async () => {
      const targetName = resolveTargetName(args.project, args.target);
      const result = await keil.scanArtifactsAction({ ...args, target: targetName });
      return { success: result.status === 'ok', artifacts: result.artifacts || [] };
    });
  }

  return runSafeAsync(async () => {
    const targetName = resolveTargetName(args.project, args.target);
    const fn = action === 'build' ? keil.build : action === 'rebuild' ? keil.rebuild : keil.clean;
    const result = await fn({ ...args, target: targetName });
    const logTailLines = Math.min(1000, Math.max(1, parseInt(args.log_tail_lines, 10) || 100));
    const logFile = result.details && result.details.log_file ? result.details.log_file : null;
    const logExcerpt = tailLog(logFile, logTailLines);

    if (result.status === 'ok') {
      const artifacts = result.artifacts && result.artifacts.artifacts ? result.artifacts.artifacts : [];
      return { success: true, log_excerpt: logExcerpt, log_file: logFile, log_tail_lines: logTailLines, artifacts };
    }
    const code = (result.error && result.error.code) || 'build-failed';
    return {
      success: false,
      code,
      log_excerpt: logExcerpt,
      log_file: logFile,
      log_tail_lines: logTailLines,
      message: (result.error && result.error.message) || `${action} failed.`,
    };
  });
}

async function keilFlash(args = {}) {
  if (!args.project) {
    return errorResponse('invalid-argument', 'project is required.');
  }
  return runSafeAsync(async () => {
    const targetName = resolveTargetName(args.project, args.target);
    const result = await keil.flash({ ...args, target: targetName });
    const logFile = result.details && result.details.log_file ? result.details.log_file : null;

    if (result.status === 'ok') {
      return { success: true, flashed: true };
    }
    let code = (result.error && result.error.code) || 'flash-failed';
    if (code === 'build_not_clean') code = 'build-required';
    return {
      success: false,
      code,
      log_file: logFile,
      message: (result.error && result.error.message) || 'Flash failed.',
    };
  });
}

module.exports = {
  listProjects,
  readProject,
  readTarget,
  readGroups,
  search,
  manageCompilerLists,
  updateTargetConfig,
  manageGroup,
  renameTarget,
  manageFile,
  keilScan,
  keilBuild,
  keilFlash,
};
