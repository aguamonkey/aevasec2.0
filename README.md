# aevasec

`aevasec` is a local Mac-first Solidity audit triage orchestrator. It ingests external tool output, normalizes findings, applies suppression memory, writes reports, and generates focused AI review packets.

The first supported ingestion source is Slither JSON.

## What it is not

- It is not a web dashboard.
- It is not a custom Solidity static analyzer.
- It does not run Slither internally yet.
- It does not add symbolic execution, fuzzing, a database, SaaS/server code, or plugin architecture.

## Install and build

```bash
npm install
npm run build
npm run typecheck
```

## Example ingest command

```bash
node dist/cli.js ingest slither ./fixtures/slither-sample.json \
  --target ./example-target \
  --out ./reports/demo
```

If `--target` is omitted, it defaults to the current working directory. If `--out` is omitted, it defaults to `<cwd>/aevasec-report`.

## Output files

The ingest command writes:

```txt
report.json
report.md
packets/
  slither-1.md
  slither-2.md
  ...
```

AI review packets are generated only for open findings.

Packets include source-aware Solidity context when the Slither finding maps to a readable file under the target path. Use `--context-lines <number>` to adjust the source window.

## Bounty dry run

See [docs/bounty-dry-run.md](docs/bounty-dry-run.md) for a practical workflow for running Slither externally, ingesting the JSON output, reviewing reports, and using packets as leads.

## Suppression format

Suppressions are read from:

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
      "reason": "Known false positive",
      "createdAt": "2026-04-27T00:00:00.000Z",
      "expiresAt": null
    }
  ]
}
```

A finding is suppressed only when the fingerprint and rule ID both match and the suppression is not expired.

## Next phase

Internal Slither execution is still intentionally not implemented. This v1 supports only direct ingestion of existing Slither JSON.
