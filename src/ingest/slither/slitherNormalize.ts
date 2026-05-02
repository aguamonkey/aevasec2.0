import { buildFingerprint } from "../../fingerprint/fingerprint";
import { AevaConfidence, AevaFinding, AevaSeverity } from "../../types/finding";
import { SLITHER_TO_AEVA_CLASS } from "./slitherClassMap";
import { SlitherDetectorResult, SlitherElement, SlitherOutput } from "./slitherTypes";

export function normalizeSlitherOutput(output: SlitherOutput): AevaFinding[] {
  const detectors = output.results?.detectors ?? [];

  return detectors.map((detector, index) => {
    const elements = detector.elements ?? [];
    const primary = pickPrimaryElement(elements);
    const location = buildLocation(primary);
    const aevasecClass = SLITHER_TO_AEVA_CLASS[detector.check];
    const fingerprint = buildFingerprint([
      "slither",
      detector.check,
      aevasecClass ?? "UNCLASSIFIED",
      location.file,
      primary?.type,
      primary?.name,
      location.lineStart,
      detector.description
    ]);

    return {
      id: `slither-${index + 1}`,
      schemaVersion: "1.0",
      source: {
        tool: "slither",
        sourceRuleId: detector.check
      },
      ruleId: `SLITHER:${detector.check}`,
      ...(aevasecClass ? { aevasecClass } : {}),
      title: detector.check,
      severity: mapSeverity(detector.impact),
      confidence: mapConfidence(detector.confidence),
      location,
      symbol: buildSymbol(primary),
      evidence: {
        description: detector.description,
        raw: detector
      },
      fingerprint,
      status: "OPEN"
    };
  });
}

export function pickPrimaryElement(elements: SlitherElement[]): SlitherElement | undefined {
  const preferredTypes = ["function", "contract", "variable", "node"];

  for (const type of preferredTypes) {
    const match = elements.find((element) => element.type === type && element.source_mapping);
    if (match) {
      return match;
    }
  }

  return elements.find((element) => element.source_mapping) ?? elements[0];
}

function buildLocation(primary: SlitherElement | undefined): AevaFinding["location"] {
  const sourceMapping = primary?.source_mapping;
  const lines = sourceMapping?.lines ?? [];
  const lineStart = lines.length > 0 ? Math.min(...lines) : undefined;
  const lineEnd = lines.length > 0 ? Math.max(...lines) : undefined;

  return {
    file:
      sourceMapping?.filename_relative ??
      sourceMapping?.filename_short ??
      sourceMapping?.filename_used ??
      sourceMapping?.filename_absolute ??
      "unknown",
    ...(lineStart !== undefined ? { lineStart } : {}),
    ...(lineEnd !== undefined ? { lineEnd } : {}),
    ...(sourceMapping?.starting_column !== undefined ? { columnStart: sourceMapping.starting_column } : {}),
    ...(sourceMapping?.ending_column !== undefined ? { columnEnd: sourceMapping.ending_column } : {})
  };
}

function buildSymbol(primary: SlitherElement | undefined): AevaFinding["symbol"] | undefined {
  if (!primary) {
    return undefined;
  }

  return {
    ...(primary.type === "contract" ? { contract: primary.name } : {}),
    ...(primary.type === "function" ? { function: primary.name } : {}),
    elementType: primary.type,
    elementName: primary.name
  };
}

function mapSeverity(impact: string): AevaSeverity {
  switch (impact.toLowerCase()) {
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    case "low":
      return "LOW";
    case "informational":
    case "optimization":
    default:
      return "INFO";
  }
}

function mapConfidence(confidence: string): AevaConfidence {
  switch (confidence.toLowerCase()) {
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    case "low":
      return "LOW";
    default:
      return "UNKNOWN";
  }
}
