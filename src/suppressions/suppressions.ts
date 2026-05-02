import { access } from "node:fs/promises";
import path from "node:path";
import { AevaFinding } from "../types/finding";
import { readJsonFile } from "../util/fs";

export type SuppressionFile = {
  schemaVersion: "1.0";
  items: SuppressionItem[];
};

export type SuppressionItem = {
  fingerprint: string;
  ruleId: string;
  reason: string;
  createdAt?: string;
  expiresAt?: string | null;
};

export async function loadSuppressions(targetPath: string): Promise<SuppressionItem[]> {
  const suppressionPath = path.join(targetPath, ".aevasec", "suppressions.json");

  try {
    await access(suppressionPath);
  } catch {
    return [];
  }

  const suppressionFile = await readJsonFile<SuppressionFile>(suppressionPath);
  return suppressionFile.items ?? [];
}

export function applySuppressions(findings: AevaFinding[], suppressions: SuppressionItem[]): AevaFinding[] {
  const activeSuppressions = new Map<string, SuppressionItem>();

  for (const suppression of suppressions) {
    if (!isExpired(suppression)) {
      activeSuppressions.set(buildSuppressionKey(suppression.ruleId, suppression.fingerprint), suppression);
    }
  }

  return findings.map((finding) => {
    const suppression = activeSuppressions.get(buildSuppressionKey(finding.ruleId, finding.fingerprint.value));

    if (!suppression) {
      return finding;
    }

    return {
      ...finding,
      status: "SUPPRESSED",
      suppression: {
        reason: suppression.reason,
        createdAt: suppression.createdAt,
        expiresAt: suppression.expiresAt
      }
    };
  });
}

function buildSuppressionKey(ruleId: string, fingerprint: string): string {
  return `${ruleId}:${fingerprint}`;
}

function isExpired(suppression: SuppressionItem): boolean {
  if (!suppression.expiresAt) {
    return false;
  }

  return Date.parse(suppression.expiresAt) <= Date.now();
}
