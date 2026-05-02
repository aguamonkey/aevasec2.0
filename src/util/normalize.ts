export function normalizeFingerprintPart(part: string | number | undefined | null): string {
  return String(part ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
