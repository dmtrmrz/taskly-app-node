---
name: backend-unit-tests
description: Conventions for unit tests in backend/ (Express 5, Prisma 7, Zod, Vitest, Supertest). Use when writing or updating backend tests.
---

# Backend unit tests

## Layout

- Tests live in `backend/tests/<source-name>.test.ts`, flat. Shared data in `backend/tests/fixture.ts` (`record` = Prisma row, `todo` = API shape); extend it instead of redefining objects.
- Import sources with the `.ts` extension: `import { createApp } from '../src/factory.ts'`.
- Vitest globals are off: import `it`, `expect`, `vi`, `describe`, `afterEach` from `vitest`.

## Isolation — no PostgreSQL, no network

| Unit | How |
|---|---|
| Repository | `createDatabase('postgresql://test:test@localhost:5432/test')` builds a real client without connecting; `vi.spyOn(database.todo, 'findMany').mockResolvedValue([record])` |
| Router | Fake `TodoStore` of `vi.fn()`s, mounted on `express()` + `express.json()`, driven with `supertest` |
| App wiring (`factory.ts`, `api/*`) | `createApp(fakeDatabase)` where `fakeDatabase` is a minimal object cast to `Database`; assert status codes and JSON bodies through `supertest` |
| Config | `vi.stubEnv(name, value)` + `vi.unstubAllEnvs()` in `afterEach`; never read the developer's `.env` |
| Startup (`core/lifespan.ts`) | `vi.mock('../src/core/database.ts')` and `vi.mock('../src/factory.ts')`; listen on port `0`; close the server in the test |

Restore spies with `afterEach(() => vi.restoreAllMocks())` when a file uses `vi.spyOn`.

## What to assert

- HTTP: status code **and** body for each branch — 200/201/204, 404 `{ detail: 'Task not found.' }`, 422 with `detail` issues, 413/422 for malformed JSON.
- Validation: boundaries (120 / 121 chars, invalid calendar dates, unknown fields) through the public schema or route.
- Repository: the exact Prisma call arguments and the mapped result; error propagation.
- Repository call **not made** when validation fails.

## Commands

- Run: `node .claude/skills/run-tests/run.mjs backend [backend/tests/x.test.ts ...]`
- Type check: `cd backend && npm run typecheck` — tests are type-checked; a test that fails `tsc` is not done.
