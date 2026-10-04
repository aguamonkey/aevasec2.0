# Leads Are Not Findings

**aevasec: a Solidity audit workbench, and a measured answer to how much of what gets paid static analysis actually finds.**

aevasec takes a protocol from Slither output to evidence: it normalises and triages leads, builds a function-by-function review queue from the compiler AST, scaffolds Foundry proofs of concept, records review decisions, and scores a run against independently judged contest findings.

It started as a tool for ranking Slither leads by bounty potential. Testing that idea against real code and judged findings showed the ranking does not work, and the project changed shape around what the evidence supported. This README covers what was built, what the measurements showed, and where it stands.

**Status: working and tested; development paused.** It has reproduced three publicly judged vulnerabilities end to end. It has not yet been used to find a new one.

## The short version

- Across three real audit contests, a Slither detector stated the root cause of **3 of 42** judged High/Medium findings.
- The tool's own priority score put **none** of those three in its high bucket, and every lead it ranked high on Gearbox was a **false positive**.
- The bugs that paid were logic, fee, unit and trust-model errors. Finding them took reading the code function by function, which no ranking of detector output replaces.
- Three publicly judged findings were **reproduced with passing PoCs**, so the reproduce-and-report half of the workflow does work.

## How it went

**1. Rank Slither leads.** The first version ingested Slither JSON, scored each lead with keyword heuristics (who can reach it, what impact the detector text implies, whether the code changed recently), applied a bounty programme's severity gate, and wrote a review packet per lead.

**2. Test the top of the queue.** On Gearbox core v3 the tool produced 313 leads and ranked 5 high. I reviewed all 5 against source. Every one was a false positive: trusted callees, deliberate `try/catch` probes, and functions already protected by `nonReentrant`.

**3. Test against judged findings.** To see whether the process could also be missing real issues, I ran it on three public Code4rena contests with 42 judged High/Medium findings between them: Caviar Private Pools, Wildcat and Kelp DAO. The second and third were picked on fixed criteria before any results were seen.

**4. Reproduce.** I wrote Foundry PoCs for three of the judged Caviar findings against the unmodified contest contracts, each with a control.

## What the measurements showed

| Target | Result | Evidence |
| --- | --- | --- |
| Gearbox core v3 (313 Slither leads) | All 5 leads ranked high are false positives. 13 leads reviewed, none confirmed. | Source review; nothing executed |
| Caviar, Wildcat, Kelp (224 leads, 42 judged High/Medium) | A detector states the root cause of 3 of the 42: 1 of 20, 2 of 17 and 0 of 5. One of the three is borderline. | Compared with the public judged reports |
| Same contests, aevasec scoring | Its high bucket held 3 leads, none judged. High plus medium held 14 leads, 1 judged. Slither's own High bucket held 8 leads, 2 judged. | Same comparison |
| Same contests, review surface | 40 of 42 findings touch at least one function `surface` lists, but only 32 have all their linked functions in it. On Wildcat, bugs in internal and library functions are missed. | Location only; this is not detection |
| Caviar H-01, M-02, M-03 | Reproduced with passing PoCs. H-01 drains a pool's 10 ETH. | PoC run, with controls |

Three lessons came out of this:

- **Detector leads are not a review plan.** They covered 7% of the judged findings across the three contests measured.
- **Keyword scoring made things worse than raw Slither severity.** The score was wrong at the top of the queue on both targets. I did not retune it to fit the known answers, because that would only prove it can fit two examples. Treat `PoC priority` in the output as an unvalidated heuristic.
- **Listing entrypoints is not enough either.** The review queue has to follow calls into internal and library functions, which is where nearly half of Wildcat's findings were. `surface` does not do that yet.
- **A role name is not a trust decision.** The tool penalised `onlyOwner` functions as "trusted". In Caviar any user can become a pool owner, and that penalty hid a judged High.

The two reproduced bugs that no detector saw are good examples of what reading finds: an external value read twice with an untrusted call in between (H-01), and a fee used in two places with different units (M-03). The [worked example](worked-examples/caviar-2023-04/README.md) walks through both, plus one top-ranked lead that fails and why.

Full numbers, method and reproduction commands are in [docs/triage-validation.md](docs/triage-validation.md).

## Why it is on the back burner

