import { readSourceWindow } from "../source/readSourceWindow";
import { classifyRecentChangeForFinding, RecentChanges } from "../changes/gitChanges";
import {
  AevaFinding,
  AevaSeverity,
  ImpactCategory,
  PocPriority,
  RoleReachability
} from "../types/finding";
import { LoadedBountyGate } from "./bountyGate";
import { classifyScope } from "./scope";

type SourceContext = {
  available: boolean;
  reason?: string;
  content?: string;
};

const SEVERITY_SCORE: Record<AevaSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

export async function applyBountyTriage(
  findings: AevaFinding[],
  gate: LoadedBountyGate,
  options: { targetPath?: string; contextLines?: number; recentChanges?: RecentChanges } = {}
): Promise<AevaFinding[]> {
  return Promise.all(
    findings.map(async (finding) => {
      if (finding.status !== "OPEN") {
        return finding;
      }

      const sourceContext = options.targetPath
        ? await readSourceWindow({
            targetPath: options.targetPath,
            relativeFile: finding.location.file,
            lineStart: finding.location.lineStart,
            lineEnd: finding.location.lineEnd,
            contextLines: 0
          })
        : { available: false, reason: "target path is missing" };

      return classifyFindingForBounty(finding, sourceContext, gate, options.recentChanges);
    })
  );
}

export function classifyFindingForBounty(
  finding: AevaFinding,
  sourceContext: SourceContext,
  gate: LoadedBountyGate,
  recentChanges?: RecentChanges
): AevaFinding {
  const text = normalizeText([finding.ruleId, finding.title, finding.evidence.description, stripComments(sourceContext.content ?? "")].join("\n"));
  const findingText = normalizeText([finding.ruleId, finding.title, finding.evidence.description].join("\n"));
  const recentChange = recentChanges ? classifyRecentChangeForFinding(finding, recentChanges) : finding.triage?.recentChange;
  const code = stripComments(sourceContext.content ?? "").replace(/^\s*\d+ \| /gm, "");
  const reachability = classifyRoleReachability(finding, code.toLowerCase(), gate);
  const impact = classifyImpact(findingText);
  const privilegeAssumptions = buildPrivilegeAssumptions(reachability, gate);
  const affectedAssetState = describeAffectedAssetState(text, impact);
  const flaggedPattern = describeFlaggedPattern(finding, text);
  const scoring = scoreFinding(finding, reachability, impact, gate, text, recentChange?.scoreBoost ?? 0);
  const likelySeverity = inferBountySeverity(finding, impact);
  const bountyActionability = "unclear" as const;

  return {
    ...finding,
    triage: {
      ...finding.triage,
      ...(recentChange ? { recentChange } : {}),
      bounty: {
        assessment: "heuristic",
        evidence: [sourceContext.available ? `Local source: ${finding.location.file}:${finding.location.lineStart ?? "unknown"}` : `Source unavailable: ${sourceContext.reason ?? "unknown"}`, ...scoring.reasons],
        limitations: ["Keywords suggest patterns; they do not prove attacker reachability or impact.", "Custom modifiers, callers, inherited guards, and deployment scope require manual review.", "Bounty exclusions and trust assumptions are review context, not automatically proven eligibility."],
        flaggedPattern,
        externalReachability: reachability,
        privilegeAssumptions,
        affectedAssetState,
        impact,
        bountyActionability,
        likelySeverity,
        pocPriority: scoring.pocPriority,
        score: scoring.score,
        scoreReasons: scoring.reasons,
        smallestNextPoc: buildSmallestNextPoc(scoring.pocPriority, reachability, impact),
        gate: {
          minimumPaidSeverity: gate.minimumPaidSeverity,
          skipLowInformational: gate.skipLowInformational,
          source: gate.source
        }
      }
    }
  };
}

