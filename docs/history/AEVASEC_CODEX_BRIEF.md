# aevasec v1 Scaffold Brief

## Project summary

Build `aevasec`, a local Mac-first Solidity audit triage orchestrator.

This is NOT a custom static analyzer first. It is an orchestration layer that ingests external tool output, normalizes findings, applies suppression memory, writes reports, and generates focused AI review packets.

The first supported ingestion source is Slither JSON.

## Core v1 command

The first working command must be:

```bash
node dist/cli.js ingest slither ./slither.json \
  --target ./example-target \
  --out ./reports/slither-001
```

It should produce:

```txt
report.json
report.md
packets/
  slither-1.md
  slither-2.md
  ...
```

## Non-goals for this task

Do not build a web dashboard.
Do not build custom Solidity AST rules.
Do not run Slither internally yet.
Do not add symbolic execution.
Do not add fuzzing.
Do not add a database.
Do not add SaaS/server code.
Do not overengineer plugin architecture.

Mode A only:

```bash
aevasec ingest slither ./slither.json
```

Mode B later:

```bash
aevasec scan ./repo --engine slither
```

## Required TypeScript project setup

Use TypeScript/Node.

Set up:

```txt
package.json
tsconfig.json
src/
```

Add useful scripts:

```json
{
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "start": "node dist/cli.js"
}
```

Prefer minimal dependencies. Use Node built-ins where reasonable.

## Required file structure

Create this structure:

```txt
src/
  cli.ts

  types/
    finding.ts
    report.ts

  ingest/
    slither/
      slitherTypes.ts
      slitherNormalize.ts
      slitherClassMap.ts

  fingerprint/
    fingerprint.ts

  suppressions/
    suppressions.ts

  report/
    writeJsonReport.ts
    writeMarkdownReport.ts

  packets/
    writeAiPackets.ts

  util/
    fs.ts
    normalize.ts
    paths.ts
```

## Core finding schema

Implement `AevaFinding` in `src/types/finding.ts`.

Required shape:

```ts
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
```

## Report schema

Implement `AevaReport` in `src/types/report.ts`.

```ts
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
```

## Slither input types

Implement `src/ingest/slither/slitherTypes.ts`.

Use a tolerant shape:

```ts
export type SlitherOutput = {
  success: boolean;
  error: string | null;
  results?: {
    detectors?: SlitherDetectorResult[];
  };
};

export type SlitherDetectorResult = {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements?: SlitherElement[];
  additional_fields?: Record<string, unknown>;
};

export type SlitherElement = {
  type?: string;
  name?: string;
  source_mapping?: {
    start?: number;
    length?: number;
    filename_relative?: string;
    filename_absolute?: string;
    filename_short?: string;
    filename_used?: string;
    lines?: number[];
    starting_column?: number;
    ending_column?: number;
  };
  type_specific_fields?: Record<string, unknown>;
  additional_fields?: Record<string, unknown>;
};
```

## Slither to aevasec class mapping

Implement `src/ingest/slither/slitherClassMap.ts`.

```ts
export const SLITHER_TO_AEVA_CLASS: Record<string, string> = {
  "unchecked-lowlevel": "R007_UNCHECKED_LOW_LEVEL_CALL",
  "unchecked-send": "R007_UNCHECKED_LOW_LEVEL_CALL",

  "controlled-delegatecall": "R010_DELEGATECALL_SELFDESTRUCT",
  "delegatecall-loop": "R010_DELEGATECALL_SELFDESTRUCT",
  "suicidal": "R010_DELEGATECALL_SELFDESTRUCT",

  "reentrancy-eth": "R002_REENTRANCY_ORDERING",
  "reentrancy-no-eth": "R002_REENTRANCY_ORDERING",
  "reentrancy-benign": "R002_REENTRANCY_ORDERING",

  "arbitrary-send-eth": "R003_MISSING_ACCESS_CONTROL",
  "arbitrary-send-erc20": "R003_MISSING_ACCESS_CONTROL",
  "arbitrary-send-erc20-permit": "R003_MISSING_ACCESS_CONTROL",

  "timestamp": "R006_TIMESTAMP_DEPENDENCE",

  "calls-loop": "R008_UNBOUNDED_LOOP_RISK",

  "divide-before-multiply": "R005_PRECISION_ROUNDING"
};
```

## Normalization behavior

Implement `normalizeSlitherOutput(output: SlitherOutput): AevaFinding[]`.

Rules:

1. Use `results.detectors ?? []`.
2. Each detector becomes one `AevaFinding`.
3. `ruleId` must be `SLITHER:${detector.check}`.
4. `source.tool` must be `"slither"`.
5. `source.sourceRuleId` must be `detector.check`.
6. `aevasecClass` should come from the mapping table if available.
7. `severity` maps:
   - High -> HIGH
   - Medium -> MEDIUM
   - Low -> LOW
   - Informational -> INFO
   - Optimization -> INFO
   - unknown -> INFO
8. `confidence` maps:
   - High -> HIGH
   - Medium -> MEDIUM
   - Low -> LOW
   - unknown -> UNKNOWN
9. Preserve original detector object in `evidence.raw`.
10. Use resilient primary element picking.

## Primary element picking

Implement:

```ts
function pickPrimaryElement(elements: SlitherElement[]): SlitherElement | undefined
```

Use this preference order:

```txt
function with source_mapping
contract with source_mapping
variable with source_mapping
node with source_mapping
any element with source_mapping
first element
undefined
```