- **The core idea did not hold up.** The project was built to rank detector leads, and the evidence says that ranking has no value on the targets tested. What remains useful is bookkeeping around manual review.
- **The untested part is the expensive part.** The open question is whether function-by-function review with this workflow finds bugs unaided. Answering it means a blind review of a live contest, which takes concentrated hours over a one-to-four-week window.
- **The entry-level market shrank.** Code4rena, the highest-volume contest platform for newcomers, [announced its wind-down in May 2026](https://www.theblock.co/news/regulation/2026-05-13-immufefi-absorb-code4rena-bug-bounty-customers-shutdown-decision-401179). Contests continue on other platforms, but they increasingly run automated analysis themselves, so anything a detector can state is found before a newcomer gets there.
- **The payoff is slow.** Contest rewards are split among valid unique findings and are heavily skewed toward experienced researchers. As a part-time effort, the expected return did not justify the hours right now.

If it is picked up again, the plan is in [docs/future-development.md](docs/future-development.md): extend the review queue to internal and library functions, add LLM review and invariant testing as lead sources that can reason about intent, keep PoCs as the filter, and measure on a contest recent enough to be a fair test.

## What is in the repo

| Piece | What it does |
| --- | --- |
| `ingest slither` | Normalises Slither JSON, applies suppressions and a bounty gate, writes `report.md`, `report.json` and per-lead packets |
| `surface` | Lists every external/public function in scope from the compiler AST, with modifiers and attached leads: the reading queue |
| `poc` | Writes a Foundry test scaffold for a lead that fails until a real PoC is written |
| `review` | Records a reviewer's decision on a lead, tied to the target commit |
| `tests/judgedRecall.js` | Scores a saved run against independently judged findings |
| `worked-examples/caviar-2023-04` | Three reproduced judged findings and one failed lead, explained |
| `tests/exploits` | Synthetic Foundry fixtures that check the PoC harness itself |

It is not a vulnerability finder, a static analyser, or a dashboard. It does not run Slither for you.

## What you can build on

- **A judged-findings benchmark.** `tests/judgedRecall.js` and the three fixtures in `fixtures/` measure any lead source against what a contest actually paid for. `scripts/buildJudgedFixture.js` generates a fixture from a Code4rena report, so adding a contest is mostly a scan and a labelling pass; swapping in a different analyser is one ingest module.
- **A review queue from the AST.** `surface` needs only Foundry build-info, so it works on any Foundry project. The measured gap is internal and library functions; after that, per-function review tracking.
- **PoC scaffolding tied to scope.** `poc` plus the `scope` block give a fork-ready Foundry skeleton that cannot pass until it proves something.
- **A worked example to learn from.** Three real findings with PoCs, controls and the reasoning behind each.

## Limits of the evidence

- Three small contests from one platform and one audited protocol. The 3-in-42 figure may not generalise.
- Root-cause labels for detector matches are one reviewer's judgement, and one of the three matches is borderline.
- Only three of the 42 judged findings were reproduced with a PoC, all from Caviar. The rest rely on the report text.
- The reproduced findings were already public. Nothing here shows the process finding a bug unaided.

## Using it

Requires Node (developed on v22), [Slither](https://github.com/crytic/slither) and [Foundry](https://book.getfoundry.sh/).

### Install and build

```bash
npm install
npm run build
npm run typecheck
```

### Example ingest command

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

### Output files

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

### Bounty gate format

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

### Bounty dry run

See [docs/bounty-dry-run.md](docs/bounty-dry-run.md) for a practical workflow for running Slither externally, ingesting the JSON output, reviewing reports, and using packets as leads.

### Suppression format

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

### Review and validation

Bounty fields are heuristic hypotheses. Actionability remains `unclear` pending manual validation; low priority does not automatically skip a lead. Role labels use the local declaration, and unknown reachability stays `unclear`. Exclusions and deployment assumptions are displayed for manual scope review.

Run `npm test` for the regression and CLI workflow checks, or `npm run benchmark` for the eight-case Gearbox source-review benchmark (it needs a local gearbox-core-v3 checkout and is skipped without one). See [triage validation](docs/triage-validation.md) for results, limitations, saved-review commands, and run comparisons.

Save reviewer notes using `node dist/cli.js review <report.json> <finding-id> <classification> --notes <text> [--poc <reference>]`, then re-ingest. Use `--previous <report.json>` to compare exact finding identities between runs. Reports record current target commit, tracked dirty state, and scan input hash; these do not independently prove the external scan's source commit.

### Review surface

```bash
node dist/cli.js surface <report.json>
```

This writes `surface.md` and `surface.json` next to the report: every external/public function defined in the in-scope sources, with mutability, modifier names, line range, and the detector leads that fall inside it. It reads the solc ASTs in `<target>/<out>/build-info`, which Slither's compile step (or `forge build --build-info`) leaves behind. Without a declared `scope`, files under `lib`, `node_modules`, `test`, `script` and `mock` path components are dropped.

The surface is a queue of code to read. It does not detect or rank anything, it does not list internal or library functions or inherited entrypoints defined in out-of-scope files, and it does not yet record which functions have been reviewed. Across the three judged contests measured, detectors stated the root cause of 3 of 42 High/Medium findings, so the detector queue alone is not a review plan; see [triage validation](docs/triage-validation.md).

`npm run benchmark:judged -- <report.json> <judged-fixture.json>` compares a saved run with independently judged findings such as `fixtures/caviar-2023-04-judged.json`.

### PoC scaffold

```bash
node dist/cli.js poc <report.json> <finding-id> [--fork-rpc-env ETH_RPC_URL] [--fork-block <number>] [--out <file>] [--force]
```

This writes a Foundry test skeleton to `<target>/<test dir>/aevasec/<FindingId>PoC.t.sol`, importing the flagged source file and reusing its pragma. With `--fork-rpc-env` it forks from the RPC URL in that environment variable, and it attaches to the address declared in `scope.contracts` when the contract name matches. The skeleton reverts with `aevasec: PoC not implemented` until the attack and impact assertions are written, so it cannot pass by accident. Targets without a `foundry.toml` need `--out`. Existing files are not overwritten without `--force`.

`npm run test:exploits` runs the Foundry fixtures in `tests/exploits/` (it fetches a pinned forge-std into `tests/exploits/lib/` on first use). `npm test` checks that a generated scaffold compiles and fails when forge and that forge-std checkout are present.

Explicitly missing bounty files and malformed input/configuration fail with an error. Reusing an output directory removes obsolete generated `slither-N.md` packets and preserves other filenames.

## Licence and third-party code

aevasec is released under the [MIT licence](LICENSE). It does not include source from the protocols it has been run against; fixtures hold locations, detector output and review notes. The PoCs in `worked-examples/` are original test code that imports the public contest repository, which you clone separately. `docs/history/` holds the original build briefs.
