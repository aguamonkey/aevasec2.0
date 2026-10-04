# Triage validation milestone

The tool now treats bounty triage as a heuristic review order. It does not prove reachability, impact, severity, or bounty eligibility. Automatic actionability stays `unclear`; a low score does not automatically skip or close a lead. Explicit suppressions remain separate from reviewer notes.

## Gearbox source-review benchmark

`fixtures/gearbox-review-benchmark.json` contains eight selected real Slither leads from gearbox-core-v3 commit `b038597d9070d9fd18593a6ae9c3d28ca931bb73`. It stores locations and review conclusions only; the target's source is BUSL-1.1 licensed and is read from a local checkout. Reviews were performed through agent source inspection. No case is a confirmed vulnerability, and no exploit PoC was run. `KNOWN_PATTERN` refers only to the reviewed detector pattern, not a security guarantee for the enclosing function.

| Lead | Source-review conclusion | Previous priority | New priority |
| --- | --- | --- | --- |
| slither-1 | Facade-gated transferFrom; caller path needs review | skip | medium |
| slither-29 | Zero-initialized quota accumulator | skip | low |
| slither-40 | Configurator-only adapter operation; invariants need review | high | low |
| slither-41 | Intentionally discarded tuple component | skip | medium |
| slither-2 | Borrow-rate rounding requires quantified impact | skip | low |
| slither-15 | Guarded debt management requires cross-function review | medium | medium |
| slither-16 | Staking withdrawal callbacks require review | skip | medium |
| slither-92 | Internal voting loop requires caller/failure analysis | skip | low |

Run `npm run benchmark` with gearbox-core-v3 cloned at that commit into `targets/gearbox-core-v3` (or set `AEVASEC_GEARBOX_TARGET`); without a checkout the benchmark is skipped. The benchmark excludes Git score boosts to isolate local triage behavior. The previous priorities come from the existing saved report and included its scan configuration; they are historical observations, not a controlled before/after experiment.

Two selected uncertain callback leads previously skipped now remain in review. Removing automatic skips makes this property true by design, so it does not measure vulnerability recall. The intentionally ignored tuple component still ranks medium: noise reduction needs further calibration.

A full re-ingestion of the existing 313-lead Gearbox scan with the configured bounty gate and `v1.50.0-next.49` diff produced 5 high, 183 medium, and 125 low priorities. The earlier saved report had 78 high, 24 medium, 8 low, and 203 skip. This is a more conservative queue, not evidence of reduced review time. Eight source-review decisions are saved locally in the target's `.aevasec/reviews.json` and included in `reports/gearbox-core-v3/validation-001/`.

## Save a review

```bash
node dist/cli.js review /absolute/path/report.json slither-16 NEEDS_CONTEXT \
  --notes "Check voting callback paths and guards" \
  --poc "notes/staking-poc.sol"
```

Classifications are `REAL_INTERESTING`, `FALSE_POSITIVE`, `KNOWN_PATTERN`, `NEEDS_CONTEXT`, and `OUT_OF_SCOPE`. Notes are required. `--poc` is an optional reference, not proof that a PoC passed. `REAL_INTERESTING` also does not mean confirmed exploitability.

Reviews live in `<target>/.aevasec/reviews.json`. Re-ingest to include them in reports and packets. They match both rule and exact fingerprint, and Git-bound reviews only apply to the same commit. Reviews do not automatically suppress findings or override heuristic severity. A tracked dirty target is rejected when saving a review. Non-Git targets support fingerprint-only decisions.

## Compare runs

```bash
node dist/cli.js ingest slither scan.json --target /absolute/path/target \
  --out /absolute/path/new-run --previous /absolute/path/old-run/report.json
```

The comparison reports exact fingerprint matches, new identities, and absent identities. Fingerprints include line numbers and detector descriptions; line shifts can therefore look like added/absent leads. This preserves existing suppression compatibility and avoids silently carrying decisions onto changed evidence. Absence does not prove remediation. Cross-commit matching remains future work.

Reports record ingestion time, current target Git commit, tracked dirty state, scan input SHA-256, and resolved diff commits. This identifies the ingestion inputs; it does not prove the external scan was generated from that commit. Keep the original scan provenance with your audit notes. Untracked files are not included in the dirty flag.

## Next validation work

Add independently validated exploit-positive cases and measured impact PoCs, then evaluate top-of-queue recall and time spent per lead. Review the five current high-priority Gearbox packets first, and sample medium/low leads to check what the ranking misses. The current benchmark is a regression set, not a representative security accuracy evaluation.

## High-priority queue review (2026-10-04)

The five leads ranked high in `validation-001` were reviewed against source at commit `b038597d`. All five are false positives. No PoC was warranted for any of them.

