import { readFile } from "node:fs/promises";
import path from "node:path";
import { AevaFinding, TriageClassification } from "../types/finding";
import { writeJsonFile } from "../util/fs";
import { isObject } from "../validation/input";

export const CLASSIFICATIONS: TriageClassification[] = ["REAL_INTERESTING", "FALSE_POSITIVE", "KNOWN_PATTERN", "NEEDS_CONTEXT", "OUT_OF_SCOPE"];
export type ReviewDecision = {
  fingerprint: string;
  ruleId: string;
  classification: TriageClassification;
  notes: string;
  reviewedAt: string;
  targetCommit?: string;
  pocReference?: string;
};

export async function loadReviews(targetPath: string): Promise<ReviewDecision[]> {
  let raw: string;
  try { raw = await readFile(path.join(targetPath, ".aevasec", "reviews.json"), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const file: unknown = JSON.parse(raw);
  if (!isObject(file) || file.schemaVersion !== "1.0" || !Array.isArray(file.items)) throw new Error("Invalid reviews file");
  for (const item of file.items) {
    if (!isObject(item) || typeof item.fingerprint !== "string" || typeof item.ruleId !== "string" ||
        !CLASSIFICATIONS.includes(item.classification as TriageClassification) || typeof item.notes !== "string" || !item.notes.trim() ||
        typeof item.reviewedAt !== "string" || !Number.isFinite(Date.parse(item.reviewedAt)) ||
        (item.targetCommit !== undefined && typeof item.targetCommit !== "string") ||
        (item.pocReference !== undefined && typeof item.pocReference !== "string")) throw new Error("Invalid review decision");
  }
  return file.items as ReviewDecision[];
}

export async function saveReview(targetPath: string, decision: ReviewDecision): Promise<void> {
  const existing = await loadReviews(targetPath);
  const items = existing.filter(item => item.ruleId !== decision.ruleId || item.fingerprint !== decision.fingerprint);
  await writeJsonFile(path.join(targetPath, ".aevasec", "reviews.json"), { schemaVersion: "1.0", items: [...items, decision] });
}

export function applyReviews(findings: AevaFinding[], decisions: ReviewDecision[], targetCommit?: string): AevaFinding[] {
  return findings.map(finding => {
    const decision = decisions.find(item => item.ruleId === finding.ruleId && item.fingerprint === finding.fingerprint.value &&
      (item.targetCommit ? item.targetCommit === targetCommit : true));
    if (!decision) return finding;
    return { ...finding, triage: { ...finding.triage, classification: decision.classification, notes: decision.notes, review: decision } };
  });
}
