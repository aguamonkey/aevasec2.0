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
    "1. Is this finding exploitable in this codebase?",
    "2. What are the exact attacker preconditions?",
    "3. What state change, loss, accounting error, stuck-fund condition, or DoS would prove impact?",
    "4. What existing guards may invalidate this?",
    "5. Suggest the smallest Foundry PoC structure if this survives review.",
    "",
    "Do not claim vulnerability unless there is a concrete attacker path.",
    "Separate facts from assumptions.",
    "List reasons this may be a false positive.",
    ""
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
