#!/usr/bin/env node

import { createHash } from "node:crypto";
import { targetProvenance } from "./util/provenance";
import { validateSlither } from "./validation/input";
import { applyReviews, loadReviews, saveReview, CLASSIFICATIONS } from "./review/reviews";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRecentChanges } from "./changes/gitChanges";
import { normalizeSlitherOutput } from "./ingest/slither/slitherNormalize";
import { compareReports } from "./report/compareReports";
import { writeAiPackets } from "./packets/writeAiPackets";
import { writePocScaffold } from "./poc/writePocScaffold";
import { writeJsonReport } from "./report/writeJsonReport";
import { writeMarkdownReport } from "./report/writeMarkdownReport";
import { buildSurface, isReadOnly } from "./surface/buildSurface";
import { writeSurface } from "./surface/writeSurface";
import { applySuppressions, loadSuppressions } from "./suppressions/suppressions";
import { loadBountyGate } from "./triage/bountyGate";
import { applyBountyTriage } from "./triage/bountyTriage";
import { AevaFinding } from "./types/finding";
import { AevaReport } from "./types/report";
import { ensureDir } from "./util/fs";
import { resolveOutPath, resolveTargetPath } from "./util/paths";

const TOOL_VERSION = "0.1.0";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "review") { await reviewCommand(args); return; }
  if (args[0] === "poc") { await pocCommand(args); return; }
  if (args[0] === "surface") { await surfaceCommand(args); return; }
  const parsed = parseArgs(args);

  if (!parsed) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const inputFile = parsed.inputFile;
  const targetPath = resolveTargetPath(parsed.targetPath);
  const outDir = resolveOutPath(parsed.outDir);

  const inputRaw = await readFile(inputFile, "utf8");
  const slitherOutput: unknown = JSON.parse(inputRaw);
  validateSlither(slitherOutput);
  const provenance = await targetProvenance(targetPath);
  const normalizedFindings = normalizeSlitherOutput(slitherOutput);
  const suppressions = await loadSuppressions(targetPath);
  const bountyGate = await loadBountyGate(targetPath, parsed.bountyPath);
  const recentChanges = parsed.changesFrom ? await loadRecentChanges(targetPath, parsed.changesFrom) : undefined;
  const triaged = await applyBountyTriage(applySuppressions(normalizedFindings, suppressions), bountyGate, {
    targetPath,
    contextLines: parsed.contextLines,
    recentChanges
  });
  const findings = applyReviews(triaged, await loadReviews(targetPath), provenance.gitCommit);
  const errors = slitherOutput.success === false
    ? [{ message: slitherOutput.error || "Slither reported an unsuccessful scan", source: "slither" }]
    : [];

  const deployedCommit = bountyGate.scope?.deployedCommit;
  if (deployedCommit && provenance.gitCommit && !provenance.gitCommit.startsWith(deployedCommit)) {
    errors.push({ message: `Target commit ${provenance.gitCommit} differs from declared deployed commit ${deployedCommit}; confirm each lead exists on the in-scope deployment`, source: "scope" });
  }
  if (recentChanges && !recentChanges.available) errors.push({ message: recentChanges.reason ?? "Recent changes unavailable", source: "git" });

  const report: AevaReport = {
    schemaVersion: "1.0",
    tool: { name: "aevasec", version: TOOL_VERSION },
    generatedAt: new Date().toISOString(),
    target: { path: targetPath, ...provenance },
    engines: [{ name: "slither", inputFile, inputSha256: createHash("sha256").update(inputRaw).digest("hex") }],
    config: {
      source: "slither",
      bounty: {
        minimumPaidSeverity: bountyGate.minimumPaidSeverity,
        excludedImpacts: bountyGate.excludedImpacts,
        dependencyConfigAssumptions: bountyGate.dependencyConfigAssumptions,
        privilegedRoleAssumptions: bountyGate.privilegedRoleAssumptions,
        skipLowInformational: bountyGate.skipLowInformational,
        source: bountyGate.source,
        ...(bountyGate.path ? { path: bountyGate.path } : {}),
        ...(bountyGate.scope ? { scope: bountyGate.scope } : {})
      },
      recentChanges: recentChanges
        ? {
            enabled: true,
            available: recentChanges.available,
            baseRef: recentChanges.baseRef,
            headRef: recentChanges.headRef,
            filesChanged: recentChanges.files.length,
            source: "git"
          }
        : { enabled: false }
    },
    stats: buildStats(findings),
    findings,
    errors
  };

  if (parsed.previousPath) {
    const previous = JSON.parse(await readFile(parsed.previousPath, "utf8")) as AevaReport;
    if (previous.schemaVersion !== "1.0" || !Array.isArray(previous.findings) || !previous.target) throw new Error("Invalid previous report");
    if (previous.target.path !== targetPath) throw new Error("Previous report target differs from current target");
    report.comparison = compareReports(previous, report);
  }

  await ensureDir(outDir);
  await writeJsonReport(outDir, report);
  await writeMarkdownReport(outDir, report);
  await writeAiPackets(outDir, findings, {
    targetPath: report.target.path,
    contextLines: parsed.contextLines
  });
}

