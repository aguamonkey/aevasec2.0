import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type SourceWindowParams = {
  targetPath: string;
  relativeFile: string;
  lineStart?: number;
  lineEnd?: number;
  contextLines?: number;
};

export type SourceWindow = {
  available: boolean;
  reason?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  content?: string;
};

export async function readSourceWindow(params: SourceWindowParams): Promise<SourceWindow> {
  const contextLines = params.contextLines ?? 20;

  if (!params.targetPath) {
    return unavailable("target path is missing");
  }

  if (!params.relativeFile || params.relativeFile === "unknown") {
    return unavailable("source file is unknown");
  }

  if (path.isAbsolute(params.relativeFile)) {
    return unavailable("source file is absolute");
  }

  if (params.lineStart === undefined) {
    return unavailable("line start is missing");
  }

  const targetRoot = path.resolve(params.targetPath);
  const filePath = path.resolve(targetRoot, params.relativeFile);
  const relativeToTarget = path.relative(targetRoot, filePath);

  if (relativeToTarget.startsWith("..") || path.isAbsolute(relativeToTarget)) {
    return unavailable("source file is outside target path");
  }

  if (!Number.isInteger(params.lineStart) || params.lineStart < 1 || !Number.isInteger(contextLines) || contextLines < 0 ||
      (params.lineEnd !== undefined && (!Number.isInteger(params.lineEnd) || params.lineEnd < params.lineStart))) return unavailable("invalid source range");

  let raw: string;
  try {
    const realRoot = await realpath(targetRoot);
    const realFile = await realpath(filePath);
    const relativeReal = path.relative(realRoot, realFile);
    if (relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) return unavailable("source symlink is outside target path");
    raw = await readFile(realFile, "utf8");
  } catch {
    return unavailable(`cannot read source file: ${params.relativeFile}`);
  }

  const lines = raw.split(/\r?\n/);
  if (params.lineStart > lines.length) return unavailable("source range is beyond file; scan may be stale");
  const requestedEnd = params.lineEnd ?? params.lineStart;
  const startLine = Math.max(1, params.lineStart - contextLines);
  const endLine = Math.min(lines.length, requestedEnd + contextLines);
  const width = String(endLine).length;
  const content = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => `${String(startLine + index).padStart(width, " ")} | ${line}`)
    .join("\n");

  return {
    available: true,
    filePath,
    lineStart: startLine,
    lineEnd: endLine,
    content
  };
}

function unavailable(reason: string): SourceWindow {
  return {
    available: false,
    reason
  };
}
