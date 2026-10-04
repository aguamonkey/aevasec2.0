# Worked example: Caviar Private Pools (Code4rena 2023-04)

Three publicly judged findings reproduced against the real contest contracts, plus one detector lead that fails, with the reasoning for each. These were known answers: the PoCs show how to get from a suspicion to measured evidence. They do not show that this process would have found the bugs unaided.

Run them with `sh worked-examples/caviar-2023-04/run.sh` (needs the contest repo at `targets/caviar-2023-04`, built once). The script copies `poc/` into the checkout's `test/aevasec/` and runs `forge test`. Five tests pass.

Setup notes that affect how far to trust the result:

- The PoCs deploy the real `Factory`, `PrivatePool`, `EthRouter` and `RoyaltyRegistry` and create pools through `Factory.create`. Nothing in `src/` is modified.
- The NFT collection is written for the PoC. Its royalty is settable by its admin, which ERC-2981 permits and the judged report assumes.
- One out-of-scope library (`reservoirprotocol/oracle`) is gone upstream and is a compile-only stub in the checkout. The PoCs disable the stolen-NFT oracle, so the stub is never called.
- The contest repo has no fixed revision, so the controls are behavioural: the same call sequence without the malicious step.

## H-01: royalty receiver can drain a pool (`PrivatePool.buy`)

**What to notice when reading.** `buy` calls `_getRoyalty` in two separate loops: the first adds the royalty to what the buyer owes, the second pays it out. Between them the function sends ETH to `msg.sender` (the excess refund). Any time a function reads an external value twice with a call to an untrusted address in between, ask whether the value can change in that gap.

**Why it is exploitable.** The royalty comes from the NFT collection, and the collection's royalty admin can be the buyer. The buyer is charged with the royalty at 0, raises it to 100% inside the refund callback, and is then paid a royalty equal to the full sale price out of the pool's own ETH. Selling the NFT back completes the round.

**Measured.** `test_H01_royaltyRecipientDrainsPool`: after four rounds the pool's ETH goes from 10 to 0, the attacker's from 3 to 13, and the pool still holds all five NFTs. Control `test_H01_control_noProfitWithoutRoyaltyChange`: the same round without the callback change leaves both balances unchanged.

**Why no detector fired.** Slither's reentrancy detectors look for the contract's own storage being written after an external call. Here the value that changes lives in another contract. The pattern is "stale external read", and it has to be found by reading.

## M-03: flash fee charged in wei (`PrivatePool.flashFee`)

**What to notice.** The state variable comment says `changeFee` is 4-decimal fixed point: `0.0025 ETH = 25`. `changeFeeQuote` scales it by `10 ** (18 - 4)`. `flashFee` returns `changeFee` unscaled. When one number is used in two places, compare the units at each use.

**Measured.** `test_M03_flashLoanChargesWeiInsteadOfScaledFee`: with `changeFee = 25`, `changeFeeQuote(1e18)` returns 0.0025 ETH and `flashFee` returns 25 wei; a flash loan of a pool NFT succeeds with 25 wei paid.

**Why no detector fired.** Nothing is syntactically wrong. The bug only exists relative to the documented meaning of the variable.

## M-02: router cannot do two changes (`EthRouter.change`)

**What to notice.** `change{value: msg.value}` sits inside a `for` loop. `msg.value` is constant for the whole transaction, but the router's balance drops after the first pool keeps its fee.

**Measured.** `test_M02_twoChangesAlwaysRevert`: two changes revert both with the exact fee total and with a 1 ETH surplus; the trace shows `OutOfFunds` on the second forward. Control `test_M02_control_singleChangeSucceeds`: one change works and costs exactly 0.0025 ETH.

**Detector.** Slither's `msg-value-loop` (lead `slither-2`) states this root cause. It is the only one of the 20 judged findings a detector stated. Detector output still needed the PoC: the detector cannot tell a revert from a loss of funds, and the judged severity (Medium, broken functionality) comes from knowing which.

## A lead that fails: `slither-11`, reentrancy in `PrivatePool.sell`

This was aevasec's top-ranked lead on the target (score 90, the only `high`).

**The claim.** `sell` calls `stolenNftOracle.validateTokensAreNotStolen(...)` and writes `virtualBaseTokenReserves` afterwards, so a reentrant call could act on stale reserves.

**Why it fails.** Reentrancy needs the attacker to run code during the call. `stolenNftOracle` is `immutable`, set by the protocol when the pool implementation is deployed. A seller cannot choose it, and a pool owner cannot change it. Unless the protocol's own oracle is malicious, no attacker code runs in that gap. This is a source-review conclusion: it was not tested, and it does not match any judged High or Medium finding.

**The lesson from the pair.** H-01 and this lead are both "external call in the middle of a trade". The useful questions are who controls the callee, and what the function relies on that the callee could change. In `sell` the answers are "the protocol" and "nothing reachable". In `buy` they are "the buyer" and "the royalty rate".

## Writing it up

Each judged finding above maps onto the structure a bounty or contest report needs: one-sentence root cause with file and function, the attacker's preconditions, the call sequence, the measured impact from the PoC, and the control. If a section cannot be filled in from evidence, the finding is not ready to submit.
