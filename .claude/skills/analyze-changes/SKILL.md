---
name: analyze-changes
description: Classify the files changed against a base ref and decide per file whether unit tests must be created, updated or skipped. Use before writing tests for a branch or pull request.
argument-hint: "[base-ref]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/classify.mjs *)
---

# Analyze changes

1. Collect the files:
   - Changes: `node ${CLAUDE_SKILL_DIR}/classify.mjs <base-ref>` (default `origin/main`).
   - Coverage gaps in existing code: `node ${CLAUDE_SKILL_DIR}/classify.mjs --gaps [--threshold 80]`, after a `--coverage` run of both stacks. Treat each file as changed in full; `coverage` shows what is missing.

   Output: one entry per file with `stack`, `kind`, `gate`, `suggested`, `testPath`, `testExists`.
2. `gate: skip` → final. Copy its `reason` into the decision; never override it.
3. `gate: context` → changed test or fixture. Not a target; read it when deciding on its source.
4. `gate: candidate` → read the source diff (`git diff <merge-base> -- <path>`) and the existing test, then decide.

## Decision for a candidate

Type first, score second:

- New module with logic → `create`, no scoring.
- Changed behaviour that an existing test covers → `update`, no scoring.
- Deleted source with an orphaned test → `update` (remove or retarget that test).
- Anything else → score 1–10 on each metric; sum ÷ 40 × 100; **> 50 → create/update, ≤ 50 → skip**.

| Metric | Low (1–4) | High (5–10) |
|---|---|---|
| State & data impact | copy, markup, constants | persisted data, query cache, request payloads |
| Boundaries | one pure function or component | crosses HTTP, DB, query client or several modules |
| Logic | pass-through, rendering of props | branching, validation, sorting, dates, error mapping |
| Regression risk | visible at a glance | silent: wrong data saved, wrong error shown, stale cache |

Pure refactor with unchanged behaviour and green existing tests → `skip`, reason `behaviour unchanged, covered by <test>`.

## Output

One decision per changed file, appended to the run report:

```json
{ "path": "frontend/src/lib/http.ts", "decision": "create", "score": null, "reason": "new module: error mapping for 422 and network failures" }
```

`score` is the percentage when scored, otherwise `null`. Reasons are one line and name the behaviour, not the file.
