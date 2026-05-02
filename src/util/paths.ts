import path from "node:path";

export function resolveTargetPath(targetPath: string | undefined): string {
  return path.resolve(targetPath ?? process.cwd());
}

export function resolveOutPath(outPath: string | undefined): string {
  return path.resolve(outPath ?? path.join(process.cwd(), "aevasec-report"));
}
