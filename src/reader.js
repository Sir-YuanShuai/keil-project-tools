const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const FILE_TYPE_MAP = {
  1: 'c',
  2: 'asm',
  3: 'obj',
  4: 'lib',
  5: 'text',
  8: 'cpp',
};

function parseXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  return parser.parse(xml);
}

function splitSemicolon(text) {
  if (!text) return [];
  return text.split(';').map((s) => s.trim()).filter(Boolean);
}

function toSnakeCase(str) {
  if (typeof str !== 'string') return str;
  if (str.startsWith('@_')) return str;
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function deepSnakeCase(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSnakeCase);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = deepSnakeCase(value);
  }
  return result;
}

function splitComma(text) {
  if (!text) return [];
  // Keil defines can be separated by commas or spaces depending on the project generator.
  return text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function normalizePath(filePath, projectDir) {
  if (!filePath) return { original: filePath, absolute: filePath, normalized: '' };

  const original = filePath.replace(/\\/g, '/');

  const keilVars = ['PRJ_DIR$', 'ROJ_DIR$', 'CWD$', 'UV4$'];
  if (keilVars.some((v) => original.startsWith(v))) {
    return { original: filePath, absolute: original, normalized: original.toLowerCase() };
  }

  // Detect Windows absolute paths (e.g., C:/...) on any platform.
  const isWindowsAbsolute = /^[A-Za-z]:/.test(original);

  if (isWindowsAbsolute || path.isAbsolute(original)) {
    return { original: filePath, absolute: original, normalized: original.toLowerCase() };
  }

  const absolute = path.resolve(projectDir, original);
  return { original: filePath, absolute, normalized: absolute.toLowerCase() };
}

function parseFile(fileObj, projectDir) {
  const fileType = fileObj.FileType;
  const fileName = fileObj.FileName;
  const filePath = fileObj.FilePath;
  const paths = normalizePath(filePath, projectDir);

  return {
    name: fileName,
    type: FILE_TYPE_MAP[fileType] || `unknown(${fileType})`,
    path: paths.original,
    absolute_path: paths.absolute,
  };
}

function parseGroup(groupObj, projectDir) {
  const groupName = groupObj.GroupName;
  const files = [];

  if (groupObj.Files) {
    const fileList = Array.isArray(groupObj.Files.File)
      ? groupObj.Files.File
      : groupObj.Files.File
        ? [groupObj.Files.File]
        : [];
    for (const file of fileList) {
      files.push(parseFile(file, projectDir));
    }
  }

  return { name: groupName, files };
}

function parseTargetCommon(targetOption) {
  const common = targetOption.TargetCommonOption;
  if (!common) return {};

  const booleanFields = [
    'CreateExecutable', 'CreateLib', 'CreateHexFile', 'DebugInformation',
    'BrowseInformation', 'HexFormatSelection', 'Merge32K', 'CreateBatchFile',
    'SelectedForBatchBuild', 'bCustSvd', 'UseEnv',
  ];

  const knownStringFields = [
    'Device', 'Vendor', 'PackID', 'PackURL', 'Cpu', 'OutputDirectory', 'OutputName',
    'RegisterFile', 'SFDFile', 'ListingPath',
  ];

  const structuredFields = new Set([
    'TargetStatus', 'BeforeCompile', 'BeforeMake', 'AfterMake',
  ]);

  const result = {
    device: common.Device || null,
    vendor: common.Vendor || null,
    pack_id: common.PackID || null,
    pack_url: common.PackURL || null,
    cpu: common.Cpu || null,
    output_directory: common.OutputDirectory || null,
    output_name: common.OutputName || null,
    register_file: common.RegisterFile || null,
    sfd_file: common.SFDFile || null,
    listing_path: common.ListingPath || null,
    target_status: common.TargetStatus ? deepSnakeCase(common.TargetStatus) : null,
    before_compile: common.BeforeCompile ? deepSnakeCase(common.BeforeCompile) : null,
    before_make: common.BeforeMake ? deepSnakeCase(common.BeforeMake) : null,
    after_make: common.AfterMake ? deepSnakeCase(common.AfterMake) : null,
  };

  for (const field of booleanFields) {
    result[toSnakeCase(field)] = common[field] === '1';
  }

  for (const field of knownStringFields) {
    if (common[field] && result[toSnakeCase(field)] === undefined) {
      result[toSnakeCase(field)] = common[field];
    }
  }

  for (const [key, value] of Object.entries(common)) {
    if (result[toSnakeCase(key)] !== undefined) continue;
    if (structuredFields.has(key)) continue;
    result[toSnakeCase(key)] = typeof value === 'string' ? value : deepSnakeCase(value);
  }

  return result;
}

function parseAdsOptions(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads) return {};

  const result = {};

  if (ads.Cads && ads.Cads.VariousControls) {
    const controls = ads.Cads.VariousControls;
    result.c_optim = ads.Cads.Optim || null;
    result.c_misc_controls = controls.MiscControls || null;
    result.defines = splitComma(controls.Define);
    result.undefines = splitComma(controls.Undefine);
    result.include_paths = splitSemicolon(controls.IncludePath).map((p) => p.replace(/\\/g, '/'));
  }

  if (ads.Aads && ads.Aads.VariousControls) {
    const controls = ads.Aads.VariousControls;
    result.asm_misc_controls = controls.MiscControls || null;
    result.asm_defines = splitComma(controls.Define);
    result.asm_include_paths = splitSemicolon(controls.IncludePath).map((p) => p.replace(/\\/g, '/'));
  }

  if (ads.LDads) {
    result.scatter_file = ads.LDads.ScatterFile || null;
    result.linker_misc = ads.LDads.Misc || null;
    result.include_libs = splitSemicolon(ads.LDads.IncludeLibs);
    result.include_libs_path = splitSemicolon(ads.LDads.IncludeLibsPath);
  }

  return result;
}

