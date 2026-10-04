const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classifyFindingForBounty } = require('../dist/triage/bountyTriage');
const { readSourceWindow } = require('../dist/source/readSourceWindow');
const benchmark = require('../fixtures/gearbox-review-benchmark.json');

// Source excerpts are read from a local checkout at the pinned commit; the fixture does not redistribute them.
const target = path.resolve(process.env.AEVASEC_GEARBOX_TARGET || 'targets/gearbox-core-v3');
(async () => {
  if (!fs.existsSync(target)) {
    console.log(`Gearbox benchmark skipped: no checkout at ${target} (clone gearbox-core-v3 at ${benchmark.targetCommit} or set AEVASEC_GEARBOX_TARGET)`);
    return;
  }
  assert.equal(execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), benchmark.targetCommit, 'checkout is not at the benchmark commit');
  const rows = [];
  for (const item of benchmark.cases) {
    const { file, lineStart, lineEnd } = item.finding.location;
    const source = await readSourceWindow({ targetPath: target, relativeFile: file, lineStart, lineEnd, contextLines: 0 });
    assert.ok(source.available, `${item.finding.id}: ${source.reason}`);
    const result = classifyFindingForBounty(item.finding, source, benchmark.gate).triage.bounty;
    assert.equal(result.bountyActionability, 'unclear', `${item.finding.id} requires review`);
    if (item.review.group === 'retain') assert.notEqual(result.pocPriority, 'skip');
    rows.push({ id: item.finding.id, group: item.review.group, previous: item.previousPriority, priority: result.pocPriority, score: result.score });
  }
  console.table(rows);
  const retained = rows.filter(row => row.group === 'retain');
  console.log(`Selected uncertain callback leads skipped: before ${retained.filter(row => row.previous === 'skip').length}/${retained.length}, after ${retained.filter(row => row.priority === 'skip').length}/${retained.length}`);
  console.log('Benchmark preserves uncertainty; no confirmed-positive recall or time-saving claim is established.');
})().catch(error => { console.error(error); process.exitCode = 1; });
