const fs = require('fs');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { FILE_TYPE_MAP, splitComma, splitSemicolon } = require('./reader');

const REVERSE_FILE_TYPE_MAP = Object.fromEntries(
  Object.entries(FILE_TYPE_MAP).map(([k, v]) => [v, k])
);

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
};

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true,
  suppressUnpairedNode: false,
  parseTagValue: false,
  parseAttributeValue: false,
};

function createProject(projectPath) {
  const resolvedPath = path.resolve(projectPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Project file not found: ${resolvedPath}`);
  }

  const xml = fs.readFileSync(resolvedPath, 'utf8');
  const parser = new XMLParser(PARSER_OPTIONS);
  const jObj = parser.parse(xml);

  return {
    path: resolvedPath,
    dir: path.dirname(resolvedPath),
    data: jObj,
  };
}

function ensureArray(obj) {
  if (obj === undefined || obj === null) return [];
  return Array.isArray(obj) ? obj : [obj];
}

function toSnakeCase(str) {
  if (typeof str !== 'string') return str;
  if (str.startsWith('@_')) return str;
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function snakeToXmlName(snake) {
  if (typeof snake !== 'string') return snake;
  return snake.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function getXmlFieldName(node, snakeName) {
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (toSnakeCase(key) === snakeName) return key;
    }
  }
  return snakeToXmlName(snakeName);
}

function xmlValue(value) {
  if (value === true) return '1';
  if (value === false) return '0';
  if (value === null || value === undefined) return '';
  return String(value);
}

function updateXmlNode(node, data) {
  if (data === null || data === undefined || typeof data !== 'object') return;
  for (const [snakeKey, value] of Object.entries(data)) {
    const xmlKey = getXmlFieldName(node, snakeKey);
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (!node[xmlKey]) node[xmlKey] = {};
      updateXmlNode(node[xmlKey], value);
    } else {
      node[xmlKey] = xmlValue(value);
    }
  }
}

function normalizeForCompare(filePath) {
  if (!filePath) return '';
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function toKeilPath(filePath) {
  if (!filePath) return filePath;
  return filePath.replace(/\//g, '\\');
}

function getTarget(project, targetName) {
  const rootObj = project.data.Project;
  if (!rootObj.Targets || !rootObj.Targets.Target) {
    throw new Error('No targets found in project');
  }

  const targets = ensureArray(rootObj.Targets.Target);
  const target = targetName
    ? targets.find((t) => t.TargetName === targetName)
    : targets[0];

  if (!target) {
    throw new Error(targetName ? `Target not found: ${targetName}` : 'No target found in project');
  }

  return target;
}

function getTargetOption(target) {
  if (!target.TargetOption) {
    target.TargetOption = {};
  }
  return target.TargetOption;
}

function getTargetArmAds(target) {
  if (!target.TargetOption) {
    target.TargetOption = {};
  }
  if (!target.TargetOption.TargetArmAds) {
    target.TargetOption.TargetArmAds = {};
  }
  return target.TargetOption.TargetArmAds;
}

function getCadsControls(target) {
  const ads = getTargetArmAds(target);
  if (!ads.Cads) {
    ads.Cads = {};
  }
  if (!ads.Cads.VariousControls) {
    ads.Cads.VariousControls = {};
  }
  return ads.Cads.VariousControls;
}

function getAadsControls(target) {
  const ads = getTargetArmAds(target);
  if (!ads.Aads) {
    ads.Aads = {};
  }
  if (!ads.Aads.VariousControls) {
    ads.Aads.VariousControls = {};
  }
  return ads.Aads.VariousControls;
}

function setTargetName(project, targetName, newName) {
  const target = getTarget(project, targetName);
  target.TargetName = newName;
  return project;
}

function deleteTarget(project, targetName) {
  const rootObj = project.data.Project;
  if (!rootObj.Targets || !rootObj.Targets.Target) {
    throw new Error('No targets found in project');
  }
  const targets = ensureArray(rootObj.Targets.Target);
  const idx = targets.findIndex((t) => t.TargetName === targetName);
  if (idx === -1) {
    throw new Error(`Target not found: ${targetName}`);
  }
  targets.splice(idx, 1);
  if (targets.length === 0) {
    rootObj.Targets.Target = '';
  } else {
    rootObj.Targets.Target = targets;
  }
  return project;
}

function setDefines(project, targetName, defines) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  controls.Define = Array.isArray(defines) ? defines.join(',') : defines;
  return project;
}

function addDefine(project, targetName, define) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitComma(controls.Define || '');
  if (!current.includes(define)) {
    current.push(define);
  }
  controls.Define = current.join(',');
  return project;
}

function removeDefine(project, targetName, define) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitComma(controls.Define || '');
  const filtered = current.filter((d) => d !== define);
  if (filtered.length === current.length) {
    throw new Error(`Define not found: ${define}`);
  }
  controls.Define = filtered.join(',');
  return project;
}

function setIncludePaths(project, targetName, includePaths) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const paths = Array.isArray(includePaths)
    ? includePaths.map(toKeilPath).join(';')
    : toKeilPath(includePaths);
  controls.IncludePath = paths;
  return project;
}

function addIncludePath(project, targetName, includePath) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitSemicolon(controls.IncludePath || '').map((p) => p.replace(/\\/g, '/'));
  const normalizedInput = normalizeForCompare(includePath);
  if (!current.map(normalizeForCompare).includes(normalizedInput)) {
    current.push(includePath.replace(/\\/g, '/'));
  }
  controls.IncludePath = current.map(toKeilPath).join(';');
  return project;
}

function removeIncludePath(project, targetName, includePath) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitSemicolon(controls.IncludePath || '').map((p) => p.replace(/\\/g, '/'));
  const normalizedInput = normalizeForCompare(includePath);
  const filtered = current.filter((p) => normalizeForCompare(p) !== normalizedInput);
  if (filtered.length === current.length) {
    throw new Error(`Include path not found: ${includePath}`);
  }
  controls.IncludePath = filtered.map(toKeilPath).join(';');
  return project;
}

function getGroups(target) {
  if (!target.Groups) {
    target.Groups = {};
  }
  return ensureArray(target.Groups.Group);
}

function getGroup(target, groupName) {
  const groups = getGroups(target);
  const group = groups.find((g) => g.GroupName === groupName);
  if (!group) {
    throw new Error(`Group not found: ${groupName}`);
  }
  return group;
}

function getOrCreateGroup(target, groupName) {
  const groups = getGroups(target);
  let group = groups.find((g) => g.GroupName === groupName);
  if (!group) {
    group = { GroupName: groupName, Files: { File: [] } };
    groups.push(group);
    target.Groups.Group = groups;
  }
  return group;
}

function getFiles(group) {
  if (!group.Files) {
    group.Files = { File: [] };
  }
  return ensureArray(group.Files.File);
}

function addGroup(project, targetName, groupName) {
  const target = getTarget(project, targetName);
  const groups = getGroups(target);
  if (groups.some((g) => g.GroupName === groupName)) {
    throw new Error(`Group already exists: ${groupName}`);
  }
  groups.push({ GroupName: groupName, Files: { File: [] } });
  target.Groups.Group = groups;
  return project;
}

function removeGroup(project, targetName, groupName) {
  const target = getTarget(project, targetName);
  const groups = getGroups(target);
  const filtered = groups.filter((g) => g.GroupName !== groupName);
  if (filtered.length === groups.length) {
    throw new Error(`Group not found: ${groupName}`);
  }
  target.Groups.Group = filtered.length === 1 ? filtered[0] : filtered;
  return project;
}

function renameGroup(project, targetName, groupName, newName) {
  const target = getTarget(project, targetName);
  const groups = getGroups(target);
  const group = groups.find((g) => g.GroupName === groupName);
  if (!group) {
    throw new Error(`Group not found: ${groupName}`);
  }
  if (groups.some((g) => g.GroupName === newName)) {
    throw new Error(`Group already exists: ${newName}`);
  }
  group.GroupName = newName;
  return project;
}

function updateTargetCommonOption(project, targetName, data) {
  const targetOption = getTargetOption(getTarget(project, targetName));
  if (!targetOption.TargetCommonOption) {
    targetOption.TargetCommonOption = {};
  }
  updateXmlNode(targetOption.TargetCommonOption, data);
  return project;
}

function updateCommonProperty(project, targetName, data) {
  const targetOption = getTargetOption(getTarget(project, targetName));
  if (!targetOption.CommonProperty) {
    targetOption.CommonProperty = {};
  }
  updateXmlNode(targetOption.CommonProperty, data);
  return project;
}

function updateDllOption(project, targetName, data) {
  const targetOption = getTargetOption(getTarget(project, targetName));
  if (!targetOption.DllOption) {
    targetOption.DllOption = {};
  }
  updateXmlNode(targetOption.DllOption, data);
  return project;
}

function updateDebugOption(project, targetName, data) {
  const targetOption = getTargetOption(getTarget(project, targetName));
  if (!targetOption.DebugOption) {
    targetOption.DebugOption = {};
  }
  updateXmlNode(targetOption.DebugOption, data);
  return project;
}

function updateUtilities(project, targetName, data) {
  const targetOption = getTargetOption(getTarget(project, targetName));
  if (!targetOption.Utilities) {
    targetOption.Utilities = {};
  }
  updateXmlNode(targetOption.Utilities, data);
  return project;
}

function updateCads(project, targetName, data) {
  const target = getTarget(project, targetName);
  const ads = getTargetArmAds(target);
  if (!ads.Cads) {
    ads.Cads = {};
  }
  const cads = ads.Cads;
  if (cads.VariousControls === undefined) cads.VariousControls = {};
  const vc = cads.VariousControls;
  const remaining = { ...data };

  if (data.c_optim !== undefined || data.optim !== undefined) {
    cads.Optim = xmlValue(data.c_optim !== undefined ? data.c_optim : data.optim);
  }
  delete remaining.c_optim;
  delete remaining.optim;

  if (data.c_misc_controls !== undefined || data.misc_controls !== undefined) {
    vc.MiscControls = xmlValue(data.c_misc_controls !== undefined ? data.c_misc_controls : data.misc_controls);
  }
  delete remaining.c_misc_controls;
  delete remaining.misc_controls;

  if (data.defines !== undefined) {
    vc.Define = Array.isArray(data.defines) ? data.defines.join(',') : xmlValue(data.defines);
  }
  delete remaining.defines;

  if (data.undefines !== undefined) {
    vc.Undefine = Array.isArray(data.undefines) ? data.undefines.join(',') : xmlValue(data.undefines);
  }
  delete remaining.undefines;

  if (data.include_paths !== undefined) {
    vc.IncludePath = Array.isArray(data.include_paths)
      ? data.include_paths.map(toKeilPath).join(';')
      : xmlValue(data.include_paths);
  }
  delete remaining.include_paths;

  if (data.various_controls) {
    updateXmlNode(vc, data.various_controls);
  }
  delete remaining.various_controls;

  updateXmlNode(cads, remaining);
  return project;
}

function updateAads(project, targetName, data) {
  const target = getTarget(project, targetName);
  const ads = getTargetArmAds(target);
  if (!ads.Aads) {
    ads.Aads = {};
  }
  const aads = ads.Aads;
  if (aads.VariousControls === undefined) aads.VariousControls = {};
  const vc = aads.VariousControls;
  const remaining = { ...data };

  if (data.asm_misc_controls !== undefined || data.misc_controls !== undefined) {
    vc.MiscControls = xmlValue(data.asm_misc_controls !== undefined ? data.asm_misc_controls : data.misc_controls);
  }
  delete remaining.asm_misc_controls;
  delete remaining.misc_controls;

  if (data.asm_defines !== undefined) {
    vc.Define = Array.isArray(data.asm_defines) ? data.asm_defines.join(',') : xmlValue(data.asm_defines);
  }
  delete remaining.asm_defines;

  if (data.asm_undefines !== undefined) {
    vc.Undefine = Array.isArray(data.asm_undefines) ? data.asm_undefines.join(',') : xmlValue(data.asm_undefines);
  }
  delete remaining.asm_undefines;

  if (data.asm_include_paths !== undefined) {
    vc.IncludePath = Array.isArray(data.asm_include_paths)
      ? data.asm_include_paths.map(toKeilPath).join(';')
      : xmlValue(data.asm_include_paths);
  }
  delete remaining.asm_include_paths;

  if (data.various_controls) {
    updateXmlNode(vc, data.various_controls);
  }
  delete remaining.various_controls;

  updateXmlNode(aads, remaining);
  return project;
}

function updateLDads(project, targetName, data) {
  const target = getTarget(project, targetName);
  const ads = getTargetArmAds(target);
  if (!ads.LDads) {
    ads.LDads = {};
  }
  const ldads = ads.LDads;
  const remaining = { ...data };

  if (data.scatter_file !== undefined) {
    ldads.ScatterFile = xmlValue(data.scatter_file);
    delete remaining.scatter_file;
  }
  if (data.linker_misc !== undefined) {
    ldads.Misc = xmlValue(data.linker_misc);
    delete remaining.linker_misc;
    delete remaining.misc;
  }
  if (data.include_libs !== undefined) {
    ldads.IncludeLibs = Array.isArray(data.include_libs) ? data.include_libs.join(';') : xmlValue(data.include_libs);
    delete remaining.include_libs;
  }
  if (data.include_libs_path !== undefined) {
    ldads.IncludeLibsPath = Array.isArray(data.include_libs_path)
      ? data.include_libs_path.join(';')
      : xmlValue(data.include_libs_path);
    delete remaining.include_libs_path;
  }
  updateXmlNode(ldads, remaining);
  return project;
}

function updateOnChipMemories(project, targetName, data) {
  const target = getTarget(project, targetName);
  const ads = getTargetArmAds(target);
  if (!ads.ArmAdsMisc) {
    ads.ArmAdsMisc = {};
  }
  if (!ads.ArmAdsMisc.OnChipMemories) {
    ads.ArmAdsMisc.OnChipMemories = {};
  }
  updateXmlNode(ads.ArmAdsMisc.OnChipMemories, data);
  return project;
}

function updateTargetCompiler(project, targetName, data) {
  if (data.cads) updateCads(project, targetName, data.cads);
  if (data.aads) updateAads(project, targetName, data.aads);
  if (data.ldads) updateLDads(project, targetName, data.ldads);
  return project;
}

function updateTargetDebugUtilities(project, targetName, data) {
  if (data.common_property) updateCommonProperty(project, targetName, data.common_property);
  if (data.dll_option) updateDllOption(project, targetName, data.dll_option);
  if (data.debug_option) updateDebugOption(project, targetName, data.debug_option);
  if (data.utilities) updateUtilities(project, targetName, data.utilities);
  return project;
}

function setCadsUndefines(project, targetName, undefines) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  controls.Undefine = Array.isArray(undefines) ? undefines.join(',') : undefines;
  return project;
}

function addCadsUndefine(project, targetName, undefine) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitComma(controls.Undefine || '');
  if (!current.includes(undefine)) {
    current.push(undefine);
  }
  controls.Undefine = current.join(',');
  return project;
}

function removeCadsUndefine(project, targetName, undefine) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const current = splitComma(controls.Undefine || '');
  const filtered = current.filter((d) => d !== undefine);
  controls.Undefine = filtered.join(',');
  return project;
}

function setAadsDefines(project, targetName, defines) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  controls.Define = Array.isArray(defines) ? defines.join(',') : defines;
  return project;
}

function addAadsDefine(project, targetName, define) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitComma(controls.Define || '');
  if (!current.includes(define)) {
    current.push(define);
  }
  controls.Define = current.join(',');
  return project;
}

function removeAadsDefine(project, targetName, define) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitComma(controls.Define || '');
  const filtered = current.filter((d) => d !== define);
  controls.Define = filtered.join(',');
  return project;
}

function setAadsUndefines(project, targetName, undefines) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  controls.Undefine = Array.isArray(undefines) ? undefines.join(',') : undefines;
  return project;
}

function addAadsUndefine(project, targetName, undefine) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitComma(controls.Undefine || '');
  if (!current.includes(undefine)) {
    current.push(undefine);
  }
  controls.Undefine = current.join(',');
  return project;
}

function removeAadsUndefine(project, targetName, undefine) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitComma(controls.Undefine || '');
  const filtered = current.filter((d) => d !== undefine);
  controls.Undefine = filtered.join(',');
  return project;
}

function setAadsIncludePaths(project, targetName, includePaths) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const paths = Array.isArray(includePaths)
    ? includePaths.map(toKeilPath).join(';')
    : toKeilPath(includePaths);
  controls.IncludePath = paths;
  return project;
}

function addAadsIncludePath(project, targetName, includePath) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitSemicolon(controls.IncludePath || '').map((p) => p.replace(/\\/g, '/'));
  const normalizedInput = normalizeForCompare(includePath);
  if (!current.map(normalizeForCompare).includes(normalizedInput)) {
    current.push(includePath.replace(/\\/g, '/'));
  }
  controls.IncludePath = current.map(toKeilPath).join(';');
  return project;
}

function removeAadsIncludePath(project, targetName, includePath) {
  const target = getTarget(project, targetName);
  const controls = getAadsControls(target);
  const current = splitSemicolon(controls.IncludePath || '').map((p) => p.replace(/\\/g, '/'));
  const normalizedInput = normalizeForCompare(includePath);
  const filtered = current.filter((p) => normalizeForCompare(p) !== normalizedInput);
  controls.IncludePath = filtered.map(toKeilPath).join(';');
  return project;
}

function manageFile(project, targetName, action, items) {
  const target = getTarget(project, targetName);
  const failures = [];
  let count = 0;

  for (const item of items) {
    const groupName = item.group;

    if (action === 'add') {
      const group = getOrCreateGroup(target, groupName);
      const files = getFiles(group);
      const typeCode = REVERSE_FILE_TYPE_MAP[item.type] || '1';
      for (const filePath of item.files) {
        const normalizedInput = normalizeForCompare(filePath);
        if (files.some((f) => normalizeForCompare(f.FilePath) === normalizedInput)) {
          continue;
        }
        const keilPath = toKeilPath(filePath);
        const fileName = path.basename(filePath.replace(/\\/g, '/'));
        files.push({ FileName: fileName, FileType: typeCode, FilePath: keilPath });
        count += 1;
      }
      group.Files.File = files;
      continue;
    }

    if (action === 'remove') {
      const group = getGroup(target, groupName);
      const files = getFiles(group);
      const unmatched = [];
      for (const filePath of item.files) {
        const normalizedInput = normalizeForCompare(filePath);
        const idx = files.findIndex((f) => normalizeForCompare(f.FilePath) === normalizedInput);
        if (idx === -1) {
          unmatched.push(filePath);
          continue;
        }
        files.splice(idx, 1);
        count += 1;
      }
      group.Files.File = files.length === 1 ? files[0] : files;
      if (unmatched.length) {
        failures.push({ group: groupName, files: unmatched });
      }
      continue;
    }

    if (action === 'move') {
      const fromGroup = getGroup(target, groupName);
      const toGroup = getOrCreateGroup(target, item.toGroup);
      const fromFiles = getFiles(fromGroup);
      const toFiles = getFiles(toGroup);
      const unmatched = [];
      for (const filePath of item.files) {
        const normalizedInput = normalizeForCompare(filePath);
        const idx = fromFiles.findIndex((f) => normalizeForCompare(f.FilePath) === normalizedInput);
        if (idx === -1) {
          unmatched.push(filePath);
          continue;
        }
        const file = fromFiles[idx];
        fromFiles.splice(idx, 1);
        if (!toFiles.some((f) => normalizeForCompare(f.FilePath) === normalizedInput)) {
          toFiles.push(file);
        }
        count += 1;
      }
      fromGroup.Files.File = fromFiles.length === 1 ? fromFiles[0] : fromFiles;
      toGroup.Files.File = toFiles;
      if (unmatched.length) {
        failures.push({ group: groupName, files: unmatched });
      }
      continue;
    }
  }

  return { action, count, failures };
}

function saveProject(project, outputPath) {
  const outPath = outputPath || project.path;
  const isOverwriting = outPath === project.path;

  if (isOverwriting) {
    const backupPath = `${project.path}.bak`;
    fs.copyFileSync(project.path, backupPath);
  }

  const builder = new XMLBuilder(BUILDER_OPTIONS);
  let xmlContent = builder.build(project.data);
  // fast-xml-parser puts the XML declaration and root tag on the same line;
  // add a newline after the declaration for readability.
  if (xmlContent.startsWith('<?xml')) {
    const idx = xmlContent.indexOf('?>');
    if (idx !== -1) {
      xmlContent = xmlContent.slice(0, idx + 2) + '\n' + xmlContent.slice(idx + 2);
    }
  }
  fs.writeFileSync(outPath, xmlContent, 'utf8');
  return outPath;
}

module.exports = {
  createProject,
  setTargetName,
  deleteTarget,
  setDefines,
  addDefine,
  removeDefine,
  setCadsUndefines,
  addCadsUndefine,
  removeCadsUndefine,
  setIncludePaths,
  addIncludePath,
  removeIncludePath,
  setAadsDefines,
  addAadsDefine,
  removeAadsDefine,
  setAadsUndefines,
  addAadsUndefine,
  removeAadsUndefine,
  setAadsIncludePaths,
  addAadsIncludePath,
  removeAadsIncludePath,
  addGroup,
  removeGroup,
  renameGroup,
  manageFile,
  updateTargetCommonOption,
  updateCads,
  updateAads,
  updateLDads,
  updateOnChipMemories,
  updateTargetCompiler,
  updateTargetDebugUtilities,
  saveProject,
};