| Lead | Location | Conclusion |
| --- | --- | --- |
| slither-18 | `GaugeV3._vote` | Callee is the pool's own quota keeper, which only calls back the view `getRates`. Updating vote totals after the epoch rate snapshot is the intended ordering. |
| slither-19 | `GaugeV3._unvote` | Same path as slither-18. |
| slither-21 | `GearStakingV3._multivote` | Every entrypoint is `nonReentrant`; `available` is debited before `vote` and credited after `unvote`; voting contracts are governance-allowlisted. |
| slither-51 | `CreditManagerV3` constructor | `try getPrice(...) returns (uint256) {} catch { revert }` is a deliberate feed-existence probe. |
| slither-56 | `CreditConfiguratorV3._addCollateralToken` | `try balanceOf(...)` is a deliberate ERC-20 sanity probe on a configurator-only path. |

The decisions are saved in the target's `.aevasec/reviews.json`. Re-ingesting into `validation-002` with the current heuristics gives 0 high, 173 medium, and 140 low, with identical finding identities. Top-of-queue precision on this target is therefore 0 of 5, and the current ranking produces no high bucket at all. Thirteen of 313 leads are reviewed; none is confirmed.

## Judged-contest recall across three contests (2026-10-04)

Two more contests were added after Caviar. They were chosen before any results were seen, on fixed criteria: a public Code4rena contest, a Foundry repo that builds, a primary judged report available as text, and a codebase small enough to label by hand. Wildcat and Kelp were the first two candidates tried and both were used.

| | Caviar 2023-04 | Wildcat 2023-10 | Kelp 2023-11 | Total |
| --- | --- | --- | --- | --- |
| Judged High/Medium findings | 20 | 17 | 5 | 42 |
| Slither leads | 92 | 105 | 27 | 224 |
| Detector states a judged root cause | 1 | 2 | 0 | 3 (7%) |
| aevasec high priority: leads / judged | 1 / 0 | 2 / 0 | 0 / 0 | 3 / 0 |
| aevasec high + medium: leads / judged | 4 / 0 | 8 / 1 | 2 / 0 | 14 / 1 |
| Slither High impact: leads / judged | 7 / 1 | 1 / 1 | 0 / 0 | 8 / 2 |
| Slither High + Medium: leads / judged | 15 / 1 | 23 / 2 | 4 / 0 | 42 / 3 |
| Findings with every linked function in the surface | 20 | 8 | 4 | 32 |
| Findings with at least one linked function in the surface | 20 | 15 | 5 | 40 |

What the two extra contests changed:

- **The detector result held.** Three of 42 judged findings have a detector that states the root cause: Caviar M-02 (`msg-value-loop`), Wildcat M-11 (`unchecked-transfer`) and Wildcat M-06 (`unused-return`). M-06 is borderline: the detector reports an ignored return value and does not say the call can fail. Without it the total is 2 of 42.
- **aevasec's score still adds nothing.** Its high bucket is 0 for 3 across the contests. On Wildcat it ranked the M-11 lead third of 105 (`medium`), its first correct placement, and ranked the M-06 lead `low`. Slither's own High bucket was 2 for 8.
- **The surface is incomplete, which Caviar hid.** On Wildcat only 8 of 17 findings have every linked function in the surface, and 2 have none, because the bugs sit in internal and library functions (`_getUpdatedState`, `FeeMath`, `LibStoredInitCode`). The 20 of 20 on Caviar reflected that contract's flat structure. A reading queue has to include internal and library functions reachable from the entrypoints; `surface` does not do that yet.

Method notes for the two new fixtures (`fixtures/wildcat-2023-10-judged.json`, `fixtures/kelp-2023-11-judged.json`):

- `scripts/buildJudgedFixture.js` generated them from the primary `report.md`: IDs and titles from the headings, locations from the functions enclosing every source line a finding links to. `src/` is byte-identical between the commits the reports link and the pinned ones.
- Linked functions include context as well as the defect, so "locations" is a superset of where the bug is. That makes the surface measure generous and the "lead in the same function" measure weak.
- Three findings have no source links (Wildcat M-10, Kelp H-01 and H-02) and were located from the prose; they are marked `locationSource: "prose"`.
- Detector labels were assigned by reading every lead co-located with each finding (`npm run benchmark:judged -- <report> <fixture> --worksheet`). They are one reviewer's judgement.
- Kelp's `foundry.toml` points `src` at a directory that does not exist, so Slither was run with `--foundry-compile-all`. Both scans used `--filter-paths "lib|test|script|node_modules"`.
- Nothing from Wildcat or Kelp was reproduced with a PoC.

## Judged-contest recall: Caviar Private Pools (2026-10-04)