function classifyRoleReachability(finding: AevaFinding, text: string, gate: LoadedBountyGate): RoleReachability[] {
  const labels = new Set<RoleReachability>();
  // Inspect only the first declaration at the finding, never neighboring functions or prose.
  const header = /^\s*function\b[^{};]*[\{;]/.exec(text)?.[0] ?? "";
  if (/\b(onlyowner|owneronly|onlyadmin|adminonly|configuratoronly|governanceonly)\b/.test(header)) {
    labels.add("owner/governance/deployer only");
  }
  if (/\b(onlykeeper|onlybroker|onlyrebalancer|gaugeonly)\b/.test(header)) {
    labels.add("trusted keeper/broker/rebalancer reachable");
  }
  if (/\b(creditfacadeonly|whitelisted|onlyapproved|onlyallowed)\b/.test(header)) {
    labels.add("whitelisted/approved user reachable");
  }
  const file = finding.location.file.replace(/\\/g, "/").toLowerCase();
  // Match path components and conventional filenames, not incidental substrings.
  if (/(^|\/)(tests?|mocks?|fixtures?|interfaces?)(\/|$)/.test(file) ||
      /(^|\/)(mock|test|fixture|interface)[^/]*\.sol$/.test(file) || /\.t\.sol$/.test(file)) {
    labels.add("test/reader/oracle/dependency out of scope");
  }
  if (classifyScope(finding.location.file, gate.scope) === "out of scope") {
    labels.add("outside declared bounty scope");
  }

  // Public visibility is evidence of an entrypoint, not proof of an attacker path.
  if (labels.size === 0) labels.add("unclear");
  return [...labels];
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// Source operations and identifiers describe functionality, not demonstrated impact.
function classifyImpact(findingText: string): ImpactCategory[] {
  const impacts = new Set<ImpactCategory>();

  if (/\b(steal|loss|drain|withdraw|transferfrom|sweep|asset|fund|collateral|balance)\b|\btransfer\s*\(/.test(findingText)) {
    impacts.add("direct asset loss");
  }
  if (/\b(stuck|locked|cannot withdraw|unable to withdraw|frozen)\b/.test(findingText)) {
    impacts.add("stuck funds");
  }
  if (/\b(accounting|state|sequence|nonce|shares|supply|debt|credit|position|settlement)\b/.test(findingText)) {
    impacts.add("unauthorized accounting/state change");
  }
  if (/\b(dos|denial|revert|halt|block|pause|brick)\b/.test(findingText)) {
    impacts.add("persistent DoS");
  }
  if (/\b(liquidation|solvency|insolvent|margin|health factor|bad debt)\b/.test(findingText)) {
    impacts.add("liquidation/solvency impact");
  }
  if (/\b(price|oracle|twap|manipulat|stale price)\b/.test(findingText)) {
    impacts.add("oracle/price manipulation");
  }
  if (/\b(grief|dust|spam|bounded|gas grief)\b/.test(findingText)) {
    impacts.add("bounded griefing");
  }
  if (/\b(event|emit|indexer|log only|sequence only|bump sequence)\b/.test(findingText)) {
    impacts.add("event/indexer noise");
  }

  if (impacts.size === 0) {
    impacts.add("no concrete impact found");
  }

  return [...impacts];
}

function scoreFinding(
  finding: AevaFinding,
  reachability: RoleReachability[],
  impact: ImpactCategory[],
  gate: LoadedBountyGate,
  text: string,
  recentChangeBoost: number
): { score: number; pocPriority: PocPriority; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string): void => {
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${points}: ${reason}`);
  };

  if (reachability.includes("unclear")) {
    add(15, "attacker reachability requires review");
  }
  if (reachability.includes("whitelisted/approved user reachable")) {
    add(15, "approved-user path may be reachable");
  }
  if (reachability.includes("trusted keeper/broker/rebalancer reachable")) {
    add(-25, "requires trusted keeper/broker/rebalancer path");
  }
  if (reachability.includes("owner/governance/deployer only")) {
    add(-45, "requires owner/governance/deployer");
  }
  if (reachability.includes("dependency/config-only")) {
    add(-35, "depends on malicious/non-standard dependency or bad config");
  }
  if (reachability.includes("test/reader/oracle/dependency out of scope")) {
    add(-40, "test/reader/oracle/dependency surface is likely out of scope");
  }
  if (reachability.includes("outside declared bounty scope")) {
    add(-40, "file is outside the paths declared in the bounty scope");
  }

  if (impact.some((item) => ["direct asset loss", "stuck funds", "unauthorized accounting/state change", "liquidation/solvency impact"].includes(item))) {
    add(30, "touches user/protocol assets or critical accounting state");
  }
  if (impact.includes("persistent DoS") || impact.includes("oracle/price manipulation")) {
    add(20, "maps to commonly paid protocol impact");
  }
  if (impact.includes("bounded griefing")) {
    add(-10, "bounded griefing is usually below paid severity");
  }
  if (impact.length === 1 && impact.includes("event/indexer noise")) {
    add(-30, "impact appears limited to events/indexers");
  }
  const benignPatternPenalty = getBenignPatternPenalty(finding.ruleId, text);
  if (benignPatternPenalty !== 0) {
    add(benignPatternPenalty, "local code matches a common benign Slither pattern that needs concrete impact before PoC");
  }
  if (impact.includes("no concrete impact found")) {
    add(-35, "no concrete impact identified");
  }

  if (/\b(call\.value|\.call\{|callback|on[A-Z]\w*\(|external call|transferfrom|safeTransferFrom)\b/i.test(text) && /\b(state|balance|sequence|nonce|shares|debt|supply|update|write)\b/.test(text)) {
    add(15, "external-call pattern appears near state updates");
  }
  if (!/\b(nonreentrant|onlyowner|onlybroker|onlykeeper|onlyadmin|whitelist|allowlist|approved)\b/.test(text)) {
    add(10, "no obvious guard/modifier in local context");
  }
  if (gate.skipLowInformational && SEVERITY_SCORE[finding.severity] < SEVERITY_SCORE[gate.minimumPaidSeverity]) {
    add(-35, `Slither impact is below bounty minimum ${gate.minimumPaidSeverity}`);
  }
  const lowSignalPenalty = getLowSignalRulePenalty(finding.ruleId);
  if (lowSignalPenalty !== 0) {
    add(lowSignalPenalty, "Slither rule is usually maintenance/noise unless manual review finds concrete paid impact");
  }
  if (recentChangeBoost > 0) {
    add(recentChangeBoost, "overlaps or sits near recent risky git changes");
  }

  const hasPaidSeverity = SEVERITY_SCORE[inferRawSeverityFromImpact(finding, impact)] >= SEVERITY_SCORE[gate.minimumPaidSeverity];
  const disqualifying =
    reachability.includes("owner/governance/deployer only") ||
    reachability.includes("dependency/config-only") ||
    reachability.includes("test/reader/oracle/dependency out of scope") ||
    reachability.includes("outside declared bounty scope") ||
    (isLowSignalRule(finding.ruleId) && score < 70) ||
    impact.includes("no concrete impact found");

  let pocPriority: PocPriority = "low";
  if (disqualifying && score < 70) {
    pocPriority = "low";
  } else if (score >= 70 && hasPaidSeverity) {
    pocPriority = "high";
  } else if (score >= 40) {
    pocPriority = "medium";
  }

  return { score, pocPriority, reasons };
}

function inferBountySeverity(finding: AevaFinding, impact: ImpactCategory[]): AevaSeverity | "UNCLEAR" {
  if (impact.includes("no concrete impact found")) return "UNCLEAR";
  return inferRawSeverityFromImpact(finding, impact);
}

function inferRawSeverityFromImpact(finding: AevaFinding, impact: ImpactCategory[]): AevaSeverity {
  if (impact.includes("event/indexer noise") && !impact.includes("direct asset loss") && !impact.includes("stuck funds")) {
    return "LOW";
  }
  if (impact.includes("direct asset loss") || impact.includes("liquidation/solvency impact")) {
    return finding.severity === "CRITICAL" ? "CRITICAL" : "HIGH";
  }
  if (impact.includes("stuck funds") || impact.includes("unauthorized accounting/state change") || impact.includes("persistent DoS")) {
    return "MEDIUM";
  }
  if (impact.includes("oracle/price manipulation")) {
    return "MEDIUM";
  }
  if (impact.includes("bounded griefing") || impact.includes("event/indexer noise")) {
    return "LOW";
  }
  return "INFO";
}

function buildPrivilegeAssumptions(reachability: RoleReachability[], gate: LoadedBountyGate): string[] {
  const assumptions: string[] = [];

  if (reachability.includes("owner/governance/deployer only")) {
    assumptions.push(...gate.privilegedRoleAssumptions);
  }
  if (reachability.includes("trusted keeper/broker/rebalancer reachable")) {
    assumptions.push("trusted keeper/broker/rebalancer role must be compromised or attacker-obtainable");
  }
  if (reachability.includes("dependency/config-only")) {
    assumptions.push(...gate.dependencyConfigAssumptions);
  }
  if (assumptions.length === 0) {
    assumptions.push("no privileged role assumption found in the packet context");
  }

  return [...new Set(assumptions)];
}

function describeAffectedAssetState(text: string, impact: ImpactCategory[]): string {
  if (impact.includes("direct asset loss")) {
    return "token/native asset balances or transfer authority";
  }
  if (impact.includes("stuck funds")) {
    return "withdrawal or redemption path";
  }
  if (impact.includes("unauthorized accounting/state change")) {
    return "protocol accounting/state variables";
  }
  if (impact.includes("event/indexer noise")) {
    return "event stream or off-chain indexing state";
  }
  if (/\b(sequence|nonce)\b/.test(text)) {
    return "sequence/nonce bookkeeping";
  }
  return "not identified from Slither evidence and local context";
}

function describeFlaggedPattern(finding: AevaFinding, text: string): string {
  if (/\btransferfrom\b/.test(text)) {
    return `${finding.ruleId}: transferFrom authority pattern`;
  }
  if (/\breentrant|callback|external call\b/.test(text)) {
    return `${finding.ruleId}: external callback/reentrancy pattern`;
  }
  if (/\bunchecked|return value\b/.test(text)) {
    return `${finding.ruleId}: unchecked external call/transfer result`;
  }
  if (/\bevent|emit|sequence\b/.test(text)) {
    return `${finding.ruleId}: state/event-only side effect pattern`;
  }
  return `${finding.ruleId}: ${finding.title}`;
}

function buildSmallestNextPoc(priority: PocPriority, reachability: RoleReachability[], impact: ImpactCategory[]): string {
  if (priority === "skip") {
    return "Skip PoC until manual review finds a concrete unprivileged/approved attacker path and paid impact.";
  }
  if (reachability.includes("unprivileged user reachable") && impact.includes("stuck funds")) {
    return "Write the smallest user-level call sequence that deposits/creates a balance, triggers the flagged path, then proves withdrawal or redemption is stuck.";
  }
  if (reachability.includes("unprivileged user reachable") && impact.includes("unauthorized accounting/state change")) {
    return "Write a user-level call sequence that snapshots accounting state, invokes the flagged entrypoint, and asserts unauthorized balance/share/debt mutation.";
  }
  if (impact.includes("direct asset loss")) {
    return "Write a minimal attacker-victim asset flow proving unauthorized balance movement with canonical dependencies.";
  }
  return "Write a minimal reproducer around the externally reachable entrypoint and assert the mapped paid impact, not just the Slither pattern.";
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

function getBenignPatternPenalty(ruleId: string, text: string): number {
  const normalizedRule = ruleId.toLowerCase();
  if (/\buninitialized-local\b/.test(normalizedRule)) {
    return -15;
  }
  if (
    /\bunused-return\b/.test(normalizedRule) &&
    /\b(none|\(\s*[,a-z0-9_ ]*,\s*\)|,\s*,|latestrounddata|getquota)\b/.test(text)
  ) {
    return -15;
  }
  if (
    /\bdivide-before-multiply\b/.test(normalizedRule) &&
    (/\bpercentage_factor\b/.test(text) || /\bquota(change)?\b/.test(text))
  ) {
    return -15;
  }
  return 0;
}

function getLowSignalRulePenalty(ruleId: string): number {
  if (/\b(naming-convention|dead-code|assembly|cyclomatic-complexity)\b/.test(ruleId)) {
    return -70;
  }
  if (/\b(timestamp|incorrect-equality)\b/.test(ruleId)) {
    return -25;
  }
  if (/\b(calls-loop|reentrancy-events|reentrancy-benign)\b/.test(ruleId)) {
    return -15;
  }
  return 0;
}

function isLowSignalRule(ruleId: string): boolean {
  return getLowSignalRulePenalty(ruleId) <= -70;
}
