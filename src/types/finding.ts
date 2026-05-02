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
  };
};
