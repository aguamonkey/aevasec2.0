import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { BountyScope } from "../triage/scope";
import { AevaFinding } from "../types/finding";
import { writeTextFile } from "../util/fs";

export type PocScaffoldOptions = {
  targetPath: string;
  finding: AevaFinding;
  targetCommit?: string;
  scope?: BountyScope;
  outFile?: string;
  forkRpcEnv?: string;
  forkBlock?: number;
  force?: boolean;
};

// Writes a Foundry test skeleton for one lead. The skeleton reverts until the
// attack and impact assertions are written, so it can never pass by accident.
export async function writePocScaffold(options: PocScaffoldOptions): Promise<{ file: string; runCommand: string }> {
  const { targetPath, finding } = options;
  if (!finding.location.file || finding.location.file === "unknown" || path.isAbsolute(finding.location.file)) {
    throw new Error("Finding has no target-relative source file; cannot scaffold a PoC");
  }
  const sourceFile = path.resolve(targetPath, finding.location.file);
  if (path.relative(targetPath, sourceFile).startsWith("..")) throw new Error("Finding source file is outside target path");

  const foundryToml = await readOptional(path.join(targetPath, "foundry.toml"));
  if (foundryToml === undefined && !options.outFile) {
    throw new Error("Target has no foundry.toml; pass --out <file> inside a Foundry project that can import the target sources");
  }
  const testDir = /^\s*test\s*=\s*['"]([^'"]+)['"]/m.exec(foundryToml ?? "")?.[1] ?? "test";
  const contractName = `${pascalCase(finding.id)}PoC`;
  const file = path.resolve(options.outFile ?? path.join(targetPath, testDir, "aevasec", `${contractName}.t.sol`));
  if (!options.force && (await exists(file))) throw new Error(`PoC file already exists: ${file} (pass --force to overwrite)`);

  const source = await readOptional(sourceFile);
  const pragma = /^\s*pragma\s+solidity\s+([^;]+);/m.exec(source ?? "")?.[1].trim() ?? "^0.8.0";
  // Slither function-level leads do not carry the contract name; the file name is the conventional guess.
  const targetContract = finding.symbol?.contract ?? path.basename(finding.location.file, ".sol");
  const deployed = options.scope?.contracts?.find((item) => item.name === targetContract && item.address);
  const importPath = toImportPath(path.relative(path.dirname(file), sourceFile));
  const bounty = finding.triage?.bounty;
  const line = finding.location.lineStart === undefined ? "" : `:${finding.location.lineStart}`;

  const setUp: string[] = [];
  if (options.forkRpcEnv) {
    setUp.push(options.forkBlock === undefined
      ? `        vm.createSelectFork(vm.envString("${options.forkRpcEnv}"));`
      : `        vm.createSelectFork(vm.envString("${options.forkRpcEnv}"), ${options.forkBlock});`);
    if (options.forkBlock === undefined) setUp.push("        // TODO: pin a block so the PoC is reproducible.");
  }
  if (deployed) {
    setUp.push(`        target = ${targetContract}(payable(vm.parseAddress("${deployed.address}")));${deployed.chain ? ` // ${deployed.chain}` : ""}`);
    if (!options.forkRpcEnv) setUp.push("        // TODO: the in-scope deployment needs a fork; re-run with --fork-rpc-env.");
  } else {
    setUp.push(`        // TODO: deploy ${targetContract} with canonical dependencies, or attach to the in-scope deployment on a fork.`);
  }
  setUp.push("        // TODO: give the victim a realistic position before the attack.");

  const content = [
    "// SPDX-License-Identifier: UNLICENSED",
    `pragma solidity ${pragma};`,
    "",
    `// aevasec PoC scaffold for ${finding.id} (${finding.ruleId})`,
    `// Lead: ${finding.location.file}${line}${finding.symbol?.function ? ` ${finding.symbol.function}()` : ""}`,
    `// Target commit: ${options.targetCommit ?? "unknown"}`,
    ...(bounty ? [
      `// Heuristic impact: ${bounty.impact.join(", ")}; reachability: ${bounty.externalReachability.join(", ")}`,
      `// Suggested PoC: ${bounty.smallestNextPoc}`
    ] : []),
    "// The triage above is a hypothesis. This test reverts until an attacker path and a measured impact are written.",
    "",
    'import {Test} from "forge-std/Test.sol";',
    `import "${importPath}";`,
    "",
    `contract ${contractName} is Test {`,
    '    address internal attacker = makeAddr("attacker");',
    '    address internal victim = makeAddr("victim");',
    `    ${targetContract} internal target;`,
    "",
    "    function setUp() public {",
    ...setUp,
    "    }",
    "",
    "    function test_poc() public {",
    "        // uint256 attackerBefore = _balance(attacker);",
    "        // uint256 victimBefore = _balance(victim);",
    "",
    "        vm.startPrank(attacker);",
    "        // TODO: attacker call sequence through an unprivileged entrypoint.",
    "        vm.stopPrank();",
    "",
    "        // TODO: assert the measured impact, then delete the revert below.",
    '        // assertGt(_balance(attacker), attackerBefore, "attacker profit");',
    '        // assertLt(_balance(victim), victimBefore, "victim loss");',
    '        revert("aevasec: PoC not implemented");',
    "    }",
    "",
    "    // Native balance by default; swap for IERC20(token).balanceOf(who) when the asset is a token.",
    "    function _balance(address who) internal view returns (uint256) {",
    "        return who.balance;",
    "    }",
    "}",
    ""
  ].join("\n");

  await writeTextFile(file, content);
  const relative = path.relative(targetPath, file);
  const runCommand = relative.startsWith("..")
    ? `forge test --match-path ${file} -vvv`
    : `forge test --root ${targetPath} --match-path ${toPosix(relative)} -vvv`;
  return { file, runCommand };
}

function pascalCase(value: string): string {
  return value.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function toImportPath(relative: string): string {
  const posix = toPosix(relative);
  return posix.startsWith(".") ? posix : `./${posix}`;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try { return await readFile(filePath, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}