Do not assume Slither always gives a clean function element.

## Location mapping

Use primary element source mapping.

Prefer file path in this order:

```txt
filename_relative
filename_short
filename_used
filename_absolute
"unknown"
```

For lines:

```txt
lineStart = min(lines)
lineEnd = max(lines)
```

If no lines exist, leave lineStart/lineEnd undefined.

## Fingerprinting

Implement:

```ts
buildFingerprint(inputParts: Array<string | number | undefined | null>)
```

Use SHA-256 from Node `crypto`.

Fingerprint input should be normalized by:

```txt
String(part ?? "")
collapse whitespace
trim
lowercase
join with "|"
```

For Slither findings, use these parts:

```txt
"slither"
detector.check
aevasecClass ?? "UNCLASSIFIED"
location.file
primary?.type
primary?.name
location.lineStart
detector.description
```

Fingerprint output:

```ts
{
  algorithm: "sha256",
  value: "sha256:<hash>",
  input: "<normalized input>"
}
```

## Suppression system

Read suppressions from:

```txt
<target>/.aevasec/suppressions.json
```

If missing, use an empty list.

Shape:

```ts
export type SuppressionFile = {
  schemaVersion: "1.0";
  items: SuppressionItem[];
};

export type SuppressionItem = {
  fingerprint: string;
  ruleId: string;
  reason: string;
  createdAt?: string;
  expiresAt?: string | null;
};
```

A finding is suppressed when:

```txt
suppression.fingerprint === finding.fingerprint.value
AND suppression.ruleId === finding.ruleId
AND suppression is not expired
```

When suppressed, set:

```ts
status: "SUPPRESSED"
suppression: {
  reason,
  createdAt,
  expiresAt
}
```

Use a Map keyed by `${ruleId}:${fingerprint}` for efficient lookup.

## JSON report

Write:

```txt
<out>/report.json
```

Pretty-print with 2 spaces.

## Markdown report

Write:

```txt
<out>/report.md
```

The report should include:

```md
# aevasec report

## Summary

- Total findings
- Open findings
- Suppressed findings

## Findings by severity

## Findings by rule

## Suggested review order

Open findings first, sorted by severity then confidence.

## Open findings

Each finding should include:
- ID
- Rule
- Class
- Severity
- Confidence
- Location
- Fingerprint
- Description

## Suppressed findings

Each suppressed finding should include:
- ID
- Rule
- Location
- Reason
```

Severity ordering:

```txt
CRITICAL > HIGH > MEDIUM > LOW > INFO
```

Confidence ordering:

```txt
HIGH > MEDIUM > LOW > UNKNOWN
```

## AI packet generation

Create:

```txt
<out>/packets/
```

For each OPEN finding, write:

```txt
<finding.id>.md
```

Packet format:

```md
# AI Review Packet

## Finding

Rule:
Class:
Severity:
Confidence:
Location:
Fingerprint:

## Description

<description>

## Primary evidence

Include detector description.

## Questions

1. Is this finding exploitable in this codebase?
2. What are the exact attacker preconditions?
3. What state change, loss, accounting error, stuck-fund condition, or DoS would prove impact?
4. What existing guards may invalidate this?
5. Suggest the smallest Foundry PoC structure if this survives review.

Do not claim vulnerability unless there is a concrete attacker path.
Separate facts from assumptions.
List reasons this may be a false positive.
```

Do not generate packets for suppressed findings.

## CLI behavior

Implement only this command for v1:

```bash
node dist/cli.js ingest slither <slither-json> --target <target-path> --out <out-dir>
```

If command is invalid, print usage and exit 1.

If target is omitted, default to process.cwd().
If out is omitted, default to `<cwd>/aevasec-report`.

Build report object:

```ts
{
  schemaVersion: "1.0",
  tool: { name: "aevasec", version: "0.1.0" },
  target: { path: targetPath },
  engines: [{ name: "slither", inputFile }],
  config: { source: "slither" },
  stats,
  findings,
  errors
}
```

If `slitherOutput.success` is false, include error in `errors`, but still process detectors if present.

## Validation/demo fixtures

Create:

```txt
fixtures/slither-sample.json
```

Include at least 3 fake Slither detector entries:

1. unchecked-lowlevel
2. controlled-delegatecall
3. calls-loop

Make sure at least one has a function element, one has a contract element, and one has missing/partial source mapping to test fallbacks.

Create:

```txt
example-target/.aevasec/suppressions.json
```

Make it valid but with an empty `items` array.

## README

Create a README with:

1. What aevasec is.
2. What it is not.
3. Install/build commands.
4. Example ingest command.
5. Output files.
6. Suppression format.
7. Next phase: internal Slither execution later.

## Acceptance checks

After implementation, these should work:

```bash
npm install
npm run build

node dist/cli.js ingest slither ./fixtures/slither-sample.json \
  --target ./example-target \
  --out ./reports/demo
```

Expected output:

```txt
reports/demo/report.json
reports/demo/report.md
reports/demo/packets/slither-1.md
reports/demo/packets/slither-2.md
reports/demo/packets/slither-3.md
```

Also run:

```bash
npm run typecheck
```

Fix all TypeScript errors.

## Implementation style

Keep code simple.
Prefer readable functions over clever abstractions.
Use Node built-ins where possible.
Do not introduce unnecessary dependencies.
Do not implement features outside this brief.
