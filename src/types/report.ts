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
  };

  engines: Array<{
    name: string;
    inputFile?: string;
    version?: string;
  }>;

  config: {
    profile?: string;
    source?: string;
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
