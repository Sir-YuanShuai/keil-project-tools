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

module.exports = {
  readProject,
  readWorkspace,
  createProject,
  setTargetName,
  setDefines,
  setIncludePaths,
  addFile,
  removeFile,
  saveProject,
};