function parseCommonProperty(targetOption) {
  const node = targetOption.CommonProperty;
  if (!node) return null;
  return deepSnakeCase(node);
}

function parseDllOption(targetOption) {
  const node = targetOption.DllOption;
  if (!node) return null;
  return deepSnakeCase(node);
}

function parseDebugOption(targetOption) {
  const node = targetOption.DebugOption;
  if (!node) return null;
  return deepSnakeCase(node);
}

function parseUtilities(targetOption) {
  const node = targetOption.Utilities;
  if (!node) return null;
  return deepSnakeCase(node);
}

function parseCads(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads || !ads.Cads) return null;

  const result = deepSnakeCase(ads.Cads);
  if (ads.Cads.VariousControls) {
    const controls = ads.Cads.VariousControls;
    result.c_optim = ads.Cads.Optim || null;
    result.c_misc_controls = controls.MiscControls || null;
    result.defines = splitComma(controls.Define);
    result.undefines = splitComma(controls.Undefine);
    result.include_paths = splitSemicolon(controls.IncludePath).map((p) => p.replace(/\\/g, '/'));
    result.various_controls = {
      misc_controls: controls.MiscControls || null,
      define: controls.Define || null,
      undefine: controls.Undefine || null,
      include_path: controls.IncludePath || null,
    };
  }
  return result;
}

function parseAads(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads || !ads.Aads) return null;

  const result = deepSnakeCase(ads.Aads);
  if (ads.Aads.VariousControls) {
    const controls = ads.Aads.VariousControls;
    result.asm_misc_controls = controls.MiscControls || null;
    result.asm_defines = splitComma(controls.Define);
    result.asm_undefines = splitComma(controls.Undefine);
    result.asm_include_paths = splitSemicolon(controls.IncludePath).map((p) => p.replace(/\\/g, '/'));
    result.various_controls = {
      misc_controls: controls.MiscControls || null,
      define: controls.Define || null,
      undefine: controls.Undefine || null,
      include_path: controls.IncludePath || null,
    };
  }
  return result;
}

function parseLDads(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads || !ads.LDads) return null;

  const result = deepSnakeCase(ads.LDads);
  result.scatter_file = ads.LDads.ScatterFile || null;
  result.linker_misc = ads.LDads.Misc || null;
  result.include_libs = splitSemicolon(ads.LDads.IncludeLibs);
  result.include_libs_path = splitSemicolon(ads.LDads.IncludeLibsPath);
  return result;
}

function parseArmAdsMisc(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads || !ads.ArmAdsMisc) return null;
  return deepSnakeCase(ads.ArmAdsMisc);
}

