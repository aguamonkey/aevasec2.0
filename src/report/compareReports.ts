import { AevaReport } from "../types/report";

// Exact fingerprints deliberately avoid transferring reviews across changed evidence.
export function compareReports(previous: AevaReport, current: AevaReport) {
  const key = (finding: AevaReport["findings"][number]) => `${finding.ruleId}:${finding.fingerprint.value}`;
  const before = new Set(previous.findings.map(key));
  const after = new Set(current.findings.map(key));
  return {
    previousCommit: previous.target.gitCommit,
    added: current.findings.filter(finding => !before.has(key(finding))).map(finding => finding.id),
    absent: previous.findings.filter(finding => !after.has(key(finding))).map(finding => finding.id),
    unchanged: current.findings.filter(finding => before.has(key(finding))).map(finding => finding.id),
    note: "Exact fingerprint comparison. Line shifts or changed detector descriptions can appear as added/absent; absence does not prove remediation."
  };
}