async function reviewCommand(args: string[]): Promise<void> {
  const reportPath = args[1];
  const id = args[2];
  const classification = args[3];
  const flags: Record<string, string> = {};
  if (!reportPath || !id || !CLASSIFICATIONS.includes(classification as typeof CLASSIFICATIONS[number])) throw new Error("Usage: review <report.json> <finding-id> <classification> --notes <text> [--poc <reference>]");
  for (let index = 4; index < args.length; index += 2) {
    if (!["--notes", "--poc"].includes(args[index]) || !args[index + 1]) throw new Error("Invalid review arguments");
    flags[args[index]] = args[index + 1];
  }
  if (!flags["--notes"]?.trim()) throw new Error("Review notes are required");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as AevaReport;
  const finding = report.findings.find(item => item.id === id);
  if (!finding || !report.target.path) throw new Error("Finding or target path missing from report");
  const current = await targetProvenance(report.target.path);
  if (report.target.gitCommit && current.gitCommit !== report.target.gitCommit) throw new Error("Target commit differs from report; ingest again before reviewing");
  if (current.dirty) throw new Error("Target has tracked modifications; review a clean target snapshot");
  await saveReview(report.target.path, {
    fingerprint: finding.fingerprint.value, ruleId: finding.ruleId,
    classification: classification as typeof CLASSIFICATIONS[number], notes: flags["--notes"],
    reviewedAt: new Date().toISOString(), targetCommit: report.target.gitCommit,
    ...(flags["--poc"] ? { pocReference: flags["--poc"] } : {})
  });
  console.log(`Saved review for ${id}; ingest again to include it in reports and packets.`);
}

async function surfaceCommand(args: string[]): Promise<void> {
  const reportPath = args[1];
  if (!reportPath || args.length > 2) throw new Error("Usage: surface <report.json>");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as AevaReport;
  if (!report.target?.path || !Array.isArray(report.findings)) throw new Error("Target path or findings missing from report");
  const surface = await buildSurface(report.target.path, report.findings, report.config.bounty?.scope);
  const outDir = path.dirname(path.resolve(reportPath));
  await writeSurface(outDir, surface);
  const readOnly = surface.entries.filter(isReadOnly).length;
  console.log(`Wrote ${path.join(outDir, "surface.md")}: ${surface.entries.length - readOnly} state-changing and ${readOnly} view/pure entrypoints across ${surface.sourceFiles.length} files.`);
}