function parseOnChipMemories(targetOption) {
  const ads = targetOption.TargetArmAds;
  if (!ads || !ads.ArmAdsMisc || !ads.ArmAdsMisc.OnChipMemories) return null;
  return deepSnakeCase(ads.ArmAdsMisc.OnChipMemories);
}

function parseDebugUtilities(targetOption) {
  const result = {};

  if (targetOption.DebugOption && targetOption.DebugOption.TargetDlls) {
    result.debugger_driver = targetOption.DebugOption.TargetDlls.Driver || null;
  }

  if (targetOption.Utilities) {
    result.flash_driver = targetOption.Utilities.Flash2 || null;
  }

  return result;
}

function parseTarget(targetObj, projectDir) {
  const targetOption = targetObj.TargetOption;
  const result = {
    target_name: targetObj.TargetName,
    toolset_number: targetObj.ToolsetNumber || null,
    toolset_name: targetObj.ToolsetName || null,
  };

  if (targetOption) {
    Object.assign(result, parseTargetCommon(targetOption));
    Object.assign(result, parseAdsOptions(targetOption));
    Object.assign(result, parseDebugUtilities(targetOption));

    result.common_option = parseTargetCommon(targetOption);
    result.common_property = parseCommonProperty(targetOption);
    result.dll_option = parseDllOption(targetOption);
    result.debug_option = parseDebugOption(targetOption);
    result.utilities = parseUtilities(targetOption);
    result.compiler = {
      cads: parseCads(targetOption),
      aads: parseAads(targetOption),
      ldads: parseLDads(targetOption),
    };
    result.arm_ads_misc = parseArmAdsMisc(targetOption);
    result.on_chip_memories = parseOnChipMemories(targetOption);
    result.armads_misc = {
      arm_ads_misc: result.arm_ads_misc,
      on_chip_memories: result.on_chip_memories,
    };
  }

  const groups = [];
  if (targetObj.Groups) {
    const groupList = Array.isArray(targetObj.Groups.Group)
      ? targetObj.Groups.Group
      : targetObj.Groups.Group
        ? [targetObj.Groups.Group]
        : [];
    for (const group of groupList) {
      groups.push(parseGroup(group, projectDir));
    }
  }
  result.groups = groups;

  return result;
}

function parseRte(rootObj) {
  const rte = rootObj.RTE;
  if (!rte || !rte.components) return [];

  const componentList = Array.isArray(rte.components.component)
    ? rte.components.component
    : rte.components.component
      ? [rte.components.component]
      : [];

  return componentList.map((comp) => ({
    class: comp['@_Cclass'] || null,
    group: comp['@_Cgroup'] || null,
    vendor: comp['@_Cvendor'] || null,
    version: comp['@_Cversion'] || null,
  }));
}

function readProject(projectPath) {
  const resolvedPath = path.resolve(projectPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Project file not found: ${resolvedPath}`);
  }

  const projectDir = path.dirname(resolvedPath);
  const jObj = parseXml(resolvedPath);
  const rootObj = jObj.Project;

  const targets = [];
  if (rootObj.Targets) {
    const targetList = Array.isArray(rootObj.Targets.Target)
      ? rootObj.Targets.Target
      : rootObj.Targets.Target
        ? [rootObj.Targets.Target]
        : [];
    for (const target of targetList) {
      targets.push(parseTarget(target, projectDir));
    }
  }

  return {
    project_path: resolvedPath,
    schema_version: rootObj.SchemaVersion || null,
    header: rootObj.Header || null,
    targets,
    rte_components: parseRte(rootObj),
  };
}

function readWorkspace(workspacePath) {
  const resolvedPath = path.resolve(workspacePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Workspace file not found: ${resolvedPath}`);
  }

  const workspaceDir = path.dirname(resolvedPath);
  const jObj = parseXml(resolvedPath);
  const rootObj = jObj.ProjectWorkspace;

  const projects = [];
  if (rootObj.project) {
    const projectList = Array.isArray(rootObj.project)
      ? rootObj.project
      : [rootObj.project];
    for (const project of projectList) {
      let projectPathStr = project.PathAndName;
      if (projectPathStr) {
        projectPathStr = projectPathStr.replace(/\\/g, '/');
        if (projectPathStr.startsWith('./')) {
          projectPathStr = projectPathStr.slice(2);
        }
        projects.push(path.resolve(workspaceDir, projectPathStr));
      }
    }
  }

  return {
    workspace_path: resolvedPath,
    workspace_name: rootObj.WorkspaceName || null,
    projects,
  };
}

