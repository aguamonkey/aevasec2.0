import path from "node:path";
import { AevaReport } from "../types/report";
import { writeJsonFile } from "../util/fs";

export async function writeJsonReport(outDir: string, report: AevaReport): Promise<void> {
  await writeJsonFile(path.join(outDir, "report.json"), report);
}
