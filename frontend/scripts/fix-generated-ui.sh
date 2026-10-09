#!/usr/bin/env bash
#
# Normalise components produced by `shadcn add`.
#
# Run this immediately after every generation. It undoes the four things the
# registry gets wrong for this project (see docs/ARCHITECTURE.md §5):
#
#   1. It regenerates components it considers dependencies — registry items
#      declare dependencies on others (button, input, dialog, …), so adding a
#      component silently rewrites those files and reverts local changes to
#      them. Restoring tracked files from HEAD undoes that. Uncommitted work in
#      src/components/ui is therefore lost: COMMIT BEFORE GENERATING.
#   2. It imports `cn` from the `cn` package. BIG-PROMPT §2.1 names clsx +
#      tailwind-merge and the reference carries lib/utils.ts, so we point at
#      our own helper instead.
#   3. It emits the Next.js `"use client"` directive, which means nothing in a
#      Vite SPA (§0.5).
#   4. It adds the `cn` package as a dependency, which we do not use.
#   5. It reinstates dependencies this project deliberately rejected: the
#      `sonner` item (F018) re-added `next-themes`, which F010 replaced with
#      our own theme provider. The corrected component is tracked and step 1
#      restores it, but the dependency entry is new each time — so it is
#      removed here rather than by hand.
#
# Newly created files are untracked, so step 1 leaves them alone.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "not a git repository" >&2
  exit 1
fi

echo "1. restoring tracked components from HEAD"
restored=$(git diff --name-only -- src/components/ui | wc -l | tr -d ' ')
git checkout HEAD -- src/components/ui 2>/dev/null || true
echo "   restored ${restored} file(s) the generator rewrote"

echo "2. pointing cn imports at @/lib/utils"
sed -i 's|from "cn"|from "@/lib/utils"|g' src/components/ui/*.tsx
remaining=$(grep -l 'from "cn"' src/components/ui/*.tsx 2>/dev/null | wc -l | tr -d ' ' || true)
echo "   ${remaining} file(s) still importing the package (expected 0)"

echo "3. stripping the Next.js \"use client\" directive"
for file in $(grep -rl '"use client"' src/components/ui 2>/dev/null || true); do
  sed -i '/^"use client"$/d' "$file"
  echo "   cleaned ${file##*/}"
done

echo "4. removing the unused cn package"
pnpm remove cn >/dev/null 2>&1 || true

echo "5. removing dependencies the registry reinstates"
pnpm remove next-themes >/dev/null 2>&1 || true

echo "done. Now run: pnpm run typecheck && pnpm run test:run"
