export type SourceTool =
  | "slither"
  | "aevasec-custom"
  | "foundry"
  | "manual";

export type AevaSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

export type AevaConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "UNKNOWN";

export type FindingStatus =
  | "OPEN"
  | "SUPPRESSED";

export type TriageClassification =
  | "REAL_INTERESTING"
  | "FALSE_POSITIVE"
  | "KNOWN_PATTERN"
  | "NEEDS_CONTEXT"
  | "OUT_OF_SCOPE";

export type RoleReachability =
  | "unclear"
  | "unprivileged user reachable"
  | "whitelisted/approved user reachable"
  | "trusted keeper/broker/rebalancer reachable"
  | "owner/governance/deployer only"
  | "dependency/config-only"
  | "test/reader/oracle/dependency out of scope"
  | "outside declared bounty scope";

export type ImpactCategory =
  | "direct asset loss"
  | "stuck funds"
  | "unauthorized accounting/state change"
  | "persistent DoS"
  | "liquidation/solvency impact"
  | "oracle/price manipulation"
  | "bounded griefing"
  | "event/indexer noise"
  | "no concrete impact found";

export type BountyActionability = "yes" | "no" | "unclear";

export type PocPriority = "high" | "medium" | "low" | "skip";

export type RecentChangeStatus =
  | "overlaps recent diff"
  | "touched by recent diff"
  | "near recent diff"
  | "pre-existing"
  | "unavailable";

export type AevaFinding = {
  id: string;
  schemaVersion: "1.0";

  source: {
    tool: SourceTool;
    toolVersion?: string;
    sourceRuleId: string;
  };

  ruleId: string;
  aevasecClass?: string;

  title: string;
  severity: AevaSeverity;
  confidence: AevaConfidence;

  location: {
    file: string;
    lineStart?: number;
    lineEnd?: number;
    columnStart?: number;
    columnEnd?: number;
  };

  symbol?: {
    contract?: string;
    function?: string;
    elementType?: string;
    elementName?: string;
  };

  evidence: {
    description: string;
    snippet?: string;
    raw?: unknown;
  };

  fingerprint: {
    algorithm: "sha256";
    value: string;
    input: string;
  };

  status: FindingStatus;

  suppression?: {
    reason: string;
    createdAt?: string;
    expiresAt?: string | null;
  };

  triage?: {
    classification?: TriageClassification;
    notes?: string;
    review?: { classification: TriageClassification; notes: string; reviewedAt: string; targetCommit?: string; pocReference?: string };
    recentChange?: {
      status: RecentChangeStatus;
      baseRef?: string;
      headRef?: string;
      filesChanged: number;
      changedRanges: Array<{
        file: string;
        lineStart: number;
        lineEnd: number;
      }>;
      riskPatterns: string[];
      summary: string;
      scoreBoost: number;
    };
    bounty?: {
      assessment: "heuristic";
      evidence: string[];
      limitations: string[];
      flaggedPattern: string;
      externalReachability: RoleReachability[];
      privilegeAssumptions: string[];
      affectedAssetState: string;
      impact: ImpactCategory[];
      bountyActionability: BountyActionability;
      likelySeverity: AevaSeverity | "NONE" | "UNCLEAR";
      pocPriority: PocPriority;
      score: number;
      scoreReasons: string[];
      smallestNextPoc: string;
      gate: {
        minimumPaidSeverity: AevaSeverity;
        skipLowInformational: boolean;
        source: "config" | "default";
      };
    };
  };
};
