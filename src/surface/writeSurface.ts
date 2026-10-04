import path from "node:path";
import { writeJsonFile, writeTextFile } from "../util/fs";
import { isReadOnly, Surface, SurfaceEntry } from "./buildSurface";

export async function writeSurface(outDir: string, surface: Surface): Promise<void> {
  await writeJsonFile(path.join(outDir, "surface.json"), surface);
  await writeTextFile(path.join(outDir, "surface.md"), renderSurface(surface));
}

function renderSurface(surface: Surface): string {
  const stateChanging = surface.entries.filter((entry) => !isReadOnly(entry));
  const readOnly = surface.entries.filter(isReadOnly);
  return [
    "# Review surface",
    "",
    "Every externally callable function defined in the in-scope sources. Read each one; detector leads are hints, not the queue.",
    "",
    `- Source files: ${surface.sourceFiles.join(", ") || "none"}`,
    `- State-changing entrypoints: ${stateChanging.length}`,
    `- View/pure entrypoints: ${readOnly.length}`,
    `- Open detector leads outside any listed entrypoint: ${surface.unattachedLeadIds.length}`,
    "",
    "## Limitations",
    "",
    ...surface.limitations.map((item) => `- ${item}`),
    "",
    "## State-changing entrypoints",
    "",
    renderTable(stateChanging),
    "",
    "## View/pure entrypoints",
    "",
    "These feed prices, fees and quotes into state-changing paths and integrations; they are not lower priority by construction.",
    "",
    renderTable(readOnly),
    ""
  ].join("\n");
}

function renderTable(entries: SurfaceEntry[]): string {
  if (entries.length === 0) return "None";
  return [
    "| Function | Location | Mutability | Modifiers | Detector leads |",
    "| --- | --- | --- | --- | --- |",
    ...entries.map((entry) =>
      `| ${entry.contract}.${entry.function} | ${entry.file}:${entry.lineStart}-${entry.lineEnd} | ${entry.mutability} | ${entry.modifiers.join(", ") || "none"} | ${entry.leadIds.join(", ") || "none"} |`)
  ].join("\n");
}
