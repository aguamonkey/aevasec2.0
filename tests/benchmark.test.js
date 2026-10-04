const assert = require('node:assert/strict');
const { classifyFindingForBounty } = require('../dist/triage/bountyTriage');
const benchmark = require('../fixtures/gearbox-review-benchmark.json');
const rows = benchmark.cases.map(item => {
  const result = classifyFindingForBounty(item.finding, { available: true, content: item.source }, benchmark.gate).triage.bounty;
  assert.equal(result.bountyActionability, 'unclear', `${item.finding.id} requires review`);
  if (item.review.group === 'retain') assert.notEqual(result.pocPriority, 'skip');
  return { id: item.finding.id, group: item.review.group, previous: item.previousPriority, priority: result.pocPriority, score: result.score };
});
console.table(rows);
const retained = rows.filter(row => row.group === 'retain');
console.log(`Selected uncertain callback leads skipped: before ${retained.filter(row => row.previous === 'skip').length}/${retained.length}, after ${retained.filter(row => row.priority === 'skip').length}/${retained.length}`);
console.log('Benchmark preserves uncertainty; no confirmed-positive recall or time-saving claim is established.');
