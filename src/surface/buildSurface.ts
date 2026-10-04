import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { BountyScope, classifyScope } from "../triage/scope";
import { AevaFinding } from "../types/finding";

export type SurfaceEntry = {
  file: string;
  contract: string;
  function: string;
  lineStart: number;
  lineEnd: number;
  visibility: "external" | "public";
  mutability: "payable" | "nonpayable" | "view" | "pure";
  modifiers: string[];
  leadIds: string[];
};

export type Surface = {
  buildInfoFiles: string[];
  sourceFiles: string[];
  entries: SurfaceEntry[];
  unattachedLeadIds: string[];
  limitations: string[];
};

type AstNode = { nodeType?: string; nodes?: AstNode[]; [key: string]: unknown };

const LIMITATIONS = [
  "Lists external/public functions defined in in-scope files. Inherited entrypoints defined in out-of-scope files (for example library ERC-721 transfers) are not listed.",
  "Modifiers are names only. A listed modifier is not proof of access control, and an unlisted check may exist inline.",
  "Detector leads are attached by line range as reading hints. A function with no leads is not safer than one with leads.",
  "This is a queue of code to read. It does not detect, rank, or rule out vulnerabilities."
];

// Builds the externally callable surface from solc ASTs in Foundry build-info,
// which Slither's own compile step leaves in <target>/<out>/build-info.
export async function buildSurface(targetPath: string, findings: AevaFinding[], scope?: BountyScope): Promise<Surface> {
  const foundryToml = await readOptional(path.join(targetPath, "foundry.toml"));
  const outDir = /^\s*out\s*=\s*['"]([^'"]+)['"]/m.exec(foundryToml ?? "")?.[1] ?? "out";
  const buildInfoDir = path.join(targetPath, outDir, "build-info");
  let names: string[];
  try { names = (await readdir(buildInfoDir)).filter((name) => name.endsWith(".json")); }
  catch { throw new Error(`No build-info at ${buildInfoDir}; run "forge build --build-info" or Slither in the target first`); }
  if (names.length === 0) throw new Error(`No build-info JSON in ${buildInfoDir}`);

  // Oldest first, so the newest compilation of a source wins.
  const files = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(path.join(buildInfoDir, name))).mtimeMs })));
  files.sort((left, right) => left.mtime - right.mtime);

  const bySource = new Map<string, SurfaceEntry[]>();
  for (const { name } of files) {
    const info = JSON.parse(await readFile(path.join(buildInfoDir, name), "utf8")) as {
      input?: { sources?: Record<string, { content?: string }> };
      output?: { sources?: Record<string, { ast?: AstNode }> };
    };
    for (const [sourcePath, source] of Object.entries(info.output?.sources ?? {})) {
      const file = sourcePath.replace(/\\/g, "/");
      if (!source.ast || path.isAbsolute(file) || !isReviewable(file, scope)) continue;
      const content = info.input?.sources?.[sourcePath]?.content ?? await readOptional(path.join(targetPath, file));
      if (content === undefined) continue;
      bySource.set(file, extractEntries(file, source.ast, content));
    }
  }

  const entries = [...bySource.values()].flat();
  const attached = new Set<string>();
  for (const finding of findings) {
    if (finding.status !== "OPEN" || finding.location.lineStart === undefined) continue;
    const line = finding.location.lineStart;
    const entry = entries.find((item) => item.file === finding.location.file && line >= item.lineStart && line <= item.lineEnd);
    if (entry) { entry.leadIds.push(finding.id); attached.add(finding.id); }
  }
  entries.sort((left, right) =>
    Number(isReadOnly(left)) - Number(isReadOnly(right)) || left.file.localeCompare(right.file) || left.lineStart - right.lineStart);

  return {
    buildInfoFiles: files.map((file) => file.name),
    sourceFiles: [...new Set(entries.map((entry) => entry.file))].sort(),
    entries,
    unattachedLeadIds: findings.filter((finding) => finding.status === "OPEN" && !attached.has(finding.id)).map((finding) => finding.id),
    limitations: LIMITATIONS
  };
}

export function isReadOnly(entry: SurfaceEntry): boolean {
  return entry.mutability === "view" || entry.mutability === "pure";
}

function isReviewable(file: string, scope?: BountyScope): boolean {
  const status = classifyScope(file, scope);
  if (status !== "undeclared") return status === "in scope";
  // No declared scope: drop dependency, test and script trees by path component.
  return !/(^|\/)(lib|node_modules|tests?|scripts?|mocks?)(\/|$)/i.test(file) && !/\.(t|s)\.sol$/.test(file);
}

function extractEntries(file: string, ast: AstNode, content: string): SurfaceEntry[] {
  const bytes = Buffer.from(content, "utf8");
  const lineAt = (offset: number): number => {
    let line = 1;
    for (let index = 0; index < offset && index < bytes.length; index += 1) if (bytes[index] === 10) line += 1;
    return line;
  };
  const entries: SurfaceEntry[] = [];
  for (const contract of ast.nodes ?? []) {
    if (contract.nodeType !== "ContractDefinition" || contract.contractKind !== "contract") continue;
    for (const node of contract.nodes ?? []) {
      if (node.nodeType !== "FunctionDefinition" || node.implemented !== true || node.kind === "constructor") continue;
      if (node.visibility !== "external" && node.visibility !== "public") continue;
      const [start, length] = String(node.src).split(":").map(Number);
      entries.push({
        file,
        contract: String(contract.name),
        function: node.kind === "function" ? String(node.name) : String(node.kind),
        lineStart: lineAt(start),
        lineEnd: lineAt(start + length),
        visibility: node.visibility,
        mutability: node.stateMutability as SurfaceEntry["mutability"],
        modifiers: ((node.modifiers as Array<{ modifierName?: { name?: string } }> | undefined) ?? []).map((modifier) => modifier.modifierName?.name ?? "unknown"),
        leadIds: []
      });
    }
  }
  return entries;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try { return await readFile(filePath, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
