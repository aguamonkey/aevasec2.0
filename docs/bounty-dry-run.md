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
  --out ~/audits/reports/target-name/slither-001
```

Use `--context-lines <number>` to adjust the Solidity source window in AI packets.

## 5. Review workflow

Start with `report.md` to understand the finding count, rules, severities, and suggested review order.

Open packets for HIGH and MEDIUM findings first. A packet is not a finding; it is a lead that points you at code worth reviewing.

Every possible issue still needs manual validation and a proof of concept. Do not submit anything without a concrete attacker path and reproducible impact.

## 6. Suppress known noise

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