This is the first check against findings judged by someone else. The target is the public Code4rena 2023-04 Caviar repository at commit `5c87f7d6`, with 3 High and 17 Medium findings in the public report. Ground truth is `fixtures/caviar-2023-04-judged.json`. It was later checked against the primary report text: all 20 titles match, `src/` is byte-identical between the commit the report links and the pinned one, and three locations were corrected (M-10, M-12, M-13). The headline numbers did not change. One out-of-scope dependency (`reservoirprotocol/oracle`) no longer exists upstream and was replaced by a compile-only stub in the local checkout.

| Measure | Result |
| --- | --- |
| Slither leads | 92 (7 High, 8 Medium, 50 Low, 27 Informational) |
| Detector states a judged root cause | 1 of 20 (M-02, `msg-value-loop`) |
| Detector flags the site only | 1 of 20 (H-02, `low-level-calls` on `execute`) |
| aevasec high priority | 1 lead, 0 judged |
| aevasec high + medium priority | 4 leads, 0 judged |
| Slither High impact, unranked | 7 leads, 1 judged |
| Judged findings located in the review surface | 20 of 20 (26 state-changing + 14 view/pure entrypoints) |

What this shows:

- Detector recall on judged issues was 5%. The other 19 are logic, accounting, fee, rounding, cast and trust-model bugs with no detector.
- aevasec's scoring made the result worse than raw Slither severity. The one true lead was Slither High and aevasec ranked it `low`, because the detector text contains no impact keyword and `no concrete impact found` forces low priority.
- The `onlyOwner` penalty hid a judged High. In Caviar the pool owner is any user who creates a pool, so "owner is trusted" is false there. Role trust is a property of the protocol, and a modifier name cannot establish it.
- All 20 findings sit in 12 external functions, which is why the `surface` command exists. Surface membership is a statement about where to read. It is not detection, and listing every function trivially reaches 100%.

Combined with the Gearbox queue below (0 of 5 high-priority leads real), the keyword score has no measured positive value on either target. It has not been retuned in response: changing weights so that M-02 ranks high would fit one example. Whether to keep, demote, or remove the score is an open decision.

Limits of this measurement: one small contest; root-cause labels are one reviewer's judgement; leads were compared with High/Medium findings only, so a lead that matches a judged QA issue counts as unmatched; only three of the 20 were reproduced with a PoC, so the other 17 locations rest on the report text.

Reproduce with:

```bash
node dist/cli.js surface reports/caviar-2023-04/slither-001/report.json
npm run benchmark:judged -- reports/caviar-2023-04/slither-001/report.json fixtures/caviar-2023-04-judged.json
```

## Evidence classes used in this document

- **Synthetic demonstration:** `tests/exploits/` fixtures written for this repo.
- **Detector claim:** a Slither lead and the heuristic fields aevasec attaches to it.
- **Source-review conclusion:** the Gearbox review decisions. A reviewer read the code; nothing was executed.
- **Independently judged finding:** the Caviar contest report. Judged by the contest, not reproduced here.
- **Reproduced vulnerability:** a PoC run in this workspace against real target code. There are three, all previously judged public findings from the Caviar contest (H-01, M-02, M-03); see `worked-examples/caviar-2023-04/`. None is a new discovery, and none was found by this process without knowing the answer.

## Exploit fixtures

`tests/exploits/` holds three synthetic Foundry fixtures run by `npm run test:exploits`: a reentrancy drain with a fixed-revision negative control, a forced-ether withdrawal lockup, and an ineffective swap deadline. They prove the PoC harness works. They are written for this repo, so they are not the independently validated exploit-positive cases described below.

## Evidence calibration

Impact labels now use the rule ID, title, and detector description only. Local source still informs modifier checks, pattern descriptions, and review scoring, but ordinary operations such as transfers, reverts, and emits no longer establish an impact category. Detector text can itself contain identifiers or overstate impact, so these labels remain hypotheses requiring review.

Test/mock/fixture/interface path components, conventional filename prefixes, and `.t.sol` suffixes suggest an out-of-scope surface. Incidental substrings such as `LatestVault.sol` do not. Adapter and oracle filenames alone do not establish dependency-only reachability; integration contracts may be core in-scope code. Explicit role modifiers still inform reachability.

The regression suite includes positive detector-description controls for every impact category and negative source-identifier controls. These are synthetic classification checks, not independently validated exploit-positive cases. The Gearbox rounding lead now ranks low because its source accounting identifiers no longer supply impact evidence; the selected callback leads remain in review. Historical full-scan counts above have not been regenerated with this calibration.

Independently validated exploit-positive fixtures remain outstanding. Each future case should include the original independent report, a pinned vulnerable revision, a runnable PoC with measured victim/protocol loss or other concrete impact, and a fixed-revision negative control. A detector keyword assertion alone does not meet that standard.
