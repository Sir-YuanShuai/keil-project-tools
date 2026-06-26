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

function setTargetName(project, targetName, newName) {
  const target = getTarget(project, targetName);
  target.TargetName = newName;
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

function addFile(project, targetName, groupName, fileName, filePath, fileType = 'c') {
  const target = getTarget(project, targetName);
  const group = getOrCreateGroup(target, groupName);
  const files = getFiles(group);

  const typeCode = REVERSE_FILE_TYPE_MAP[fileType] || '1';
  const keilPath = toKeilPath(filePath);
  const normalizedInput = normalizeForCompare(filePath);

  if (files.some((f) => normalizeForCompare(f.FilePath) === normalizedInput)) {
    throw new Error(`File already exists in group: ${filePath}`);
  }

  files.push({
    FileName: fileName,
    FileType: typeCode,
    FilePath: keilPath,
  });

  group.Files.File = files;
  return project;
}

function removeFile(project, targetName, groupName, filePath) {
  const target = getTarget(project, targetName);
  const group = getGroup(target, groupName);
  const files = getFiles(group);
  const normalizedInput = normalizeForCompare(filePath);

  const newFiles = files.filter((f) => normalizeForCompare(f.FilePath) !== normalizedInput);
  if (newFiles.length === files.length) {
    throw new Error(`File not found in group ${groupName}: ${filePath}`);
  }

  group.Files.File = newFiles.length === 1 ? newFiles[0] : newFiles;
  return project;
}

function moveFile(project, targetName, filePath, fromGroupName, toGroupName) {
  const target = getTarget(project, targetName);
  const fromGroup = getGroup(target, fromGroupName);
  const toGroup = getGroup(target, toGroupName);
  const normalizedInput = normalizeForCompare(filePath);

  const fromFiles = getFiles(fromGroup);
  const idx = fromFiles.findIndex((f) => normalizeForCompare(f.FilePath) === normalizedInput);
  if (idx === -1) {
    throw new Error(`File not found in group ${fromGroupName}: ${filePath}`);
  }

  const file = fromFiles[idx];
  const remainingFiles = fromFiles.filter((_, i) => i !== idx);
  fromGroup.Files.File = remainingFiles.length === 1 ? remainingFiles[0] : remainingFiles;

  const toFiles = getFiles(toGroup);
  if (toFiles.some((f) => normalizeForCompare(f.FilePath) === normalizedInput)) {
    throw new Error(`File already exists in group ${toGroupName}: ${filePath}`);
  }
  toFiles.push(file);
  toGroup.Files.File = toFiles;

  return project;
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
};
