import { BountyScope } from "../triage/scope";
import { AevaFinding } from "./finding";

export type AevaReport = {
  schemaVersion: "1.0";

  tool: {
    name: "aevasec";
    version: string;
  };

  target: {
    path?: string;
    gitCommit?: string;
    dirty?: boolean;
  };

  engines: Array<{
    name: string;
    inputFile?: string;
    version?: string;
    inputSha256?: string;
  }>;

  comparison?: { previousCommit?: string; added: string[]; absent: string[]; unchanged: string[]; note: string };

  generatedAt?: string;

  config: {
    profile?: string;
    source?: string;
    bounty?: {
      minimumPaidSeverity: string;
      excludedImpacts: string[];
      dependencyConfigAssumptions: string[];
      privilegedRoleAssumptions: string[];
      skipLowInformational: boolean;
      source: "config" | "default";
      path?: string;
      scope?: BountyScope;
    };
    recentChanges?: {
      enabled: boolean;
      available?: boolean;
      baseRef?: string;
      headRef?: string;
      filesChanged?: number;
      source?: "git";
    };
  };

  stats: {
    totalFindings: number;
    openFindings: number;
    suppressedFindings: number;
    findingsBySeverity: Record<string, number>;
    findingsByRule: Record<string, number>;
  };

  findings: AevaFinding[];

  errors: Array<{
    message: string;
    source?: string;
  }>;
};