function findTarget(project, targetName) {
  const targets = project.targets || [];
  const target = targetName
    ? targets.find((t) => t.target_name === targetName)
    : targets[0];
  if (!target) {
    throw new Error(targetName ? `Target not found: ${targetName}` : 'No target found in project');
  }
  return target;
}

function listProjectsInWorkspace(workspacePath) {
  return readWorkspace(workspacePath).projects;
}

function readProjectSummary(projectPath) {
  const project = readProject(projectPath);
  return {
    project_path: project.project_path,
    schema_version: project.schema_version,
    header: project.header,
    targets: project.targets.map((t) => t.target_name),
  };
}

function listTargets(projectPath) {
  return readProject(projectPath).targets.map((t) => t.target_name);
}

function readTargetSummary(projectPath, targetName) {
  const target = findTarget(readProject(projectPath), targetName);
  return {
    target_name: target.target_name,
    toolset_number: target.toolset_number,
    toolset_name: target.toolset_name,
    device: target.device || null,
    vendor: target.vendor || null,
    pack_id: target.pack_id || null,
    pack_url: target.pack_url || null,
    cpu: target.cpu || null,
    output_directory: target.output_directory || null,
    output_name: target.output_name || null,
    create_executable: target.create_executable || false,
    create_lib: target.create_lib || false,
    create_hex_file: target.create_hex_file || false,
  };
}

function readTargetDefines(projectPath, targetName) {
  return findTarget(readProject(projectPath), targetName).defines || [];
}

function readTargetIncludePaths(projectPath, targetName) {
  return findTarget(readProject(projectPath), targetName).include_paths || [];
}

function paginate(items, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 50);
  const total = items.length;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  return {
    items: items.slice(start, end),
    total,
    page,
    perPage,
  };
}

function readTargetGroups(projectPath, targetName, options = {}) {
  const groups = (findTarget(readProject(projectPath), targetName).groups || []).map((g) => g.name);
  if (options.paginate === false) return groups;
  return paginate(groups, options);
}

function readTargetFiles(projectPath, targetName, groupName, options = {}) {
  const target = findTarget(readProject(projectPath), targetName);
  const group = (target.groups || []).find((g) => g.name === groupName);
  if (!group) {
    throw new Error(`Group not found: ${groupName}`);
  }
  const files = group.files || [];
  if (options.paginate === false) return files;
  return paginate(files, options);
}

function readTargetLinkerSettings(projectPath, targetName) {
  const target = findTarget(readProject(projectPath), targetName);
  return {
    scatter_file: target.scatter_file || null,
    include_libs: target.include_libs || [],
    include_libs_path: target.include_libs_path || [],
    linker_misc: target.linker_misc || null,
  };
}

function readTargetDebugSettings(projectPath, targetName) {
  const target = findTarget(readProject(projectPath), targetName);
  return {
    debugger_driver: target.debugger_driver || null,
    flash_driver: target.flash_driver || null,
  };
}

function readTargetConfig(projectPath, targetName, options = {}) {
  const target = findTarget(readProject(projectPath), targetName);
  const allSections = [
    'common_option',
    'common_property',
    'dll_option',
    'debug_option',
    'utilities',
    'compiler',
    'armads_misc',
    'groups',
  ];
  const requested = Array.isArray(options.sections) && options.sections.length > 0
    ? options.sections
    : allSections;
  const result = {
    target_name: target.target_name,
    toolset_number: target.toolset_number,
    toolset_name: target.toolset_name,
  };
  if (requested.includes('common_option')) result.common_option = target.common_option || null;
  if (requested.includes('common_property')) result.common_property = target.common_property || null;
  if (requested.includes('dll_option')) result.dll_option = target.dll_option || null;
  if (requested.includes('debug_option')) result.debug_option = target.debug_option || null;
  if (requested.includes('utilities')) result.utilities = target.utilities || null;
  if (requested.includes('compiler')) result.compiler = target.compiler || null;
  if (requested.includes('armads_misc')) result.armads_misc = target.armads_misc || null;
  if (requested.includes('groups')) result.groups = target.groups || [];
  return result;
}

