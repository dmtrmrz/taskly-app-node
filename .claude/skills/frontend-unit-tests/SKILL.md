---
name: frontend-unit-tests
description: Conventions for unit tests in frontend/ (React 19, TanStack Query 5, styled-components, Vitest, React Testing Library). Use when writing or updating frontend tests.
---

# Frontend unit tests

## Layout

- Test sits next to its source: `TodoList.tsx` → `TodoList.test.tsx`, `http.ts` → `http.test.ts`.
- Shared task object: `todoFixture` from `src/test/todoFixture.ts`; spread it for variants.
- jsdom, `@testing-library/jest-dom` matchers and RTL `cleanup` are set up in `src/test/setup.ts`.
- Vitest globals are off: import `it`, `expect`, `vi` from `vitest`.

## Isolation

| Unit | How |
|---|---|
| Component | `vi.mock('<relative>/design-system', () => import('<relative>/design-system/mocks'))`; mock child components and hooks the test is not about |
| Hook using React Query | `renderHook(..., { wrapper })` with a fresh `new QueryClient({ defaultOptions: { queries: { retry: false } } })` per test; mock `todosApi` with `vi.mock('../api/todos')` |
| Cache effects | Seed with `client.setQueryData(todoKeys.list, [...])`, assert with `client.getQueryData(todoKeys.list)` |
| `lib/http.ts` | `vi.stubGlobal('fetch', vi.fn())` + `vi.unstubAllGlobals()` in `afterEach`; build responses with `new Response(JSON.stringify(body), { status })` |
| Timers (`useNotice`) | `vi.useFakeTimers()` + `act(() => vi.advanceTimersByTime(ms))`; restore with `vi.useRealTimers()` |
| Dates (`isOverdue`) | `vi.setSystemTime(new Date(...))` under fake timers |

## What to assert

- Query by role and accessible name (`getByRole('button', { name: 'Delete' })`); `getByTestId` only for the `alert` mock.
- Interactions through `userEvent.setup()`; `await` every interaction.
- User-visible outcome or the call contract (`toHaveBeenCalledWith`), not internal state or render counts.
- Disabled / busy / empty / error states when the component branches on them.

## Commands

- Run: `node .claude/skills/run-tests/run.mjs frontend [frontend/src/x.test.tsx ...]`
- Type check: `cd frontend && npm run typecheck`.
- Format: `cd frontend && node_modules/.bin/prettier --write <test files>` — the repo enforces Prettier.
