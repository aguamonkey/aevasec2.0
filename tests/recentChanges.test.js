const assert = require("node:assert/strict");
const { classifyRecentChangeForFinding, parseGitDiff } = require("../dist/changes/gitChanges");

const diff = `diff --git a/contracts/Vault.sol b/contracts/Vault.sol
index 1111111..2222222 100644
--- a/contracts/Vault.sol
+++ b/contracts/Vault.sol
@@ -10,0 +11,5 @@ contract Vault {
+function emergencyWithdraw(address token) external {
+    token.call("");
+    balances[msg.sender] = 0;
+}
+
@@ -30,1 +35,0 @@ contract Vault {
-    onlyOwner
diff --git a/contracts/Oracle.sol b/contracts/Oracle.sol
index 3333333..4444444 100644
--- a/contracts/Oracle.sol
+++ b/contracts/Oracle.sol
@@ -4,1 +4,1 @@ contract Oracle {
-    address public oldFeed;
+    address public priceFeed;
`;

const files = parseGitDiff(diff);
assert.equal(files.length, 2);

const vault = files.find((file) => file.file === "contracts/Vault.sol");
assert.ok(vault);
assert.ok(vault.riskPatterns.includes("new public/external entrypoint"));
assert.ok(vault.riskPatterns.includes("new external call or token transfer"));
assert.ok(vault.riskPatterns.includes("accounting or state mutation changed"));
assert.ok(vault.riskPatterns.includes("guard/modifier removed or changed"));

const oracle = files.find((file) => file.file === "contracts/Oracle.sol");
assert.ok(oracle);
assert.ok(oracle.riskPatterns.includes("dependency/oracle/token configuration changed"));

const recentChanges = {
  available: true,
  baseRef: "abc123",
  headRef: "HEAD",
  files
};

const finding = {
  id: "slither-1",
  schemaVersion: "1.0",
  source: { tool: "slither", sourceRuleId: "unchecked-lowlevel" },
  ruleId: "SLITHER:unchecked-lowlevel",
  title: "unchecked-lowlevel",
  severity: "HIGH",
  confidence: "HIGH",
  location: { file: "contracts/Vault.sol", lineStart: 12, lineEnd: 13 },
  evidence: { description: "Unchecked low-level call." },
  fingerprint: { algorithm: "sha256", value: "x", input: "x" },
  status: "OPEN"
};

const triage = classifyRecentChangeForFinding(finding, recentChanges);
assert.equal(triage.status, "overlaps recent diff");
assert.ok(triage.scoreBoost >= 25);
assert.ok(triage.summary.includes("risky changes"));

const oldFinding = {
  ...finding,
  id: "slither-2",
  location: { file: "contracts/Unchanged.sol", lineStart: 1, lineEnd: 1 }
};
const oldTriage = classifyRecentChangeForFinding(oldFinding, recentChanges);
assert.equal(oldTriage.status, "pre-existing");
assert.equal(oldTriage.scoreBoost, 0);

console.log("recent changes regression tests passed");