function readTargetConfigCompact(projectPath, targetName, options = {}) {
  const full = readTargetConfig(projectPath, targetName, options);
  const compact = {
    target_name: full.target_name,
    toolset_number: full.toolset_number,
    toolset_name: full.toolset_name,
  };
  const compactValue = (value) => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return { _count: value.length };
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = compactValue(v);
      }
      return out;
    }
    return value;
  };
  for (const [key, value] of Object.entries(full)) {
    if (key === 'target_name' || key === 'toolset_number' || key === 'toolset_name') continue;
    compact[key] = compactValue(value);
  }
  return compact;
}

function readTargetCommonOption(projectPath, targetName) {
  return findTarget(readProject(projectPath), targetName).common_option || {};
}

function readTargetCompiler(projectPath, targetName, options = {}) {
  const compiler = findTarget(readProject(projectPath), targetName).compiler || {};
  if (options.include_arrays === true || options.full === true) return compiler;
  const flags = {};
  for (const [sectionName, section] of Object.entries(compiler)) {
    if (!section) continue;
    const sectionFlags = {};
    for (const [k, v] of Object.entries(section)) {
      if (Array.isArray(v)) {
        sectionFlags[k] = { _count: v.length };
      } else if (typeof v === 'object' && v !== null) {
        sectionFlags[k] = v;
      } else {
        sectionFlags[k] = v;
      }
    }
    flags[sectionName] = sectionFlags;
  }
  return flags;
}

function readTargetDebugUtilities(projectPath, targetName) {
  const target = findTarget(readProject(projectPath), targetName);
  return {
    common_property: target.common_property || null,
    dll_option: target.dll_option || null,
    debug_option: target.debug_option || null,
    utilities: target.utilities || null,
  };
}

function readTargetArmAdsMisc(projectPath, targetName) {
  return findTarget(readProject(projectPath), targetName).armads_misc || {};
}

function createMatcher(keyword, caseSensitive = false, exactMatch = false) {
  if (!keyword) return () => true;
  const target = caseSensitive ? keyword : keyword.toLowerCase();
  if (exactMatch) {
    return (text) => (caseSensitive ? text : text.toLowerCase()) === target;
  }
  return (text) => (caseSensitive ? text : text.toLowerCase()).includes(target);
}

function searchGroups(projectPath, targetName, keyword, caseSensitive = false, exactMatch = false) {
  const target = findTarget(readProject(projectPath), targetName);
  const match = createMatcher(keyword, caseSensitive, exactMatch);
  return (target.groups || []).map((g) => g.name).filter((name) => match(name));
}

function searchFiles(projectPath, targetName, keyword, caseSensitive = false, exactMatch = false) {
  const target = findTarget(readProject(projectPath), targetName);
  const match = createMatcher(keyword, caseSensitive, exactMatch);
  const results = [];
  for (const group of target.groups || []) {
    for (const file of group.files || []) {
      const haystack = exactMatch
        ? file.name
        : `${file.name} ${file.path} ${file.absolute_path || ''}`;
      if (match(haystack)) {
        results.push({ ...file, group: group.name });
      }
    }
  }
  return results;
}

function searchDefines(projectPath, targetName, keyword, caseSensitive = false, exactMatch = false) {
  const target = findTarget(readProject(projectPath), targetName);
  const match = createMatcher(keyword, caseSensitive, exactMatch);
  return (target.defines || []).filter((define) => match(define));
}

function searchIncludePaths(projectPath, targetName, keyword, caseSensitive = false, exactMatch = false) {
  const target = findTarget(readProject(projectPath), targetName);
  const match = createMatcher(keyword, caseSensitive, exactMatch);
  return (target.include_paths || []).filter((p) => match(p));
}

module.exports = {
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
  readTargetConfig,
  readTargetConfigCompact,
  readTargetCommonOption,
  readTargetCompiler,
  readTargetDebugUtilities,
  readTargetArmAdsMisc,
  searchGroups,
  searchFiles,
  searchDefines,
  searchIncludePaths,
  FILE_TYPE_MAP,
  normalizePath,
  splitComma,
  splitSemicolon,
};
