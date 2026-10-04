import { readdir, unlink } from "node:fs/promises";
import { ensureDir } from "../util/fs";
import path from "node:path";
import { readSourceWindow } from "../source/readSourceWindow";
import { AevaFinding } from "../types/finding";
import { writeTextFile } from "../util/fs";

export type WriteAiPacketsOptions = {
  targetPath?: string;
  contextLines?: number;
};

export async function writeAiPackets(outDir: string, findings: AevaFinding[], options: WriteAiPacketsOptions = {}): Promise<void> {
  const openFindings = findings.filter((finding) => finding.status === "OPEN");

  const packetDir = path.join(outDir, "packets");
  await ensureDir(packetDir);
  const expected = new Set(openFindings.map(finding => `${finding.id}.md`));
  for (const name of await readdir(packetDir)) {
    if (/^slither-\d+\.md$/.test(name) && !expected.has(name)) await unlink(path.join(packetDir, name));
  }

  await Promise.all(
    openFindings.map(async (finding) => {
      const sourceWindow = options.targetPath
        ? await readSourceWindow({
            targetPath: options.targetPath,
            relativeFile: finding.location.file,
            lineStart: finding.location.lineStart,
            lineEnd: finding.location.lineEnd,
            contextLines: options.contextLines
          })
        : { available: false, reason: "target path is missing" };

      await writeTextFile(path.join(outDir, "packets", `${finding.id}.md`), renderPacket(finding, renderSourceContext(sourceWindow)));
    })
  );
}

function renderPacket(finding: AevaFinding, sourceContext: string): string {
  return [
    "# AI Review Packet",
    "",
    "## Finding",
    "",
    `Rule: ${finding.ruleId}`,
    `Class: ${finding.aevasecClass ?? "UNCLASSIFIED"}`,
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    `Location: ${formatLocation(finding)}`,
    `Fingerprint: ${finding.fingerprint.value}`,
    "",
    "## Recent-change context",
    "",
    renderRecentChangeTriage(finding),
    "",
    "## Bounty-aware triage",
    "",
    renderBountyTriage(finding),
    "",
    "## Saved review",
    "",
    finding.triage?.review ? `${finding.triage.review.classification}: ${finding.triage.review.notes}\nPoC: ${finding.triage.review.pocReference ?? "none"}` : "Not reviewed",
    "",
    "## Description",
    "",
    finding.evidence.description,
    "",
    "## Primary evidence",
    "",
    finding.evidence.description,
    "",
    "## Source context",
    "",
    sourceContext,
    "",
    "## Questions",
    "",
    "1. What is the flagged pattern, and does local code preserve the risky condition?",
    "2. Was this introduced in, touched by, or near the recent git diff?",
    "3. Did the recent diff add an entrypoint, remove a guard, add an external call, change accounting, or change dependency/oracle configuration?",
    "4. Is the external path unprivileged, approved-user, trusted-role, owner/governance/deployer, dependency/config-only, or out of scope?",
    "5. What privilege, deployment, dependency, oracle, or config assumption is required?",
    "6. What concrete user/protocol asset or state is affected?",
    "7. Does the impact map to a paid bounty severity under the gate?",
    "8. Should this be bounty-actionable: yes, no, or unclear?",
    "9. What is the smallest next PoC if this is not skip?",
    "",
    "Do not claim vulnerability unless there is a concrete attacker path.",
    "Do not treat Slither severity as exploitability.",
    "Do not classify as bounty-actionable unless attacker path and impact match the bounty threshold.",
    "Separate facts from assumptions.",
    "List reasons this may be a false positive.",
    ""
  ].join("\n");
}

function renderRecentChangeTriage(finding: AevaFinding): string {
  const recentChange = finding.triage?.recentChange;
  if (!recentChange) {
    return [
      "- Status: unavailable",
      "- Summary: recent-change layer was not enabled for this ingest",
      "- Risk patterns: none"
    ].join("\n");
  }

  const ranges =
    recentChange.changedRanges.length === 0
      ? "none"
      : recentChange.changedRanges.map((range) => `${range.file}:${range.lineStart}-${range.lineEnd}`).join(", ");

  return [
    `- Status: ${recentChange.status}`,
    `- Base/head: ${recentChange.baseRef ?? "unknown"}..${recentChange.headRef ?? "HEAD"}`,
    `- Summary: ${recentChange.summary}`,
    `- Changed ranges: ${ranges}`,
    `- Risk patterns: ${recentChange.riskPatterns.length > 0 ? recentChange.riskPatterns.join(", ") : "none"}`,
    `- Score boost: ${recentChange.scoreBoost}`
  ].join("\n");
}

function renderBountyTriage(finding: AevaFinding): string {
  const bounty = finding.triage?.bounty;
  if (!bounty) {
    return [
      "- Flagged pattern: unavailable",
      "- External reachability: unclear",
      "- Privilege assumptions: unclear",
      "- Affected asset/state: unclear",
      "- Bounty-actionability: unclear",
      "- Likely severity under bounty rules: UNCLEAR",
      "- PoC priority: low",
      "- Smallest next PoC: first map reachability and paid impact"
    ].join("\n");
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

function renderSourceContext(sourceWindow: { available: boolean; reason?: string; content?: string }): string {
  if (!sourceWindow.available || !sourceWindow.content) {
    return `Source context unavailable: ${sourceWindow.reason ?? "unknown reason"}`;
  }

  return ["```solidity", sourceWindow.content, "```"].join("\n");
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
