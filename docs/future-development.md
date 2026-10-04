# Future development

Where this project would go next, and why. It follows from the measurements in [triage validation](triage-validation.md): across three judged contests, Slither detectors stated the root cause of 3 of 42 High/Medium findings.

## Why better ranking is the wrong next step

- **The limit is the lead source.** A perfect scorer over Slither's output would still cap at 3 of 42. Ranking cannot recover what was never detected.
- **Most paid bugs are not code patterns.** The other 39 findings are wrong units, values read twice around an untrusted call, arguments in the wrong order, and rules from the protocol's documentation that the code does not enforce. The code is only wrong relative to what the protocol is meant to do.
- **Intent is not in the code.** Whether an owner is trusted or a fee should scale with decimals comes from docs, comments and the economic design.

## What would be more accurate

Each of these plugs into the existing ingest, surface and PoC pieces, and the judged-findings benchmark can measure each one.

### 1. Extend the review surface to internal and library functions

This is the measured gap. On Wildcat only 8 of 17 findings had every linked function in the surface, because the bugs sat in internal and library code.

- Walk the call graph from each external entrypoint and list the internal and library functions it reaches.
- Group the queue by entrypoint, so a reviewer reads a whole call path at once.
- Add per-function review tracking (read, notes, PoC link), tied to the target commit like lead reviews are now.

### 2. LLM review, function by function

A model can reason about intent, which is where the missed findings are.

- For each function, assemble its source, callers, callees, the state it touches and the relevant protocol documentation.
- Ask targeted questions drawn from the reproduced findings: what external value is read more than once, who controls each callee, do the units match at every use, which documented rule does this function enforce.
- Emit hypotheses in the same finding format as Slither leads, as a new ingest source, so reports, reviews and the benchmark work unchanged.

### 3. Invariant and fuzz testing

- State properties the protocol must hold, such as "the pool never pays out more than it took in".
- Let Foundry invariant tests, Echidna or Medusa search for call sequences that break them.
- A broken invariant is a failing test, so it is a reproduced finding by construction. The Caviar pool drain is the kind of bug this catches.

### 4. PoC as the filter

Whatever generates hypotheses, nothing counts until a test proves it. The `poc` scaffold already fails until a real attack and impact assertion are written. Extend it to scaffold from a surface function or an LLM hypothesis, not only from a Slither lead.

## How to measure it fairly

- **Use contests judged after the model's training cutoff, or a live one.** The three contests in `fixtures/` are public and almost certainly in model training data, so an LLM "finding" them proves little. They remain a fair test for detectors and fuzzers.
- **Write hypotheses before the judged report is opened**, then score with `tests/judgedRecall.js`.
- **Report precision as well as recall.** Count how many hypotheses were raised per valid finding, since each one costs verification time.
- **Add contests with `scripts/buildJudgedFixture.js`.** More contests, and platforms other than Code4rena, would show whether 7% generalises.

## Known limits of this direction

- LLM review is noisy and will produce plausible false positives. The expectation is that it beats 7% recall; by how much is unmeasured.
- Running it costs API usage per codebase plus time writing PoCs for candidates.
- Published AI-auditing results find a portion of the bugs, not most. This raises the floor and does not replace someone understanding the protocol.

## Smaller open items

- Decide what to do with the keyword score. It has no measured value; the options are to remove it or keep it as a clearly labelled heuristic column.
- Reproduce more of the judged findings. Only 3 of 42 have PoCs, all from Caviar.
- Run Slither from the CLI instead of requiring a separate scan step.
