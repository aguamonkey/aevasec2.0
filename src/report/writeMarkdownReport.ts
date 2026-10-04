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

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
  skip: 3
} as const;

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
    `- Target commit: ${report.target.gitCommit ?? "unavailable"}; tracked changes: ${report.target.dirty ?? "unknown"}`,
    `- Scan input SHA-256: ${report.engines[0]?.inputSha256 ?? "unavailable"}`,
    `- Total findings: ${report.stats.totalFindings}`,
    `- Open findings: ${report.stats.openFindings}`,
    `- Suppressed findings: ${report.stats.suppressedFindings}`,
    `- Bounty gate: minimum paid severity ${report.config.bounty?.minimumPaidSeverity ?? "MEDIUM"} (${report.config.bounty?.source ?? "default"})`,
    `- Bounty skip Low/Informational: ${report.config.bounty?.skipLowInformational ?? true}`,
    ...renderScope(report),
    `- Recent changes: ${report.config.recentChanges?.enabled ? `${report.config.recentChanges.baseRef ?? "unknown"}..${report.config.recentChanges.headRef ?? "HEAD"} (${report.config.recentChanges.filesChanged ?? 0} Solidity files changed)` : "disabled"}`,
    "",
    "## Run comparison",
    "",
    report.comparison ? `Added: ${report.comparison.added.length}; absent: ${report.comparison.absent.length}; unchanged: ${report.comparison.unchanged.length}. ${report.comparison.note}` : "No previous report supplied.",
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

function renderScope(report: AevaReport): string[] {
  const scope = report.config.bounty?.scope;
  if (!scope) return ["- Bounty scope: not declared; every path is treated as potentially in scope"];
  const outside = report.findings.filter((finding) => finding.triage?.bounty?.externalReachability.includes("outside declared bounty scope")).length;
  return [
    `- Bounty scope: in ${scope.inScopePaths?.join(", ") || "undeclared"}; out ${scope.outOfScopePaths?.join(", ") || "none"}; ${outside} open leads outside declared scope`,
    `- Deployed commit: ${scope.deployedCommit ?? "undeclared"}${scope.deployedCommit && report.target.gitCommit ? (report.target.gitCommit.startsWith(scope.deployedCommit) ? " (matches target)" : " (DIFFERS from target; leads may not exist on the deployment)") : ""}`,
    `- In-scope deployments: ${scope.contracts?.map((item) => `${item.name}${item.address ? ` ${item.address}` : ""}${item.chain ? ` (${item.chain})` : ""}`).join(", ") || "undeclared"}`,
    `- Known issues to de-duplicate against: ${scope.knownIssues?.join("; ") || "none listed"}`
  ];
}

function compareFindings(left: AevaFinding, right: AevaFinding): number {
  const leftBounty = left.triage?.bounty;
  const rightBounty = right.triage?.bounty;

  if (leftBounty && rightBounty) {
    return (
      PRIORITY_ORDER[leftBounty.pocPriority] - PRIORITY_ORDER[rightBounty.pocPriority] ||
      rightBounty.score - leftBounty.score ||
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence] ||
      left.id.localeCompare(right.id)
    );
  }

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
    .map((finding) => {
      const bounty = finding.triage?.bounty;
      const bountyPart = bounty
        ? ` | PoC ${bounty.pocPriority}, bounty-actionable ${bounty.bountyActionability}, likely ${bounty.likelySeverity}, score ${bounty.score}`
        : "";
      const changePart = finding.triage?.recentChange ? ` | change ${finding.triage.recentChange.status}` : "";
      return `- ${finding.id}: ${finding.ruleId} (${finding.severity}, ${finding.confidence})${bountyPart}${changePart} at ${formatLocation(finding)}`;
    })
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
        `- Saved review: ${finding.triage?.review ? `${finding.triage.review.classification}: ${finding.triage.review.notes}` : "not reviewed"}`,
        `- PoC reference: ${finding.triage?.review?.pocReference ?? "none"}`,
        `- Description: ${finding.evidence.description}`,
        renderRecentChangeTriage(finding),
        renderBountyTriage(finding)
      ].join("\n")
    )
    .join("\n\n");
}

function renderRecentChangeTriage(finding: AevaFinding): string {
  const recentChange = finding.triage?.recentChange;
  if (!recentChange) {
    return "- Recent-change context: unavailable";
  }

  const ranges =
    recentChange.changedRanges.length === 0
      ? "none"
      : recentChange.changedRanges.map((range) => `${range.file}:${range.lineStart}-${range.lineEnd}`).join(", ");

  return [
    `- Recent-change status: ${recentChange.status}`,
    `- Recent-change summary: ${recentChange.summary}`,
    `- Recent-change ranges: ${ranges}`,
    `- Recent-change risk patterns: ${recentChange.riskPatterns.length > 0 ? recentChange.riskPatterns.join(", ") : "none"}`
  ].join("\n");
}

function renderBountyTriage(finding: AevaFinding): string {
  const bounty = finding.triage?.bounty;
  if (!bounty) {
    return "- Bounty triage: unavailable";
  }

  return [
    "- Assessment: heuristic; actionability requires manual validation",
    `- Evidence: ${bounty.evidence.join("; ")}`,
    `- Limitations: ${bounty.limitations.join(" ")}`,
    `- Flagged pattern: ${bounty.flaggedPattern}`,
    `- External reachability: ${bounty.externalReachability.join(", ")}`,
    `- Privilege assumptions: ${bounty.privilegeAssumptions.join("; ")}`,
    `- Affected asset/state: ${bounty.affectedAssetState}`,
    `- Impact mapper: ${bounty.impact.join(", ")}`,
    `- Bounty-actionability: ${bounty.bountyActionability}`,
    `- Likely severity under bounty rules: ${bounty.likelySeverity}`,
    `- PoC priority: ${bounty.pocPriority} (score ${bounty.score})`,
    `- Smallest next PoC: ${bounty.smallestNextPoc}`
  ].join("\n");
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
