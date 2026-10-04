# aevasec

`aevasec` is a local, Mac-first workbench for Solidity audit work. It ingests Slither JSON, builds a function-level review queue, scaffolds Foundry PoCs, and records review decisions. It began as a tool for ranking Slither leads; the measurements below are why it no longer treats that ranking as the audit.

## What we found

These are the results so far, with the kind of evidence behind each. Details and reproduction commands are in [docs/triage-validation.md](docs/triage-validation.md).

| Target | Result | Evidence |
| --- | --- | --- |
| Gearbox core v3 (313 Slither leads) | All 5 leads the tool ranked high are false positives. 13 leads reviewed, none confirmed. | Source review; nothing executed |
| Caviar Private Pools, Code4rena 2023-04 (92 leads, 20 judged High/Medium findings) | A Slither detector states the root cause of 1 of the 20 (M-02). The other 19 are logic, fee, cast and trust-model bugs with no detector. | Compared with the public judged report |
| Caviar, aevasec scoring | The one true lead was Slither High; aevasec ranked it `low`. Its high and medium buckets held 4 leads, none judged. | Same comparison |
| Caviar, review surface | All 20 judged findings sit in functions the `surface` command lists (26 state-changing, 14 view/pure). | Location only; this is not detection |
| Caviar H-01, M-02, M-03 | Reproduced with passing PoCs against the unmodified contest contracts. H-01 drains a pool's 10 ETH. | PoC run, with controls |

What follows from this:

- **Detector leads are not a review plan.** On the one judged contest measured, they covered 5% of what was paid.
- **The keyword score has no measured value.** It was wrong at the top of the queue on both targets and has not been retuned to fit them. Treat `PoC priority` as an unvalidated heuristic.
- **A role name is not a trust decision.** The `onlyOwner` penalty hid a judged High in Caviar, where any user can become a pool owner.
- **No original vulnerability has been found.** The three reproduced findings were already public. Whether this process finds bugs unaided is untested.

The practical workflow is therefore: run `surface`, read each function, use detector leads as hints, and prove anything promising with a PoC. The [Caviar worked example](worked-examples/caviar-2023-04/README.md) shows what that evidence looks like and why one top-ranked lead fails.

Limits: one small contest and one audited protocol; root-cause labels are one reviewer's judgement; 17 of the 20 Caviar locations rest on the report text.

## What it is not

- It is not a vulnerability finder. It organises review and evidence.
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
  --out ./reports/demo \
  --bounty ./fixtures/mux-bounty-gate.json \
  --changes-from <previous-audited-ref>
