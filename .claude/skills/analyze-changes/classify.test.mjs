import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, coverageGaps, parseNameStatus, testPathFor } from './classify.mjs'

const none = () => false
const only = (...paths) => (path) => paths.includes(path)

test('maps sources to the test path convention of each stack', () => {
  assert.equal(testPathFor('backend/src/features/todos/router.ts'), 'backend/tests/router.test.ts')
  assert.equal(testPathFor('frontend/src/lib/http.ts'), 'frontend/src/lib/http.test.ts')
  assert.equal(testPathFor('frontend/src/App.tsx'), 'frontend/src/App.test.tsx')
})

test('suggests create for untested sources and update for tested ones', () => {
  const [created, updated] = classify(
    [
      { status: 'A', path: 'frontend/src/lib/http.ts' },
      { status: 'M', path: 'backend/src/features/todos/router.ts' },
    ],
    only('backend/tests/router.test.ts'),
  )
  assert.equal(created.gate, 'candidate')
  assert.equal(created.suggested, 'create')
  assert.equal(updated.suggested, 'update')
  assert.equal(updated.testExists, true)
})

test('skips files that carry no testable behaviour', () => {
  const paths = [
    'frontend/src/design-system/components/Button/Button.tsx',
    'frontend/src/features/todos/types.ts',
    'frontend/src/design-system/components/Card/Card.types.ts',
    'frontend/src/features/todos/components/TodoItem.stories.tsx',
    'frontend/src/styles.css',
    'frontend/src/features/todos/index.ts',
    'backend/src/main.ts',
    'backend/src/generated/prisma/client.ts',
    'frontend/src/test/todoFixture.ts',
    'README.md',
    'backend/package-lock.json',
  ]
  const result = classify(paths.map((path) => ({ status: 'M', path })), none)
  assert.deepEqual(result.filter((file) => file.gate !== 'skip'), [])
  assert.ok(result.every((file) => file.reason))
})

test('treats changed tests as context, not as targets', () => {
  const [backend, frontend] = classify(
    [
      { status: 'M', path: 'backend/tests/fixture.ts' },
      { status: 'A', path: 'frontend/src/App.test.tsx' },
    ],
    none,
  )
  assert.equal(backend.gate, 'context')
  assert.equal(frontend.gate, 'context')
})

test('flags an orphaned test when its source is deleted', () => {
  const [orphan, gone] = classify(
    [
      { status: 'D', path: 'frontend/src/lib/http.ts' },
      { status: 'D', path: 'frontend/src/lib/other.ts' },
    ],
    only('frontend/src/lib/http.test.ts'),
  )
  assert.equal(orphan.suggested, 'update')
  assert.equal(gone.gate, 'skip')
})

test('parses renames to their new path', () => {
  assert.deepEqual(parseNameStatus('M\ta.ts\nR087\told.ts\tnew.ts\n'), [
    { status: 'M', path: 'a.ts' },
    { status: 'R', path: 'new.ts' },
  ])
})

test('lists files below the threshold on lines or branches', () => {
  const metrics = (lines, branches) => ({ lines: { pct: lines }, branches: { pct: branches } })
  const summary = {
    total: metrics(50, 50),
    '/repo/frontend/src/lib/http.ts': metrics(0, 0),
    '/repo/frontend/src/features/todos/components/TodoItem.tsx': metrics(100, 35.7),
    '/repo/frontend/src/App.tsx': metrics(100, 100),
  }
  assert.deepEqual(coverageGaps([{ stack: 'frontend', summary }], 80), [
    { status: 'M', path: 'frontend/src/lib/http.ts', coverage: { lines: 0, branches: 0 } },
    { status: 'M', path: 'frontend/src/features/todos/components/TodoItem.tsx', coverage: { lines: 100, branches: 35.7 } },
  ])
})
