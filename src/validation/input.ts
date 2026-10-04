import { SlitherOutput } from "../ingest/slither/slitherTypes";
import { BountySeverityGate } from "../triage/bountyGate";

export function validateSlither(value: unknown): asserts value is SlitherOutput {
  if (!isObject(value) || typeof value.success !== "boolean") throw new Error("Invalid Slither JSON: success must be boolean");
  if (value.error !== null && value.error !== undefined && typeof value.error !== "string") throw new Error("Invalid Slither JSON: error must be a string or null");
  if (value.results !== undefined && !isObject(value.results)) throw new Error("Invalid Slither JSON: results must be an object");
  const detectors = (value.results as Record<string, unknown> | undefined)?.detectors;
  if (detectors === undefined) return;
  if (!Array.isArray(detectors)) throw new Error("Invalid Slither JSON: detectors must be an array");
  for (const [index, detector] of detectors.entries()) {
    if (!isObject(detector) || ["check", "impact", "confidence", "description"].some(key => typeof detector[key] !== "string")) {
      throw new Error(`Invalid Slither detector ${index}: check, impact, confidence, description must be strings`);
    }
    if (detector.elements !== undefined && (!Array.isArray(detector.elements) || detector.elements.some(element => {
      if (!isObject(element)) return true;
      const mapping = element.source_mapping;
      return mapping !== undefined && (!isObject(mapping) ||
        ["filename_relative", "filename_short", "filename_used", "filename_absolute"].some(key => mapping[key] !== undefined && typeof mapping[key] !== "string") ||
        (mapping.lines !== undefined && (!Array.isArray(mapping.lines) || mapping.lines.some(line => !Number.isInteger(line) || Number(line) < 1))));
    }))) throw new Error(`Invalid Slither detector ${index}: invalid elements/source mapping`);
  }
}

export function validateBountyGate(value: unknown): asserts value is Partial<BountySeverityGate> {
  if (!isObject(value)) throw new Error("Invalid bounty gate: expected object");
  if (value.schemaVersion !== "1.0") throw new Error("Invalid bounty gate: schemaVersion must be 1.0");
  if (value.minimumPaidSeverity !== undefined && !["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(value.minimumPaidSeverity))) throw new Error("Invalid bounty gate: unknown minimumPaidSeverity");
  for (const key of ["excludedImpacts", "dependencyConfigAssumptions", "privilegedRoleAssumptions"]) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || (value[key] as unknown[]).some(item => typeof item !== "string"))) throw new Error(`Invalid bounty gate: ${key} must be string array`);
  }
  if (value.skipLowInformational !== undefined && typeof value.skipLowInformational !== "boolean") throw new Error("Invalid bounty gate: skipLowInformational must be boolean");
  if (value.scope !== undefined) validateScope(value.scope);
}

function validateScope(scope: unknown): void {
  if (!isObject(scope)) throw new Error("Invalid bounty gate: scope must be an object");
  for (const key of ["inScopePaths", "outOfScopePaths", "knownIssues"]) {
    if (scope[key] !== undefined && (!Array.isArray(scope[key]) || (scope[key] as unknown[]).some(item => typeof item !== "string" || !item.trim()))) throw new Error(`Invalid bounty gate: scope.${key} must be string array`);
  }
  if (scope.deployedCommit !== undefined && (typeof scope.deployedCommit !== "string" || !/^[a-f0-9]{7,40}$/.test(scope.deployedCommit))) throw new Error("Invalid bounty gate: scope.deployedCommit must be a commit hash");
  if (scope.contracts !== undefined && (!Array.isArray(scope.contracts) || scope.contracts.some(item => !isObject(item) || typeof item.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(item.name) ||
      (item.address !== undefined && (typeof item.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(item.address))) ||
      (item.chain !== undefined && (typeof item.chain !== "string" || !/^[\w .-]+$/.test(item.chain)))))) throw new Error("Invalid bounty gate: scope.contracts entries need a name and optional 0x address/chain");
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
