import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validateBountyGate } from "../validation/input";
import { AevaSeverity } from "../types/finding";
import { BountyScope } from "./scope";

export type BountySeverityGate = {
  schemaVersion: "1.0";
  minimumPaidSeverity: AevaSeverity;
  excludedImpacts: string[];
  dependencyConfigAssumptions: string[];
  privilegedRoleAssumptions: string[];
  skipLowInformational: boolean;
  scope?: BountyScope;
};

export type LoadedBountyGate = BountySeverityGate & {
  source: "config" | "default";
  path?: string;
};

const DEFAULT_GATE: BountySeverityGate = {
  schemaVersion: "1.0",
  minimumPaidSeverity: "MEDIUM",
  excludedImpacts: [
    "event/indexer noise without protocol or user impact",
    "bounded griefing below paid severity",
    "malicious or non-standard dependency behavior unless accepted by deployment assumptions"
  ],
  dependencyConfigAssumptions: [
    "canonical WETH/token/oracle/dependency deployments are honest unless bounty metadata says otherwise",
    "bad deployment configuration is not actionable without evidence that it exists on the target deployment"
  ],
  privilegedRoleAssumptions: [
    "owner/governance/deployer actions are trusted unless the bounty explicitly accepts privileged abuse",
    "keeper/broker/rebalancer paths need an attacker-reachable role acquisition path before PoC work"
  ],
  skipLowInformational: true
};

export async function loadBountyGate(targetPath?: string, configuredPath?: string): Promise<LoadedBountyGate> {
  const candidate = configuredPath ?? (targetPath ? path.join(targetPath, ".aevasec", "bounty.json") : undefined);

  if (configuredPath && !(await fileExists(configuredPath))) throw new Error(`Bounty gate not found: ${configuredPath}`);
  if (!candidate || !(await fileExists(candidate))) {
    return { ...DEFAULT_GATE, source: "default" };
  }

  const raw: unknown = JSON.parse(await readFile(candidate, "utf8"));
  validateBountyGate(raw);

  return {
    ...DEFAULT_GATE,
    ...raw,
    excludedImpacts: raw.excludedImpacts ?? DEFAULT_GATE.excludedImpacts,
    dependencyConfigAssumptions: raw.dependencyConfigAssumptions ?? DEFAULT_GATE.dependencyConfigAssumptions,
    privilegedRoleAssumptions: raw.privilegedRoleAssumptions ?? DEFAULT_GATE.privilegedRoleAssumptions,
    source: "config",
    path: candidate
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
