import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDiff, verify } from './verify-patch.mjs'

const file = (path, { status = 'M', added = [], removed = [] } = {}) => ({ path, status, added, removed })

test('accepts changes confined to test files', () => {
  const result = verify([
    file('backend/tests/health.test.ts', { status: 'A', added: ["it('returns ok', async () => {"] }),
    file('backend/tests/fixture.ts', { added: ['export const other = 1'] }),
    file('frontend/src/lib/http.test.ts', { status: 'A' }),
    file('frontend/src/features/todos/components/TodoList.test.tsx'),
  ])
  assert.deepEqual(result, { ok: true, violations: [], removedAssertions: [] })
})

test('rejects any change outside test files', () => {
  const paths = [
    'backend/src/factory.ts',
    'frontend/src/lib/http.ts',
    'frontend/package.json',
    '.github/workflows/unit-test-agent.yml',
    '.claude/agents/unit-test-writer.md',
    'frontend/src/test/setup.ts',
  ]
  const { ok, violations } = verify(paths.map((path) => file(path)))
  assert.equal(ok, false)
  assert.deepEqual(violations.map((violation) => violation.path), paths)
})

test('rejects disabled or focused tests', () => {
  const added = [
    "it.skip('a', () => {})",
    "test.only('b', () => {})",
    "describe.todo('c')",
    "it.fails('d', () => {})",
    "it.skipIf(true)('e', () => {})",
    "xit('f', () => {})",
    "it.each([1])('g %s', () => {})",
  ]
  const { violations } = verify([file('frontend/src/a.test.ts', { added })])
  assert.equal(violations.length, 6)
  assert.ok(violations.every((violation) => violation.rule === 'disabled-or-focused-test'))
})

test('rejects deleting a test file', () => {
  const { violations } = verify([file('backend/tests/router.test.ts', { status: 'D', removed: ['expect(1).toBe(1)'] })])
  assert.deepEqual(violations, [{ path: 'backend/tests/router.test.ts', rule: 'deleted-test-file' }])
})

test('flags removed assertions in existing tests for human review', () => {
  const result = verify([file('backend/tests/router.test.ts', { removed: ['  expect(response.status).toBe(201)', '  const a = 1'] })])
  assert.equal(result.ok, true)
  assert.deepEqual(result.removedAssertions, [{ path: 'backend/tests/router.test.ts', line: 'expect(response.status).toBe(201)' }])
})

test('parses paths, statuses and changed lines from git diff', () => {
  const diff = [
    'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts',
    'index 1..2 100644',
    '--- a/backend/tests/a.test.ts',
    '+++ b/backend/tests/a.test.ts',
    '@@ -1,2 +1,2 @@',
    '-expect(a).toBe(1)',
    '+expect(a).toBe(2)',
    '+++ looks like a header but is content',
    'diff --git a/frontend/src/b.test.ts b/frontend/src/b.test.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/frontend/src/b.test.ts',
    '@@ -0,0 +1 @@',
    '+it("x", () => {})',
    'diff --git a/backend/tests/c.test.ts b/backend/tests/c.test.ts',
    'deleted file mode 100644',
    '--- a/backend/tests/c.test.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-it("y", () => {})',
  ].join('\n')
  assert.deepEqual(parseDiff(diff), [
    { path: 'backend/tests/a.test.ts', status: 'M', added: ['expect(a).toBe(2)', '++ looks like a header but is content'], removed: ['expect(a).toBe(1)'] },
    { path: 'frontend/src/b.test.ts', status: 'A', added: ['it("x", () => {})'], removed: [] },
    { path: 'backend/tests/c.test.ts', status: 'D', added: [], removed: ['it("y", () => {})'] },
  ])
})
