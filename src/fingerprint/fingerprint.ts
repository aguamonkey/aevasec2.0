import { createHash } from "node:crypto";
import { normalizeFingerprintPart } from "../util/normalize";

export function buildFingerprint(inputParts: Array<string | number | undefined | null>): {
  algorithm: "sha256";
  value: string;
  input: string;
} {
  const input = inputParts.map(normalizeFingerprintPart).join("|");
  const hash = createHash("sha256").update(input).digest("hex");

  return {
    algorithm: "sha256",
    value: `sha256:${hash}`,
    input
  };
}
