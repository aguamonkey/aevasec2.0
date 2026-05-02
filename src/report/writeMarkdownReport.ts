import path from "node:path";
import { AevaConfidence, AevaFinding, AevaSeverity } from "../types/finding";
import { AevaReport } from "../types/report";
import { writeTextFile } from "../util/fs";

const SEVERITY_ORDER: Record<AevaSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4
};

const CONFIDENCE_ORDER: Record<AevaConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  UNKNOWN: 3
};

export async function writeMarkdownReport(outDir: string, report: AevaReport): Promise<void> {
  await writeTextFile(path.join(outDir, "report.md"), renderMarkdownReport(report));
}

function renderMarkdownReport(report: AevaReport): string {
  const openFindings = report.findings.filter((finding) => finding.status === "OPEN");
  const suppressedFindings = report.findings.filter((finding) => finding.status === "SUPPRESSED");
  const suggestedReviewOrder = [...openFindings].sort(compareFindings);

  return [
    "# aevasec report",
    "",
    "## Summary",
    "",
    `- Total findings: ${report.stats.totalFindings}`,
    `- Open findings: ${report.stats.openFindings}`,
    `- Suppressed findings: ${report.stats.suppressedFindings}`,
    "",
    "## Findings by severity",
    "",
    renderRecord(report.stats.findingsBySeverity),
    "",
    "## Findings by rule",
    "",
    renderRecord(report.stats.findingsByRule),
    "",
    "## Suggested review order",
    "",
    renderFindingList(suggestedReviewOrder),
    "",
    "## Open findings",
    "",
    renderDetailedOpenFindings(openFindings),
    "",
    "## Suppressed findings",
    "",
    renderSuppressedFindings(suppressedFindings),
    ""
  ].join("\n");
}

function compareFindings(left: AevaFinding, right: AevaFinding): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence] ||
    left.id.localeCompare(right.id)
  );
}

function renderRecord(record: Record<string, number>): string {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return "- None";
  }

  return entries.map(([key, value]) => `- ${key}: ${value}`).join("\n");
}

function renderFindingList(findings: AevaFinding[]): string {
  if (findings.length === 0) {
    return "- None";
  }

  return findings
    .map((finding) => `- ${finding.id}: ${finding.ruleId} (${finding.severity}, ${finding.confidence}) at ${formatLocation(finding)}`)
    .join("\n");
}

function renderDetailedOpenFindings(findings: AevaFinding[]): string {
  if (findings.length === 0) {
    return "None";
  }

  return findings
    .map((finding) =>
      [
        `### ${finding.id}`,
        "",
        `- ID: ${finding.id}`,
        `- Rule: ${finding.ruleId}`,
        `- Class: ${finding.aevasecClass ?? "UNCLASSIFIED"}`,
        `- Severity: ${finding.severity}`,
        `- Confidence: ${finding.confidence}`,
        `- Location: ${formatLocation(finding)}`,
        `- Fingerprint: ${finding.fingerprint.value}`,
        `- Description: ${finding.evidence.description}`
      ].join("\n")
    )
    .join("\n\n");
}

function renderSuppressedFindings(findings: AevaFinding[]): string {
  if (findings.length === 0) {
    return "None";
  }

  return findings
    .map((finding) =>
      [
        `### ${finding.id}`,
        "",
        `- ID: ${finding.id}`,
        `- Rule: ${finding.ruleId}`,
        `- Location: ${formatLocation(finding)}`,
        `- Reason: ${finding.suppression?.reason ?? "Unknown"}`
      ].join("\n")
    )
    .join("\n\n");
}

function formatLocation(finding: AevaFinding): string {
  const linePart =
    finding.location.lineStart === undefined
      ? ""
      : finding.location.lineEnd !== undefined && finding.location.lineEnd !== finding.location.lineStart
        ? `:${finding.location.lineStart}-${finding.location.lineEnd}`
        : `:${finding.location.lineStart}`;

  return `${finding.location.file}${linePart}`;
}
