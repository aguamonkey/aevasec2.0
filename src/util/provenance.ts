import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export async function targetProvenance(targetPath: string): Promise<{ gitCommit?: string; dirty?: boolean }> {
  try {
    const { stdout: commit } = await execFileAsync("git", ["-C", targetPath, "rev-parse", "HEAD"]);
    const { stdout: status } = await execFileAsync("git", ["-C", targetPath, "status", "--porcelain", "--untracked-files=no"]);
    return { gitCommit: commit.trim(), dirty: status.trim().length > 0 };
  } catch { return {}; }
}
