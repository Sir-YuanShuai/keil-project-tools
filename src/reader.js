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

function splitComma(text) {
  if (!text) return [];
  // Keil defines can be separated by commas or spaces depending on the project generator.
  return text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function normalizePath(filePath, projectDir) {
  if (!filePath) return { original: filePath, absolute: filePath };
  const original = filePath.replace(/\\/g, '/');

  const keilVars = ['PRJ_DIR$', 'ROJ_DIR$', 'CWD$', 'UV4$'];
  if (keilVars.some((v) => original.startsWith(v))) {
    return { original, absolute: original };
  }

  if (path.isAbsolute(original)) {
    return { original, absolute: original };
  }

  const absolute = path.resolve(projectDir, original);
  return { original, absolute };
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

  return {
    device: common.Device || null,
    vendor: common.Vendor || null,
    pack_id: common.PackID || null,
    pack_url: common.PackURL || null,
    cpu: common.Cpu || null,
    output_directory: common.OutputDirectory || null,
    output_name: common.OutputName || null,
    create_executable: common.CreateExecutable === '1',
    create_lib: common.CreateLib === '1',
    create_hex_file: common.CreateHexFile === '1',
  };
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

module.exports = {
  readProject,
  readWorkspace,
  FILE_TYPE_MAP,
  normalizePath,
  splitComma,
  splitSemicolon,
};
