// Measures a saved run against independently judged contest findings.
// Usage: node tests/judgedRecall.js <report.json> <judged-fixture.json> [--worksheet]
// Needs surface.json next to the report (run `node dist/cli.js surface <report.json>` first).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [reportPath, fixturePath, flag] = process.argv.slice(2);
if (!reportPath || !fixturePath) { console.error('Usage: node tests/judgedRecall.js <report.json> <judged-fixture.json> [--worksheet]'); process.exit(1); }
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const judged = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const surface = JSON.parse(fs.readFileSync(path.join(path.dirname(reportPath), 'surface.json'), 'utf8'));
if (report.target.gitCommit) assert.equal(report.target.gitCommit, judged.commit, 'report was not generated from the pinned judged commit');

const open = report.findings.filter(finding => finding.status === 'OPEN');
const PRIORITY = { high: 0, medium: 1, low: 2, skip: 3 };
const SEVERITY = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const byAevasec = [...open].sort((a, b) => PRIORITY[a.triage.bounty.pocPriority] - PRIORITY[b.triage.bounty.pocPriority] || b.triage.bounty.score - a.triage.bounty.score);
const surfaceEntry = (file, name) => surface.entries.find(entry => entry.file === file && entry.function === name);

// Schema 1.0 names functions per file; 1.1 carries the enclosing function range of each linked line.
function locationsOf(item) {
  if (item.locations) return item.locations;
  return item.functions.map(name => {
    const entry = surfaceEntry(item.file, name);
    assert.ok(entry, `${item.id}: ${item.file}:${name} not found`);
    return { file: item.file, function: name, lineStart: entry.lineStart, lineEnd: entry.lineEnd };
  });
}
const leadsIn = location => open.filter(lead => lead.location.file === location.file && lead.location.lineStart >= location.lineStart && lead.location.lineStart <= location.lineEnd);
const describe = lead => `${lead.id} (Slither ${lead.severity}; aevasec ${lead.triage.bounty.pocPriority}, rank ${byAevasec.indexOf(lead) + 1}/${open.length})`;

const rows = [];
const rootCauseLeads = new Set();
for (const item of judged.findings) {
  const locations = locationsOf(item);
  const coLocated = [...new Set(locations.flatMap(leadsIn))];
  if (flag === '--worksheet') {
    console.log(`\n${item.id} ${item.title}\n  at ${locations.map(location => `${location.file}:${location.function}`).join(', ')}`);
    for (const lead of coLocated) console.log(`  - ${lead.id} ${lead.ruleId} [${lead.severity}] ${lead.evidence.description.split('\n')[0].slice(0, 230)}`);
    continue;
  }
  const labelled = labels => (labels || []).map(label => {
    const lead = coLocated.find(candidate => candidate.ruleId === label.ruleId && locations.some(location => location.function === label.function && leadsIn(location).includes(candidate)));
    assert.ok(lead, `${item.id}: labelled ${label.ruleId} lead not found in ${label.function}`);
    return lead;
  });
  const rootCause = labelled(item.detectorRootCause);
  rootCause.forEach(lead => rootCauseLeads.add(lead.id));
  rows.push({
    id: item.id,
    functions: [...new Set(locations.map(location => location.function))].join(',').slice(0, 60),
    inSurface: locations.every(location => Boolean(surfaceEntry(location.file, location.function))),
    anyInSurface: locations.some(location => Boolean(surfaceEntry(location.file, location.function))),
    leadsInSameFunction: coLocated.length,
    detectorRootCause: rootCause.map(describe).join('; ') || '-',
    detectorPartial: labelled(item.detectorPartial).map(describe).join('; ') || '-'
  });
}
if (flag === '--worksheet') process.exit(0);
console.table(rows);

const total = judged.findings.length;
const count = predicate => rows.filter(predicate).length;
const bucket = (label, leads) => `${label}: ${leads.length} leads, ${leads.filter(lead => rootCauseLeads.has(lead.id)).length} state a judged root cause`;
const readOnly = surface.entries.filter(entry => entry.mutability === 'view' || entry.mutability === 'pure').length;
console.log(`${judged.contest}: ${total} judged High/Medium findings, ${open.length} open Slither leads`);
console.log(`Detector states the judged root cause: ${count(row => row.detectorRootCause !== '-')}/${total}`);
console.log(`Detector flags the site only (partial): ${count(row => row.detectorPartial !== '-')}/${total}`);
console.log(`At least one lead somewhere in the same function (weak; not detection): ${count(row => row.leadsInSameFunction > 0)}/${total}`);
console.log(bucket('aevasec high priority', open.filter(lead => lead.triage.bounty.pocPriority === 'high')));
console.log(bucket('aevasec high+medium priority', open.filter(lead => PRIORITY[lead.triage.bounty.pocPriority] <= 1)));
console.log(bucket('Slither HIGH impact', open.filter(lead => SEVERITY[lead.severity] <= 1)));
console.log(bucket('Slither HIGH+MEDIUM impact', open.filter(lead => SEVERITY[lead.severity] <= 2)));
console.log(`Judged findings with every linked function in the review surface: ${count(row => row.inSurface)}/${total}; with at least one: ${count(row => row.anyInSurface)}/${total} (surface: ${surface.entries.length - readOnly} state-changing + ${readOnly} view/pure external/public functions; internal and library functions are not listed)`);
console.log('Surface membership means the code is in the reading queue. It is not evidence that a reviewer would find the issue.');
