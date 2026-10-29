---
name: run-tests
description: Run backend or frontend Vitest suites and read the results as JSON, including flaky-test detection and coverage of changed lines. Use to establish a baseline and to verify written tests.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/run.mjs *), Bash(node ${CLAUDE_SKILL_DIR}/diff-coverage.mjs *)
---

# Run tests

Dependencies are installed. Never run `npm install`, `npm ci` or `npx`.

## Commands

| Purpose | Command |
|---|---|
| Specific tests | `node ${CLAUDE_SKILL_DIR}/run.mjs <backend\|frontend> <repo-relative test files...>` |
| Whole stack, twice (flaky check) | `node ${CLAUDE_SKILL_DIR}/run.mjs <stack> --repeat 2` |
| Whole stack with coverage | `node ${CLAUDE_SKILL_DIR}/run.mjs <stack> --coverage` |
| Coverage of changed lines | `node ${CLAUDE_SKILL_DIR}/diff-coverage.mjs <base-ref>` — after a `--coverage` run of every touched stack |

Exit 0 = `status: pass`. Output fields: `failed[]` (consistent failures with message), `flaky[]` (mixed results across repeats), `brokenFiles[]` (file failed to load or no tests matched).

## Order

1. **Baseline** — whole stack before writing anything. A failing test is `pre-existing` only if neither the test, the source it tests, nor a module that source imports is in the change list from `analyze-changes`; otherwise the change caused it and it is handled below like any other red test.
2. **Iterate** — run only the test files you wrote or changed.
3. **Final** — whole stack with `--repeat 2`, then `--coverage` and `diff-coverage.mjs`. Uncovered changed lines are either a planned case you missed or a line with no behaviour to test — say which.

## Failures

Read the message and the source line before changing anything. Every red test ends with exactly one outcome:

| Outcome | When | Then |
|---|---|---|
| `fixed-test` | The test was wrong: setup, mock, query, async handling | Fix it; `cause` names the mistake |
| `product-bug` | The source contradicts its intended behaviour | Remove only that test; finding with expected vs actual and the source line |
| `pre-existing` | Red at baseline and unrelated to the change list (see Order) | Leave it untouched |
| `blocked` | Needs a production change, a dependency or a fixture outside test files | Leave it out; say exactly what is needed |

- Existing test red because of the change (at baseline or later, including type errors from a changed signature): intended behaviour per the diff → update it under `fixed-test` citing the diff line; otherwise `product-bug`.
- `flaky[]` not empty → remove the nondeterminism (time, order, shared state); never retry around it.
- No outcome yet → keep investigating. "Gave up" is not an outcome.
