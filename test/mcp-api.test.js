const fs = require('fs');
const path = require('path');
const assert = require('assert');
const api = require('../src/api');

const SRC_PROJECT = path.resolve(__dirname, '../tmp/BCL603S2.uvprojx');
const WORK_PROJECT = path.resolve(__dirname, './output/mcp_test.uvprojx');
const RENAME_PROJECT = path.resolve(__dirname, './output/rename_test.uvprojx');
const TARGET = 'nrf52840_s2p_softdevice';

function resetProject() {
  fs.copyFileSync(SRC_PROJECT, WORK_PROJECT);
}

function assertOk(res, label) {
  if (res && res.error) {
    console.error(label, res);
    throw new Error(`${label} failed: ${res.message}`);
  }
}

async function run() {
  resetProject();

  // 1. list_projects
  const list = await api.listProjects({ root: path.resolve(__dirname, '../tmp') });
  assertOk(list, 'list_projects');
  assert(list.projects.length > 0, 'list_projects should find projects');
  console.log('✓ list_projects');

  // 2. read_project
  const rp = api.readProject({ file: WORK_PROJECT });
  assertOk(rp, 'read_project');
  assert.strictEqual(rp.schema_version, '2.1');
  assert(rp.targets.includes(TARGET));
  console.log('✓ read_project');

  // 3. read_target summary (compact)
  let rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'summary' });
  assertOk(rt, 'read_target summary');
  assert.strictEqual(rt.section, 'summary');
  assert.strictEqual(rt.summary.device, 'nRF52840_xxAA');
  console.log('✓ read_target summary compact');

  // 4. read_target compiler (compact)
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'compiler' });
  assertOk(rt, 'read_target compiler');
  assert.strictEqual(rt.section, 'compiler');
  assert(rt.compiler.cads.defines && rt.compiler.cads.defines._count !== undefined);
  console.log('✓ read_target compiler compact');

  // 5. read_target memory (compact)
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'memory' });
  assertOk(rt, 'read_target memory compact');
  assert(rt.memory && rt.memory._count !== undefined);
  console.log('✓ read_target memory compact');

  // 6. read_target memory (expanded)
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'memory', compact: false });
  assertOk(rt, 'read_target memory expanded');
  assert(typeof rt.memory === 'object' && rt.memory._count === undefined);
  console.log('✓ read_target memory expanded');

  // 7. read_target all
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'all' });
  assertOk(rt, 'read_target all');
  assert(Array.isArray(rt.sections));
  assert(rt.summary && rt.compiler && rt.memory);
  console.log('✓ read_target all');

  // 8. read_groups
  let rg = api.readGroups({ file: WORK_PROJECT, target: TARGET, perPage: 10 });
  assertOk(rg, 'read_groups');
  assert.strictEqual(rg.items.length, 10);
  assert(rg.total > 0);
  console.log('✓ read_groups');

  // 9. read_groups include_files
  let rgf = api.readGroups({ file: WORK_PROJECT, target: TARGET, include_files: true, perPage: 5 });
  assertOk(rgf, 'read_groups include_files');
  assert(Array.isArray(rgf.items[0].files));
  console.log('✓ read_groups include_files');

  // 10. search files
  const sr = api.search({ file: WORK_PROJECT, target: TARGET, scope: 'files', keyword: 'main', perPage: 10 });
  assertOk(sr, 'search files');
  assert(sr.total >= 0);
  console.log('✓ search files');

  // 11. search defines
  const sd = api.search({ file: WORK_PROJECT, target: TARGET, scope: 'cads_defines', keyword: 'NRF', perPage: 10 });
  assertOk(sd, 'search defines');
  console.log('✓ search cads_defines');

  // 12. manage_compiler_lists add
  let mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'add',
    value: 'MY_TEST_DEFINE=1',
  });
  assertOk(mc, 'manage_compiler_lists add');
  assert.strictEqual(mc.count, 1);
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'cads', compact: false });
  assertOk(rt, 'read cads after add');
  assert(rt.cads.defines.includes('MY_TEST_DEFINE=1'));
  console.log('✓ manage_compiler_lists add');

  // 13. manage_compiler_lists add idempotent
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'add',
    value: 'MY_TEST_DEFINE=1',
  });
  assertOk(mc, 'manage_compiler_lists add idempotent');
  assert.strictEqual(mc.count, 0);
  console.log('✓ manage_compiler_lists add idempotent');

  // 14. manage_compiler_lists remove
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'remove',
    value: 'MY_TEST_DEFINE=1',
  });
  assertOk(mc, 'manage_compiler_lists remove');
  assert.strictEqual(mc.count, 1);
  console.log('✓ manage_compiler_lists remove');

  // 15. manage_compiler_lists remove non-existent
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'remove',
    value: 'MY_TEST_DEFINE=1',
  });
  assertOk(mc, 'manage_compiler_lists remove non-existent');
  assert.strictEqual(mc.count, 0);
  console.log('✓ manage_compiler_lists remove non-existent');

  // 16. manage_compiler_lists set
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'cads', compact: false });
  const originalDefines = rt.cads.defines.slice();
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'set',
    value: ['A', 'B'],
  });
  assertOk(mc, 'manage_compiler_lists set');
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'cads', compact: false });
  assert.deepStrictEqual(rt.cads.defines, ['A', 'B']);
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_defines',
    action: 'set',
    value: originalDefines,
  });
  assertOk(mc, 'manage_compiler_lists restore');
  console.log('✓ manage_compiler_lists set');

  // 17. manage_compiler_lists aads_defines
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'aads_defines',
    action: 'add',
    value: 'AASM_TEST=1',
  });
  assertOk(mc, 'manage_compiler_lists aads add');
  assert.strictEqual(mc.count, 1);
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'aads', compact: false });
  assert(rt.aads.asm_defines.includes('AASM_TEST=1'));
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'aads_defines',
    action: 'remove',
    value: 'AASM_TEST=1',
  });
  assertOk(mc, 'manage_compiler_lists aads remove');
  assert.strictEqual(mc.count, 1);
  console.log('✓ manage_compiler_lists aads_defines');

  // 18. manage_compiler_lists cads_include_paths (case-insensitive)
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_include_paths',
    action: 'add',
    value: '..\\test_include',
  });
  assertOk(mc, 'manage_compiler_lists cads include_paths add');
  assert.strictEqual(mc.count, 1);
  mc = api.manageCompilerLists({
    file: WORK_PROJECT,
    target: TARGET,
    section: 'cads_include_paths',
    action: 'remove',
    value: '..\\TEST_INCLUDE',
  });
  assertOk(mc, 'manage_compiler_lists cads include_paths remove');
  assert.strictEqual(mc.count, 1);
  console.log('✓ manage_compiler_lists cads_include_paths');

  // 19. manage_group add
  let mg = api.manageGroup({ file: WORK_PROJECT, target: TARGET, action: 'add', group: 'TestGroup' });
  assertOk(mg, 'manage_group add');
  rg = api.readGroups({ file: WORK_PROJECT, target: TARGET, perPage: 100 });
  assert(rg.items.includes('TestGroup'));
  console.log('✓ manage_group add');

  // 18. manage_group add existing -> group-already-exists
  mg = api.manageGroup({ file: WORK_PROJECT, target: TARGET, action: 'add', group: 'TestGroup' });
  assert(mg.error && mg.code === 'group-already-exists');
  console.log('✓ manage_group add existing error');

  // 19. manage_group rename
  mg = api.manageGroup({ file: WORK_PROJECT, target: TARGET, action: 'rename', group: 'TestGroup', newName: 'RenamedGroup' });
  assertOk(mg, 'manage_group rename');
  rg = api.readGroups({ file: WORK_PROJECT, target: TARGET, perPage: 100 });
  assert(rg.items.includes('RenamedGroup'));
  assert(!rg.items.includes('TestGroup'));
  console.log('✓ manage_group rename');

  // 20. manage_group remove
  mg = api.manageGroup({ file: WORK_PROJECT, target: TARGET, action: 'remove', group: 'RenamedGroup' });
  assertOk(mg, 'manage_group remove');
  rg = api.readGroups({ file: WORK_PROJECT, target: TARGET, perPage: 100 });
  assert(!rg.items.includes('RenamedGroup'));
  console.log('✓ manage_group remove');

  // 21. manage_group remove non-existent -> group-not-found
  mg = api.manageGroup({ file: WORK_PROJECT, target: TARGET, action: 'remove', group: 'RenamedGroup' });
  assert(mg.error && mg.code === 'group-not-found');
  console.log('✓ manage_group remove non-existent error');

  // 22. manage_file add
  let mf = api.manageFile({
    file: WORK_PROJECT,
    target: TARGET,
    action: 'add',
    items: [{ group: 'app', type: 'c', files: ['..\\new_main.c'] }],
  });
  assertOk(mf, 'manage_file add');
  rgf = api.readGroups({ file: WORK_PROJECT, target: TARGET, include_files: true, perPage: 100 });
  const appGroup = rgf.items.find((g) => g.name === 'app');
  assert(appGroup && appGroup.files.some((f) => f.path === '..\\new_main.c'));
  console.log('✓ manage_file add');

  // 23. manage_file remove
  mf = api.manageFile({
    file: WORK_PROJECT,
    target: TARGET,
    action: 'remove',
    items: [{ group: 'app', files: ['..\\new_main.c'] }],
  });
  assertOk(mf, 'manage_file remove');
  rgf = api.readGroups({ file: WORK_PROJECT, target: TARGET, include_files: true, perPage: 100 });
  const appGroupAfterRemove = rgf.items.find((g) => g.name === 'app');
  assert(!appGroupAfterRemove.files.some((f) => f.path === '..\\new_main.c'));
  console.log('✓ manage_file remove');

  // 24. manage_file move
  mf = api.manageFile({
    file: WORK_PROJECT,
    target: TARGET,
    action: 'add',
    items: [{ group: 'app', type: 'c', files: ['..\\move_test.c'] }],
  });
  assertOk(mf, 'manage_file add for move');
  const otherGroup = rg.items.find((g) => g !== 'app');
  mf = api.manageFile({
    file: WORK_PROJECT,
    target: TARGET,
    action: 'move',
    items: [{ group: 'app', toGroup: otherGroup, files: ['..\\move_test.c'] }],
  });
  assertOk(mf, 'manage_file move');
  rgf = api.readGroups({ file: WORK_PROJECT, target: TARGET, include_files: true, perPage: 100 });
  const destGroup = rgf.items.find((g) => g.name === otherGroup);
  assert(destGroup && destGroup.files.some((f) => f.path === '..\\move_test.c'));
  const appGroupAfterMove = rgf.items.find((g) => g.name === 'app');
  assert(!appGroupAfterMove.files.some((f) => f.path === '..\\move_test.c'));
  console.log('✓ manage_file move');

  // 25. update_target_config ldads
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'ldads', compact: false });
  const newLdads = { ...rt.ldads, linker_misc: '--test-flag' };
  let utc = api.updateTargetConfig({ file: WORK_PROJECT, target: TARGET, section: 'ldads', data: newLdads });
  assertOk(utc, 'update_target_config ldads');
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'ldads', compact: false });
  assert.strictEqual(rt.ldads.linker_misc, '--test-flag');
  console.log('✓ update_target_config ldads');

  // 26. update_target_config summary requires confirm
  utc = api.updateTargetConfig({ file: WORK_PROJECT, target: TARGET, section: 'summary', data: { output_name: 'test_output' } });
  assert(utc.error && utc.code === 'confirm-required');
  console.log('✓ update_target_config summary confirm-required');

  // 27. update_target_config summary with confirm
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'summary', compact: false });
  const newSummary = { ...rt.summary, output_name: 'test_output' };
  utc = api.updateTargetConfig({ file: WORK_PROJECT, target: TARGET, section: 'summary', confirm: true, data: newSummary });
  assertOk(utc, 'update_target_config summary');
  rt = api.readTarget({ file: WORK_PROJECT, target: TARGET, section: 'summary', compact: false });
  assert.strictEqual(rt.summary.output_name, 'test_output');
  console.log('✓ update_target_config summary with confirm');

  // 28. update_target_config rejects compact placeholders
  utc = api.updateTargetConfig({ file: WORK_PROJECT, target: TARGET, section: 'cads', data: { defines: { _count: 10 } } });
  assert(utc.error && utc.code === 'invalid-compact-data');
  console.log('✓ update_target_config rejects compact placeholders');

  // 29. rename_target (on a fresh copy)
  fs.copyFileSync(SRC_PROJECT, RENAME_PROJECT);
  let rn = api.renameTarget({ file: RENAME_PROJECT, target: TARGET, newName: 'RenamedTarget' });
  assertOk(rn, 'rename_target');
  const rp2 = api.readProject({ file: RENAME_PROJECT });
  assert(rp2.targets.includes('RenamedTarget'));
  assert(!rp2.targets.includes(TARGET));
  console.log('✓ rename_target');

  // Verify RTE targetInfo entries are renamed
  {
    const xml = fs.readFileSync(RENAME_PROJECT, 'utf8');
    assert(!/targetInfo[^>]*name="nrf52840_s2p_softdevice"/.test(xml), 'RTE targetInfo old name should be gone');
    assert(/targetInfo[^>]*name="RenamedTarget"/.test(xml), 'RTE targetInfo should use new name');
    console.log('✓ rename_target updates RTE targetInfo');
  }

  // 30. rename_target conflict
  rn = api.renameTarget({ file: RENAME_PROJECT, target: 'RenamedTarget', newName: 'lib' });
  assert(rn.error && rn.code === 'target-name-conflict');
  console.log('✓ rename_target conflict');

  // 31. delete_target (on a fresh copy with 3 targets)
  const DELETE_PROJECT = path.resolve(__dirname, './output/delete_test.uvprojx');
  fs.copyFileSync(SRC_PROJECT, DELETE_PROJECT);
  let dl = api.deleteTarget({ file: DELETE_PROJECT, target: 'lib' });
  assertOk(dl, 'delete_target');
  assert.strictEqual(dl.target, 'lib');
  assert.strictEqual(dl.deleted, true);
  const dp = api.readProject({ file: DELETE_PROJECT });
  assert(!dp.targets.includes('lib'));
  assert(dp.targets.length === 2);
  console.log('✓ delete_target');

  // Verify RTE targetInfo entries for 'lib' are cleaned up
  {
    const xml = fs.readFileSync(DELETE_PROJECT, 'utf8');
    const pattern = new RegExp('targetInfo[^>]*name="lib"');
    assert(!pattern.test(xml), 'RTE targetInfo for deleted target should be removed');
    // Other targets should still be present
    assert(/targetInfo[^>]*name="1\.5\.3"/.test(xml), 'RTE targetInfo for remaining target should exist');
    console.log('✓ delete_target cleans RTE targetInfo');
  }

  // 32. delete_target last target (should fail)
  // Delete second target to leave only one
  dl = api.deleteTarget({ file: DELETE_PROJECT, target: '1.5.3' });
  assertOk(dl, 'delete_target second');
  // Now only one target remains, next delete should fail
  dl = api.deleteTarget({ file: DELETE_PROJECT, target: TARGET });
  assert(dl.error && dl.code === 'last-target');
  console.log('✓ delete_target last-target');

  // 33. keil_scan detect
  const ks = await api.keilScan({ action: 'detect' });
  assert(ks.error && ks.code === 'environment-missing');
  console.log('✓ keil_scan detect environment-missing');

  // 34. keil_build detect
  const kb = await api.keilBuild({ action: 'detect' });
  assert(kb.error && kb.code === 'environment-missing');
  console.log('✓ keil_build detect environment-missing');

  console.log('\nAll MCP API tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
