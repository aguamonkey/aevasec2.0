// Measures a saved run against independently judged contest findings.
// Usage: node tests/judgedRecall.js <report.json> <judged-fixture.json>
// Needs surface.json next to the report (run `node dist/cli.js surface <report.json>` first).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [reportPath, fixturePath] = process.argv.slice(2);
if (!reportPath || !fixturePath) { console.error('Usage: node tests/judgedRecall.js <report.json> <judged-fixture.json>'); process.exit(1); }
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const judged = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const surface = JSON.parse(fs.readFileSync(path.join(path.dirname(reportPath), 'surface.json'), 'utf8'));
if (report.target.gitCommit) assert.equal(report.target.gitCommit, judged.commit, 'report was not generated from the pinned judged commit');

const open = report.findings.filter(finding => finding.status === 'OPEN');
const PRIORITY = { high: 0, medium: 1, low: 2, skip: 3 };
const SEVERITY = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const byAevasec = [...open].sort((a, b) => PRIORITY[a.triage.bounty.pocPriority] - PRIORITY[b.triage.bounty.pocPriority] || b.triage.bounty.score - a.triage.bounty.score);
const entryFor = (file, name) => surface.entries.find(entry => entry.file === file && entry.function === name);
const leadFor = (item, label) => {
  const entry = entryFor(item.file, label.function);
  return entry && open.find(finding => finding.ruleId === label.ruleId && entry.leadIds.includes(finding.id));
};

const rows = [];
const missingFunctions = [];
const rootCauseLeads = new Set();
for (const item of judged.findings) {
  const entries = item.functions.map(name => entryFor(item.file, name) || missingFunctions.push(`${item.id} ${item.file}:${name}`) && undefined);
  const inSurface = entries.every(Boolean);
  const coLocated = entries.filter(Boolean).flatMap(entry => entry.leadIds);
  const rootCause = (item.detectorRootCause || []).map(label => {
    const lead = leadFor(item, label);
    assert.ok(lead, `${item.id}: labelled ${label.ruleId} lead not found in ${label.function}`);
    rootCauseLeads.add(lead.id);
    return `${lead.id} (Slither ${lead.severity}; aevasec ${lead.triage.bounty.pocPriority}, rank ${byAevasec.indexOf(lead) + 1}/${open.length})`;
  });
  const partial = (item.detectorPartial || []).map(label => leadFor(item, label)).filter(Boolean).map(lead => `${lead.id} (Slither ${lead.severity}; aevasec ${lead.triage.bounty.pocPriority})`);
  rows.push({ id: item.id, functions: item.functions.join(','), inSurface, leadsInSameFunction: coLocated.length, detectorRootCause: rootCause.join('; ') || '-', detectorPartial: partial.join('; ') || '-' });
}
console.table(rows);

const total = judged.findings.length;
const count = predicate => rows.filter(predicate).length;
const bucket = (label, leads) => `${label}: ${leads.length} leads, ${leads.filter(lead => rootCauseLeads.has(lead.id)).length} state a judged root cause`;
const readOnly = surface.entries.filter(entry => entry.mutability === 'view' || entry.mutability === 'pure').length;
console.log(`${judged.contest}: ${total} judged High/Medium findings`);
console.log(`Detector states the judged root cause: ${count(row => row.detectorRootCause !== '-')}/${total}`);
console.log(`Detector flags the site only (partial): ${count(row => row.detectorPartial !== '-')}/${total}`);
console.log(`At least one lead somewhere in the same function (weak; not detection): ${count(row => row.leadsInSameFunction > 0)}/${total}`);
console.log(bucket('aevasec high priority', open.filter(lead => lead.triage.bounty.pocPriority === 'high')));
console.log(bucket('aevasec high+medium priority', open.filter(lead => PRIORITY[lead.triage.bounty.pocPriority] <= 1)));
console.log(bucket('Slither HIGH impact', open.filter(lead => SEVERITY[lead.severity] <= 1)));
console.log(bucket('Slither HIGH+MEDIUM impact', open.filter(lead => SEVERITY[lead.severity] <= 2)));
console.log(`Judged findings whose functions are all in the review surface: ${count(row => row.inSurface)}/${total} (surface: ${surface.entries.length - readOnly} state-changing + ${readOnly} view/pure entrypoints)`);
if (missingFunctions.length) console.log(`Not in surface: ${missingFunctions.join('; ')}`);
console.log('Surface membership means the code is in the reading queue. It is not evidence that a reviewer would find the issue.');
