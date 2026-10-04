#!/bin/sh
# Copies the PoCs into the contest checkout and runs them against the real in-scope contracts.
# Usage: sh worked-examples/caviar-2023-04/run.sh [path-to-2023-04-caviar-checkout]
set -e
here="$(cd "$(dirname "$0")" && pwd)"
target="${1:-$here/../../targets/caviar-2023-04}"
[ -f "$target/src/PrivatePool.sol" ] || { echo "Caviar checkout not found at $target" >&2; exit 1; }
rm -rf "$target/test/aevasec"
mkdir -p "$target/test/aevasec"
cp "$here"/poc/*.sol "$target/test/aevasec/"
forge test --root "$target" --match-path 'test/aevasec/*' -vv
