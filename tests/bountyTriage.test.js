const assert = require('node:assert/strict');
const { classifyFindingForBounty } = require('../dist/triage/bountyTriage');
const gate = { minimumPaidSeverity: 'MEDIUM', skipLowInformational: true, source: 'default', excludedImpacts: [], dependencyConfigAssumptions: [], privilegedRoleAssumptions: [] };
function classify(source, description = 'External callback followed by balance state update', available = true, rule = 'reentrancy-eth') {
  return classifyFindingForBounty({ id: 'slither-1', ruleId: `SLITHER:${rule}`, title: rule, severity: 'HIGH', location: { file: 'contracts/Vault.sol', lineStart: 1 }, evidence: { description }, status: 'OPEN' }, { available, content: source }, gate).triage.bounty;
}
const unknown = classify('', 'Missing source', false);
assert.deepEqual(unknown.externalReachability, ['unclear']);
assert.equal(unknown.bountyActionability, 'unclear');
const publicOracle = classify('function withdraw() external { oracle.price(); balances[msg.sender] = 0; }');
assert.deepEqual(publicOracle.externalReachability, ['unclear']);
assert.notEqual(publicOracle.pocPriority, 'skip');
assert.equal(publicOracle.bountyActionability, 'unclear');
assert.equal(publicOracle.assessment, 'heuristic');
assert.ok(publicOracle.evidence.length);
assert.ok(publicOracle.limitations.length);
const neighbor = classify('function withdraw() external { balances[msg.sender] = 0; } function admin() external onlyOwner {}');
assert.deepEqual(neighbor.externalReachability, ['unclear']);
const comments = classify('// onlyOwner malicious oracle\nfunction withdraw() external { balances[msg.sender] = 0; }');
assert.deepEqual(comments.externalReachability, ['unclear']);
const owner = classify('function settle() external onlyOwner { balances[msg.sender] = 0; }');
assert.ok(owner.externalReachability.includes('owner/governance/deployer only'));
assert.notEqual(owner.bountyActionability, 'yes');
const facade = classify('function addCollateral() external creditFacadeOnly { token.transferFrom(payer, account, amount); }');
assert.ok(facade.externalReachability.includes('whitelisted/approved user reachable'));
assert.notEqual(facade.bountyActionability, 'yes');
const local = classify('uint256 amount;', 'Uninitialized local amount', true, 'uninitialized-local');
assert.notEqual(local.pocPriority, 'skip');

const falseAssetLoss = classify('function doMath(uint256 balance) external {}', 'Unrelated math logic', true, 'naming-convention');
assert.ok(!falseAssetLoss.impact.includes('direct asset loss'), 'Local variable named balance should not trigger direct asset loss');

const testFile = classifyFindingForBounty({ id: 'slither-test', ruleId: 'SLITHER:reentrancy-eth', title: 'reentrancy', severity: 'HIGH', location: { file: 'contracts/test/MockOracle.sol', lineStart: 1 }, evidence: { description: 'Mock' }, status: 'OPEN' }, { available: true, content: 'function withdraw() external {}' }, gate).triage.bounty;
assert.ok(testFile.externalReachability.includes('test/reader/oracle/dependency out of scope'), 'Mock file should be flagged as out of scope');

const adapterFile = classifyFindingForBounty({ id: 'slither-adapter', ruleId: 'SLITHER:reentrancy-eth', title: 'reentrancy', severity: 'HIGH', location: { file: 'contracts/adapters/UniswapAdapter.sol', lineStart: 1 }, evidence: { description: 'Adapter' }, status: 'OPEN' }, { available: true, content: 'function swap() external {}' }, gate).triage.bounty;
assert.deepEqual(adapterFile.externalReachability, ['unclear'], 'Adapter filenames do not establish dependency-only reachability');


// Normal operations and identifiers in source must not imply security impact.
for (const source of [
  'function calculate(uint256 price, uint256 oracle, uint256 debt, uint256 shares, uint256 nonce) external {}',
  'function withdraw() external { token.transferFrom(msg.sender, address(this), amount); }',
  'function check() external { revert(); emit Updated(); }',
  'function calculate(uint256 stuck, uint256 liquidation, uint256 dust) external {}'
]) {
  const result = classify(source, 'Unrelated logic', true, 'custom-detector');
  assert.deepEqual(result.impact, ['no concrete impact found']);
  assert.equal(result.likelySeverity, 'UNCLEAR');
  assert.equal(result.pocPriority, 'low');
}
// Positive classification controls are detector claims, not validated exploits.
for (const [description, expected] of [
  ['Attacker can drain victim funds', 'direct asset loss'],
  ['User funds are stuck', 'stuck funds'],
  ['Unauthorized accounting mutation', 'unauthorized accounting/state change'],
  ['Persistent denial of service', 'persistent DoS'],
  ['Liquidation causes bad debt', 'liquidation/solvency impact'],
  ['Attacker manipulates oracle price', 'oracle/price manipulation'],
  ['Bounded gas grief', 'bounded griefing'],
  ['Event indexer noise', 'event/indexer noise']
]) {
  assert.ok(classify('', description, false, 'custom-detector').impact.includes(expected), description);
}
for (const [file, expected] of [
  ['contracts/LatestVault.sol', 'unclear'],
  ['contracts/Contest.sol', 'unclear'],
  ['contracts/oracles/CoreOracle.sol', 'unclear'],
  ['contracts/interfaces/IVault.sol', 'test/reader/oracle/dependency out of scope'],
  ['test/Vault.t.sol', 'test/reader/oracle/dependency out of scope'],
  ['contracts\\mocks\\Oracle.sol', 'test/reader/oracle/dependency out of scope']
]) {
  const result = classifyFindingForBounty({ id: 'path-control', ruleId: 'custom', title: 'custom', severity: 'HIGH', location: { file, lineStart: 1 }, evidence: { description: 'Unrelated logic' }, status: 'OPEN' }, { available: true, content: 'function calculate() external {}' }, gate).triage.bounty;
  assert.deepEqual(result.externalReachability, [expected], file);
}

console.log('bounty uncertainty regressions passed');
