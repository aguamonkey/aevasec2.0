import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AevaFinding, RecentChangeStatus } from "../types/finding";

const execFileAsync = promisify(execFile);

export type ChangedRange = {
  file: string;
  lineStart: number;
  lineEnd: number;
  addedLines: string[];
  removedLines: string[];
};

export type ChangedFile = {
  file: string;
  ranges: ChangedRange[];
  riskPatterns: string[];
};

export type RecentChanges = {
  available: boolean;
  baseRef?: string;
  headRef?: string;
  files: ChangedFile[];
  reason?: string;
};

export async function loadRecentChanges(targetPath: string, baseRef?: string): Promise<RecentChanges> {
  if (!baseRef) {
    return { available: false, files: [], reason: "changes-from ref is missing" };
  }

  try {
    const { stdout: head } = await execFileAsync("git", ["-C", targetPath, "rev-parse", "--verify", "HEAD"]);
    const { stdout: base } = await execFileAsync("git", ["-C", targetPath, "rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`]);
    const { stdout } = await execFileAsync(
      "git",
      ["-C", targetPath, "diff", "--unified=0", "--no-ext-diff", `${base.trim()}..${head.trim()}`, "--", "*.sol"],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return {
      available: true,
      baseRef: base.trim(),
      headRef: head.trim(),
      files: parseGitDiff(stdout)
    };
  } catch (error) {
    return {
      available: false,
      baseRef,
      files: [],
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function parseGitDiff(diff: string): ChangedFile[] {
  const files = new Map<string, ChangedFile>();
  const lines = diff.split(/\r?\n/);
  let currentFile: string | undefined;
  let currentRange: ChangedRange | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      currentFile = undefined;
      currentRange = undefined;
      continue;
    }

    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      if (!currentFile.endsWith(".sol")) {
        currentFile = undefined;
        continue;
      }
      if (!files.has(currentFile)) {
        files.set(currentFile, { file: currentFile, ranges: [], riskPatterns: [] });
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      const lineStart = Number(hunk[3]);
      const count = Number(hunk[4] ?? "1");
      currentRange = {
        file: currentFile,
        lineStart,
        lineEnd: count === 0 ? lineStart : lineStart + count - 1,
        addedLines: [],
        removedLines: []
      };
      files.get(currentFile)?.ranges.push(currentRange);
      continue;
    }

    if (!currentRange) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentRange.addedLines.push(line.slice(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentRange.removedLines.push(line.slice(1));
    }
  }

  for (const file of files.values()) {
    file.riskPatterns = [...new Set(file.ranges.flatMap((range) => classifyRiskPatterns(range)))];
  }

  return [...files.values()];
}

export function classifyRecentChangeForFinding(
  finding: AevaFinding,
  recentChanges: RecentChanges,
  options: { nearLines?: number } = {}
): NonNullable<AevaFinding["triage"]>["recentChange"] {
  const nearLines = options.nearLines ?? 20;

  if (!recentChanges.available) {
    return {
      status: "unavailable",
      baseRef: recentChanges.baseRef,
      headRef: recentChanges.headRef,
      filesChanged: 0,
      changedRanges: [],
      riskPatterns: [],
      summary: recentChanges.reason ?? "recent-change context unavailable",
      scoreBoost: 0
    };
  }

  const changedFile = recentChanges.files.find((file) => file.file === finding.location.file);
  if (!changedFile) {
    return buildRecentChangeTriage("pre-existing", finding, recentChanges, [], [], 0);
  }

  const findingStart = finding.location.lineStart ?? 1;
  const findingEnd = finding.location.lineEnd ?? findingStart;
  const overlapping = changedFile.ranges.filter((range) => rangesOverlap(findingStart, findingEnd, range.lineStart, range.lineEnd));
  const nearby = changedFile.ranges.filter((range) =>
    rangesOverlap(findingStart - nearLines, findingEnd + nearLines, range.lineStart, range.lineEnd)
  );

  if (overlapping.length > 0) {
    return buildRecentChangeTriage("overlaps recent diff", finding, recentChanges, overlapping, changedFile.riskPatterns, 25);
  }

  if (nearby.length > 0) {
    return buildRecentChangeTriage("near recent diff", finding, recentChanges, nearby, changedFile.riskPatterns, 10);
  }

  return buildRecentChangeTriage("touched by recent diff", finding, recentChanges, changedFile.ranges, changedFile.riskPatterns, 5);
}

function buildRecentChangeTriage(
  status: RecentChangeStatus,
  finding: AevaFinding,
  recentChanges: RecentChanges,
  ranges: ChangedRange[],
  riskPatterns: string[],
  scoreBoost: number
): NonNullable<AevaFinding["triage"]>["recentChange"] {
  const relevantRanges = ranges.map((range) => ({
    file: range.file,
    lineStart: range.lineStart,
    lineEnd: range.lineEnd
  }));
  const summary =
    status === "pre-existing"
      ? "finding file was not changed in the selected git diff"
      : `${status} for ${finding.location.file}${riskPatterns.length > 0 ? `; risky changes: ${riskPatterns.join(", ")}` : ""}`;

  return {
    status,
    baseRef: recentChanges.baseRef,
    headRef: recentChanges.headRef,
    filesChanged: recentChanges.files.length,
    changedRanges: relevantRanges,
    riskPatterns,
    summary,
    scoreBoost: scoreBoost + Math.min(15, riskPatterns.length * 5)
  };
}

function classifyRiskPatterns(range: ChangedRange): string[] {
  const added = normalize(range.addedLines.join("\n"));
  const removed = normalize(range.removedLines.join("\n"));
  const all = `${added}\n${removed}`;
  const patterns: string[] = [];

  if (/\bfunction\b.*\b(public|external)\b/.test(added)) {
    patterns.push("new public/external entrypoint");
  }
  if (/\b(onlyowner|onlyadmin|onlykeeper|onlybroker|nonreentrant|whitelist|allowlist|approved)\b/.test(removed)) {
    patterns.push("guard/modifier removed or changed");
  }
  if (/(\.call\b|delegatecall|callcode|staticcall|transferfrom|safetransferfrom|callback)/.test(added)) {
    patterns.push("new external call or token transfer");
  }
  if (/\b(balances?|shares?|debts?|supply|collateral|positions?|sequence|nonce|accounting)\b/.test(all)) {
    patterns.push("accounting or state mutation changed");
  }
  if (/\b(weth|oracle|price\w*|twap|token|feed\w*|aggregator)\b/.test(all)) {
    patterns.push("dependency/oracle/token configuration changed");
  }
  if (/\b(liquidat|solvenc|margin|health|bad debt)\b/.test(all)) {
    patterns.push("liquidation/solvency logic changed");
  }
  if (/\b(upgrade|implementation|delegatecall|storage gap|initializer|reinitializer)\b/.test(all)) {
    patterns.push("upgradeability/storage-sensitive change");
  }

  return patterns;
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}
