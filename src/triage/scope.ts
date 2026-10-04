export type BountyScope = {
  inScopePaths?: string[];
  outOfScopePaths?: string[];
  deployedCommit?: string;
  contracts?: Array<{ name: string; address?: string; chain?: string }>;
  knownIssues?: string[];
};

export type ScopeStatus = "in scope" | "out of scope" | "undeclared";

// Patterns are target-relative. `*` matches within a path component, `**` across
// components; a pattern without wildcards also matches everything beneath it.
export function matchesScopePattern(file: string, pattern: string): boolean {
  const normalizedFile = normalizePath(file);
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern.includes("*")) {
    return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
  }
  const source = normalizedPattern
    .split("**")
    .map((part) => part.split("*").map(escapeRegExp).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`).test(normalizedFile);
}

export function classifyScope(file: string, scope?: BountyScope): ScopeStatus {
  if (!scope) return "undeclared";
  if (scope.outOfScopePaths?.some((pattern) => matchesScopePattern(file, pattern))) return "out of scope";
  if (!scope.inScopePaths || scope.inScopePaths.length === 0) return "undeclared";
  return scope.inScopePaths.some((pattern) => matchesScopePattern(file, pattern)) ? "in scope" : "out of scope";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