```

If `--target` is omitted, it defaults to the current working directory. If `--out` is omitted, it defaults to `<cwd>/aevasec-report`.
If `--bounty` is omitted, `aevasec` looks for `<target>/.aevasec/bounty.json`; if that is missing, it uses a conservative Medium+ default.
If `--changes-from` is provided, `aevasec` compares that git ref to `HEAD` in the target repo and annotates packets with recent-change context.

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
Packets also include bounty-aware triage fields: flagged pattern, external reachability, privilege assumptions, affected asset/state, bounty actionability, likely bounty severity, PoC priority, and the smallest next PoC if the packet is worth pursuing.
When `--changes-from` is enabled, packets also show whether the lead was overlapping, touching, near, or outside the recent Solidity diff. Overlap does not prove a finding was introduced by the change. Risky recent changes such as new external entrypoints, removed guards, new external calls, accounting mutations, dependency/oracle config changes, and upgradeability/storage-sensitive changes can boost PoC priority.

## Bounty gate format

The bounty gate is intentionally small and target-specific:

```json
{
  "schemaVersion": "1.0",
  "minimumPaidSeverity": "MEDIUM",
  "excludedImpacts": ["Low/Informational event-only issues"],
  "dependencyConfigAssumptions": ["canonical WETH/token/oracle dependencies are honest"],
  "privilegedRoleAssumptions": ["owner/governance/deployer are trusted"],
  "skipLowInformational": true
}
```

An optional `scope` block records what the program actually covers:

```json
{
  "schemaVersion": "1.0",
  "scope": {
    "inScopePaths": ["contracts"],
    "outOfScopePaths": ["contracts/test/**"],
    "deployedCommit": "b038597d",
    "contracts": [{ "name": "GaugeV3", "address": "0x...", "chain": "mainnet" }],
    "knownIssues": ["2025 audit M-01: quota rounding"]
  }
}
```

A bare path matches everything beneath it; `*` matches within one path component and `**` across components. Leads outside the declared paths are labelled `outside declared bounty scope` and demoted. If the target commit differs from `deployedCommit`, the report records a `scope` error: a lead in the repo may not exist on the deployment. `contracts` and `knownIssues` are shown in `report.md` and are not checked against the chain or against findings.

This layer ranks packets for manual review. It does not prove exploitability, and it does not treat Slither severity as bounty severity.

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

## Review and validation

Bounty fields are heuristic hypotheses. Actionability remains `unclear` pending manual validation; low priority does not automatically skip a lead. Role labels use the local declaration, and unknown reachability stays `unclear`. Exclusions and deployment assumptions are displayed for manual scope review.

Run `npm test` for the regression and CLI workflow checks, or `npm run benchmark` for the eight-case Gearbox source-review benchmark (it needs a local gearbox-core-v3 checkout and is skipped without one). See [triage validation](docs/triage-validation.md) for results, limitations, saved-review commands, and run comparisons.

Save reviewer notes using `node dist/cli.js review <report.json> <finding-id> <classification> --notes <text> [--poc <reference>]`, then re-ingest. Use `--previous <report.json>` to compare exact finding identities between runs. Reports record current target commit, tracked dirty state, and scan input hash; these do not independently prove the external scan's source commit.

## Review surface

```bash
node dist/cli.js surface <report.json>
```

This writes `surface.md` and `surface.json` next to the report: every external/public function defined in the in-scope sources, with mutability, modifier names, line range, and the detector leads that fall inside it. It reads the solc ASTs in `<target>/<out>/build-info`, which Slither's compile step (or `forge build --build-info`) leaves behind. Without a declared `scope`, files under `lib`, `node_modules`, `test`, `script` and `mock` path components are dropped.

The surface is a queue of code to read. It does not detect or rank anything, it does not list inherited entrypoints defined in out-of-scope files, and it does not yet record which functions have been reviewed. On the one judged contest measured so far, detectors stated the root cause of 1 of 20 High/Medium findings, so the detector queue alone is not a review plan; see [triage validation](docs/triage-validation.md).

`npm run benchmark:judged -- <report.json> <judged-fixture.json>` compares a saved run with independently judged findings such as `fixtures/caviar-2023-04-judged.json`.

## Worked example

[worked-examples/caviar-2023-04](worked-examples/caviar-2023-04/README.md) reproduces three publicly judged findings against the real contest contracts and explains one detector lead that fails. Start there to see what evidence for a finding looks like.

## PoC scaffold

```bash
node dist/cli.js poc <report.json> <finding-id> [--fork-rpc-env ETH_RPC_URL] [--fork-block <number>] [--out <file>] [--force]
```

This writes a Foundry test skeleton to `<target>/<test dir>/aevasec/<FindingId>PoC.t.sol`, importing the flagged source file and reusing its pragma. With `--fork-rpc-env` it forks from the RPC URL in that environment variable, and it attaches to the address declared in `scope.contracts` when the contract name matches. The skeleton reverts with `aevasec: PoC not implemented` until the attack and impact assertions are written, so it cannot pass by accident. Targets without a `foundry.toml` need `--out`. Existing files are not overwritten without `--force`.

`npm run test:exploits` runs the Foundry fixtures in `tests/exploits/` (it fetches a pinned forge-std into `tests/exploits/lib/` on first use). `npm test` checks that a generated scaffold compiles and fails when forge and that forge-std checkout are present.

Explicitly missing bounty files and malformed input/configuration fail with an error. Reusing an output directory removes obsolete generated `slither-N.md` packets and preserves other filenames.

## Licence and third-party code

aevasec is released under the [MIT licence](LICENSE). It does not include source from the protocols it has been run against; fixtures hold locations, detector output and review notes. The PoCs in `worked-examples/` are original test code that imports the public contest repository, which you clone separately. `docs/history/` holds the original build briefs.
