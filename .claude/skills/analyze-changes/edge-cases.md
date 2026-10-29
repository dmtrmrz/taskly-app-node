# Edge cases from code

A case exists only when a construct in the source creates it. Each case cites the `file:line` of that construct.

| Construct in source | Cases it creates |
|---|---|
| `if` / ternary / `&&` / `\|\|` / `switch` | each branch, including the implicit `else` |
| `?.` / `??` / nullable type / optional prop | `null`, `undefined`, present |
| `trim`, `min`, `max`, `length`, regex | at the boundary, one past it, whitespace-only, empty |
| Number parsing / coercion | `0`, negative, fractional, non-numeric, above `MAX_SAFE_INTEGER` |
| Date parsing / formatting | invalid calendar date (`2025-02-29`), leap day, day boundary in local time |
| `try` / `catch` / rejected promise / `!response.ok` | the error path and the message the user sees |
| `signal` / `AbortController` | aborted request is rethrown, not mapped |
| `filter` / `sort` / `find` | empty list, no match, ties (stable order) |
| Query cache update (`setQueryData`) | empty cache, item present, item absent |
| `disabled` / `busy` / `isPending` | interaction blocked while busy |
| Timer (`setTimeout`) | before expiry, after expiry, cleanup on unmount |
| Spread / copy of input | input not mutated |
| Allowlist / `strictObject` | unknown field rejected |

## Not a case

- A branch inside a dependency (Zod, Express, React Query) — test our use of it, not the library.
- The same branch with different values that do not cross a boundary → one `it.each`, not new tests.
- A behaviour with no construct behind it ("handles large input" with no limit in code).
