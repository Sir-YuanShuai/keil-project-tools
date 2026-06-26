const fs = require('fs');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { FILE_TYPE_MAP } = require('./reader');

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

function setIncludePaths(project, targetName, includePaths) {
  const target = getTarget(project, targetName);
  const controls = getCadsControls(target);
  const paths = Array.isArray(includePaths)
    ? includePaths.join(';')
    : includePaths;
  controls.IncludePath = paths;
  return project;
}

function getGroups(target) {
  if (!target.Groups) {
    target.Groups = {};
  }
  return ensureArray(target.Groups.Group);
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

function addFile(project, targetName, groupName, fileName, filePath, fileType = 'c') {
  const target = getTarget(project, targetName);
  const group = getOrCreateGroup(target, groupName);
  const files = getFiles(group);

  const typeCode = REVERSE_FILE_TYPE_MAP[fileType] || '1';

  // Check if file already exists
  const exists = files.some((f) => f.FilePath === filePath);
  if (exists) {
    throw new Error(`File already exists in group: ${filePath}`);
  }

  files.push({
    FileName: fileName,
    FileType: typeCode,
    FilePath: filePath,
  });

  group.Files.File = files;
  return project;
}

function removeFile(project, targetName, filePath) {
  const target = getTarget(project, targetName);
  const groups = getGroups(target);
  let removed = false;

  for (const group of groups) {
    const files = getFiles(group);
    const newFiles = files.filter((f) => f.FilePath !== filePath);
    if (newFiles.length !== files.length) {
      group.Files.File = newFiles.length === 1 ? newFiles[0] : newFiles;
      removed = true;
    }
  }

  if (!removed) {
    throw new Error(`File not found in any group: ${filePath}`);
  }

  return project;
}

function saveProject(project, outputPath) {
  const outPath = outputPath || project.path;
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
  setIncludePaths,
  addFile,
  removeFile,
  saveProject,
};
