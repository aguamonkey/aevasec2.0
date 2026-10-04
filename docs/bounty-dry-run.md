# Bounty dry run

This runbook keeps Slither execution external and uses `aevasec` to normalize, prioritize, and package the results for manual review.

## 1. Create audit folders

```bash
mkdir -p ~/audits/targets ~/audits/reports ~/audits/notes
```

## 2. Clone a target

```bash
cd ~/audits/targets
git clone <repo-url> target-name
cd target-name
```

Install and build the target dependencies manually as needed. Use the target project's own README and lockfiles as the source of truth.

## 3. Run Slither externally

Full scan:

```bash
slither . --json ./slither.json
```

Lower-noise triage scan:

```bash
slither . --json ./slither.json --exclude-informational --exclude-optimization
```

Use Slither options such as `--detect`, `--exclude`, `--exclude-informational`, and `--exclude-low` when you need a more focused pass.

## 4. Ingest with aevasec

```bash
cd ~/audits/tools/aevasec
npm run build

node dist/cli.js ingest slither ~/audits/targets/target-name/slither.json \
  --target ~/audits/targets/target-name \
  --out ~/audits/reports/target-name/slither-001 \
  --bounty ~/audits/targets/target-name/.aevasec/bounty.json \
  --changes-from <last-reviewed-commit-or-tag>
```

Use `--context-lines <number>` to adjust the Solidity source window in AI packets. If `--bounty` is omitted, `aevasec` looks for `<target>/.aevasec/bounty.json`; if no metadata is available, it applies a conservative default that assumes Medium+ is the minimum paid severity and skips Low/Informational-only leads.
Use `--changes-from` when you know the last commit, tag, or release you manually reviewed. The recent-change layer compares that ref to `HEAD`, keeps the diff local, and marks each packet as overlapping, touching, near, or outside the recent Solidity diff.

Example bounty gate:

```json
{
  "schemaVersion": "1.0",
  "minimumPaidSeverity": "MEDIUM",
  "excludedImpacts": [
    "event/indexer noise without protocol or user impact",
    "malicious or non-standard dependency behavior unless accepted by deployment assumptions"
  ],
  "dependencyConfigAssumptions": [
    "canonical WETH/token/oracle/dependency deployments are honest unless bounty metadata says otherwise"
  ],
  "privilegedRoleAssumptions": [
    "owner/governance/deployer actions are trusted unless the bounty explicitly accepts privileged abuse"
  ],
  "skipLowInformational": true
}
```

## 5. Review workflow

Bounty actionability stays `unclear` until manual validation. A low priority is a ranking hint, not a closed lead. See [triage validation](triage-validation.md) for saved reviews and comparisons.

Start with `report.md` to understand the finding count, rules, severities, and suggested review order. When bounty triage is available, the suggested order sorts by PoC priority before Slither severity/confidence.

Open high and medium PoC-priority packets first. A packet is not a finding; it is a lead that points you at code worth reviewing.

Every possible issue still needs manual validation and a proof of concept. Do not submit anything without a concrete attacker path and reproducible impact.

The bounty-aware fields are:

- Flagged pattern.
- External reachability.
- Privilege assumptions.
- Affected asset/state.
- Impact mapper.
- Bounty-actionability.
- Likely severity under bounty rules.
- PoC priority.
- Smallest next PoC.

The recent-change fields are:

- Recent-change status.
- Base/head ref.
- Changed ranges.
- Risk patterns in the diff.
- Score boost applied to PoC priority.

Risk patterns currently include new public/external entrypoints, removed or changed guards, new external calls/token transfers, accounting/state changes, dependency/oracle/token configuration changes, liquidation/solvency changes, and upgradeability/storage-sensitive changes.

This would have reprioritized mux-protocol by pushing Slither HIGH leads down when they required trusted broker/keeper/rebalancer roles, bad deployment configuration, malicious/non-standard WETH or oracle behavior, or only produced event/indexer/sequence noise. The leads that should stay near the top are unprivileged or approved-user paths that can produce stuck funds, asset loss, accounting corruption, persistent DoS, liquidation/solvency impact, or oracle/price manipulation at the program's paid severity threshold.

## 6. Scaffold a PoC

Declare the program scope in `<target>/.aevasec/bounty.json` (see the README) before spending time on a lead, then:

```bash
node dist/cli.js poc ~/audits/reports/target-name/slither-001/report.json slither-18 \
  --fork-rpc-env ETH_RPC_URL --fork-block <pinned-block>
```

Run the printed `forge test` command. The scaffold fails until it contains a real attacker call sequence and a measured impact assertion. Record the outcome with `review ... --poc <path>`, whether the lead survives or dies.

## 7. Suppress known noise

Suppressions live at:

```txt
<target>/.aevasec/suppressions.json
```

Example:

```json
{
  "schemaVersion": "1.0",
  "items": [
    {
      "fingerprint": "sha256:<hash>",
      "ruleId": "SLITHER:unchecked-lowlevel",
      "reason": "Known false positive after manual review",
      "createdAt": "2026-04-27T00:00:00.000Z",
      "expiresAt": null
    }
  ]
}
```

Re-run ingestion after adding suppressions. Suppressed findings stay out of AI packet generation.