async function pocCommand(args: string[]): Promise<void> {
  const usage = "Usage: poc <report.json> <finding-id> [--out <file>] [--fork-rpc-env <ENV_VAR>] [--fork-block <number>] [--force]";
  const reportPath = args[1];
  const id = args[2];
  if (!reportPath || !id) throw new Error(usage);
  const options: { outFile?: string; forkRpcEnv?: string; forkBlock?: number; force?: boolean } = {};
  for (let index = 3; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--force") { options.force = true; continue; }
    if (!value) throw new Error(usage);
    if (arg === "--out") options.outFile = value;
    else if (arg === "--fork-rpc-env" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) options.forkRpcEnv = value;
    else if (arg === "--fork-block" && /^\d+$/.test(value)) options.forkBlock = Number(value);
    else throw new Error(usage);
    index += 1;
  }
  if (options.forkBlock !== undefined && !options.forkRpcEnv) throw new Error("--fork-block requires --fork-rpc-env");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as AevaReport;
  const finding = report.findings.find(item => item.id === id);
  if (!finding || !report.target.path) throw new Error("Finding or target path missing from report");
  const current = await targetProvenance(report.target.path);
  if (report.target.gitCommit && current.gitCommit !== report.target.gitCommit) throw new Error("Target commit differs from report; ingest again before scaffolding a PoC");
  const result = await writePocScaffold({
    targetPath: report.target.path, finding, targetCommit: report.target.gitCommit,
    scope: report.config.bounty?.scope, ...options
  });
  console.log(`Wrote PoC scaffold: ${result.file}\nRun: ${result.runCommand}\nIt reverts until the attack and impact assertions are written.`);
}

type ParsedArgs = {
  inputFile: string;
  targetPath?: string;
  outDir?: string;
  contextLines?: number;
  bountyPath?: string;
  changesFrom?: string;
  previousPath?: string;
};

function parseArgs(args: string[]): ParsedArgs | null {
  if (args[0] !== "ingest" || args[1] !== "slither" || !args[2]) {
    return null;
  }

  const parsed: ParsedArgs = {
    inputFile: args[2]
  };

  for (let index = 3; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--target" && value) {
      parsed.targetPath = value;
      index += 1;
    } else if (arg === "--out" && value) {
      parsed.outDir = value;
      index += 1;
    } else if (arg === "--context-lines" && value) {
      const contextLines = Number(value);
      if (!Number.isInteger(contextLines) || contextLines < 0) {
        return null;
      }
      parsed.contextLines = contextLines;
      index += 1;
    } else if (arg === "--bounty" && value) {
      parsed.bountyPath = value;
      index += 1;
    } else if (arg === "--previous" && value) {
      parsed.previousPath = value;
      index += 1;
    } else if (arg === "--changes-from" && value) {
      parsed.changesFrom = value;
      index += 1;
    } else {
      return null;
    }
  }

  return parsed;
}

function buildStats(findings: AevaFinding[]): AevaReport["stats"] {
  const findingsBySeverity: Record<string, number> = {};
  const findingsByRule: Record<string, number> = {};

  for (const finding of findings) {
    findingsBySeverity[finding.severity] = (findingsBySeverity[finding.severity] ?? 0) + 1;
    findingsByRule[finding.ruleId] = (findingsByRule[finding.ruleId] ?? 0) + 1;
  }

  return {
    totalFindings: findings.length,
    openFindings: findings.filter((finding) => finding.status === "OPEN").length,
    suppressedFindings: findings.filter((finding) => finding.status === "SUPPRESSED").length,
    findingsBySeverity,
    findingsByRule
  };
}

function printUsage(): void {
  console.error("Usage: node dist/cli.js ingest slither <slither-json> [--target <target-path>] [--out <out-dir>] [--context-lines <number>] [--bounty <bounty-json>] [--changes-from <git-ref>] [--previous <report.json>]");
  console.error("       node dist/cli.js review <report.json> <finding-id> <classification> --notes <text> [--poc <reference>]");
  console.error("       node dist/cli.js surface <report.json>");
  console.error("       node dist/cli.js poc <report.json> <finding-id> [--out <file>] [--fork-rpc-env <ENV_VAR>] [--fork-block <number>] [--force]");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
