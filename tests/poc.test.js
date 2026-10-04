const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { matchesScopePattern, classifyScope } = require('../dist/triage/scope');
const { validateBountyGate } = require('../dist/validation/input');
const cli = path.resolve('dist/cli.js');
function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(result.status, expected, result.stderr);
  return result;
}
(async () => {
  // Scope patterns: bare paths are prefixes on whole components; wildcards are explicit.
  assert.equal(matchesScopePattern('contracts/pool/GaugeV3.sol', 'contracts/pool'), true);
  assert.equal(matchesScopePattern('contracts/poolside/X.sol', 'contracts/pool'), false);
  assert.equal(matchesScopePattern('contracts/test/mocks/A.sol', 'contracts/test/**'), true);
  assert.equal(matchesScopePattern('contracts/a/B.sol', 'contracts/*.sol'), false);
  assert.equal(classifyScope('src/Vault.sol', undefined), 'undeclared');
  assert.equal(classifyScope('src/Vault.sol', { outOfScopePaths: ['src/Vault.sol'], inScopePaths: ['src'] }), 'out of scope');
  assert.equal(classifyScope('lib/x/Y.sol', { inScopePaths: ['src'] }), 'out of scope');
  assert.throws(() => validateBountyGate({ schemaVersion: '1.0', scope: { contracts: [{ name: 'Vault', address: '0x123' }] } }), /scope\.contracts/);
  assert.throws(() => validateBountyGate({ schemaVersion: '1.0', scope: { deployedCommit: 'main' } }), /deployedCommit/);

  // Work in a sibling of the fixtures so the shared forge-std remapping resolves.
  const root = path.resolve('tests/exploits', `.tmp-poc-${process.pid}`);
  try {
    await fs.cp(path.resolve('tests/exploits/reentrancy-vault'), root, { recursive: true, filter: source => !/\/(out|cache)$/.test(source) });
    const scan = path.join(root, 'slither-vulnerable.json');
    const out = path.join(root, 'report');
    const reportPath = path.join(out, 'report.json');
    const address = '0x00000000000000000000000000000000000000AA';

    await fs.mkdir(path.join(root, '.aevasec'));
    const writeGate = scope => fs.writeFile(path.join(root, '.aevasec/bounty.json'), JSON.stringify({ schemaVersion: '1.0', scope }));
    await writeGate({ inScopePaths: ['src'], deployedCommit: 'deadbeef', knownIssues: ['Audit 2025 M-01'], contracts: [{ name: 'Vault', address, chain: 'mainnet' }] });
    run(['ingest', 'slither', scan, '--target', root, '--out', out]);
    const inScope = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(inScope.findings[0].triage.bounty.pocPriority, 'high');
    assert.ok(inScope.errors.some(error => error.source === 'scope' && /deadbeef/.test(error.message)));
    assert.match(await fs.readFile(path.join(out, 'report.md'), 'utf8'), /DIFFERS from target[\s\S]*Audit 2025 M-01/);

    const scaffold = path.join(root, 'test/aevasec/Slither1PoC.t.sol');
    assert.match(run(['poc', reportPath, 'slither-1', '--fork-rpc-env', 'ETH_RPC_URL', '--fork-block', '100']).stdout, /forge test --root/);
    const forked = await fs.readFile(scaffold, 'utf8');
    assert.match(forked, /vm\.createSelectFork\(vm\.envString\("ETH_RPC_URL"\), 100\);/);
    assert.ok(forked.includes(`target = Vault(payable(vm.parseAddress("${address}")));`));
    assert.match(forked, /import "\.\.\/\.\.\/src\/Vault\.sol";/);
    assert.match(run(['poc', reportPath, 'slither-1'], 1).stderr, /already exists/);
    assert.match(run(['poc', reportPath, 'slither-1', '--fork-block', '1'], 1).stderr, /requires --fork-rpc-env/);
    assert.match(run(['poc', reportPath, 'missing'], 1).stderr, /Finding or target path missing/);
    assert.match(run(['surface', reportPath], 1).stderr, /No build-info/);
    run(['poc', reportPath, 'slither-1', '--force']);

    // The scaffold must compile and must fail until a real PoC is written.
    const hasForge = spawnSync('forge', ['--version']).status === 0;
    const hasForgeStd = await fs.access(path.resolve('tests/exploits/lib/forge-std')).then(() => true, () => false);
    if (hasForge && hasForgeStd) {
      const forge = spawnSync('forge', ['test', '--root', root, '--match-path', 'test/aevasec/Slither1PoC.t.sol'], { encoding: 'utf8' });
      assert.notEqual(forge.status, 0, 'unimplemented scaffold must not pass');
      assert.match(forge.stdout + forge.stderr, /aevasec: PoC not implemented/);

      // Review surface: in-scope external functions only, with the lead attached by line range.
      await fs.rm(scaffold);
      assert.equal(spawnSync('forge', ['build', '--build-info', '--root', root], { encoding: 'utf8' }).status, 0);
      // The hand-written fixture scan starts the function one line early; use the compiler's range.
      const fixed = JSON.parse(await fs.readFile(scan, 'utf8'));
      const mapping = fixed.results.detectors[0].elements[0].source_mapping;
      mapping.lines = mapping.lines.filter(line => line >= 11);
      await fs.writeFile(path.join(root, 'scan-fixed.json'), JSON.stringify(fixed));
      run(['ingest', 'slither', path.join(root, 'scan-fixed.json'), '--target', root, '--out', out]);
      run(['surface', reportPath]);
      const surface = JSON.parse(await fs.readFile(path.join(out, 'surface.json'), 'utf8'));
      const names = surface.entries.map(entry => `${entry.file}:${entry.contract}.${entry.function}:${entry.mutability}`);
      assert.ok(names.includes('src/Vault.sol:Vault.withdraw:nonpayable') && names.includes('src/Vault.sol:Vault.deposit:payable'));
      assert.ok(surface.entries.every(entry => entry.file.startsWith('src/')), 'test and library sources must not be listed');
      assert.deepEqual(surface.entries.find(entry => entry.contract === 'Vault' && entry.function === 'withdraw').leadIds, ['slither-1']);
    } else {
      console.log('forge or forge-std unavailable; skipped scaffold compile check (run npm run test:exploits once)');
    }

    await writeGate({ inScopePaths: ['contracts'] });
    run(['ingest', 'slither', scan, '--target', root, '--out', out]);
    const outside = JSON.parse(await fs.readFile(reportPath, 'utf8')).findings[0].triage.bounty;
    assert.ok(outside.externalReachability.includes('outside declared bounty scope'));
    assert.equal(outside.pocPriority, 'low');
    console.log('scope, PoC scaffold and review surface regressions passed');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
