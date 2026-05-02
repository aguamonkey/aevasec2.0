#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { normalizeSlitherOutput } from "./ingest/slither/slitherNormalize";
import { SlitherOutput } from "./ingest/slither/slitherTypes";
import { writeAiPackets } from "./packets/writeAiPackets";
import { writeJsonReport } from "./report/writeJsonReport";
import { writeMarkdownReport } from "./report/writeMarkdownReport";
import { applySuppressions, loadSuppressions } from "./suppressions/suppressions";
import { AevaFinding } from "./types/finding";
import { AevaReport } from "./types/report";
import { ensureDir } from "./util/fs";
import { resolveOutPath, resolveTargetPath } from "./util/paths";

const TOOL_VERSION = "0.1.0";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const inputFile = parsed.inputFile;
  const targetPath = resolveTargetPath(parsed.targetPath);
  const outDir = resolveOutPath(parsed.outDir);

  const slitherOutput = JSON.parse(await readFile(inputFile, "utf8")) as SlitherOutput;
  const normalizedFindings = normalizeSlitherOutput(slitherOutput);
  const suppressions = await loadSuppressions(targetPath);
  const findings = applySuppressions(normalizedFindings, suppressions);
  const errors = slitherOutput.success === false && slitherOutput.error
    ? [{ message: slitherOutput.error, source: "slither" }]
    : [];

  const report: AevaReport = {
    schemaVersion: "1.0",
    tool: { name: "aevasec", version: TOOL_VERSION },
    target: { path: targetPath },
    engines: [{ name: "slither", inputFile }],
    config: { source: "slither" },
    stats: buildStats(findings),
    findings,
    errors
  };

  await ensureDir(outDir);
  await writeJsonReport(outDir, report);
  await writeMarkdownReport(outDir, report);
  await writeAiPackets(outDir, findings, {
    targetPath: report.target.path,
    contextLines: parsed.contextLines
  });
}

type ParsedArgs = {
  inputFile: string;
  targetPath?: string;
  outDir?: string;
  contextLines?: number;
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
  console.error("Usage: node dist/cli.js ingest slither <slither-json> [--target <target-path>] [--out <out-dir>] [--context-lines <number>]");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
