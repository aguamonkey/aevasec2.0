# Next command to run

From inside the aevasec repo:

```bash
cd ~/audits/tools/aevasec
codex exec --sandbox workspace-write - < AEVASEC_CODEX_BRIEF.md
```

If your Codex CLI supports `--cd`, you can also run:

```bash
codex exec --cd ~/audits/tools/aevasec --sandbox workspace-write - < ~/audits/tools/aevasec/AEVASEC_CODEX_BRIEF.md
```

Interactive alternative:

```bash
cd ~/audits/tools/aevasec
codex --sandbox workspace-write
```

Then paste:

```txt
Read AEVASEC_CODEX_BRIEF.md and implement the scaffold exactly as specified. Do not add features outside the brief. After implementation, run npm install, npm run build, npm run typecheck, and the demo ingest command. Fix any TypeScript errors.
```
