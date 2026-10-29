import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffCoverage, parseLcov, parseUnifiedDiff } from './diff-coverage.mjs'
import { merge } from './run.mjs'

const run = (...tests) => ({ stack: 'backend', brokenFiles: [], tests })
const result = (name, status) => ({ file: 'backend/tests/a.test.ts', name, status, message: status === 'failed' ? 'boom' : '' })

test('passes only when every test passed in every run', () => {
  const summary = merge([run(result('a', 'passed')), run(result('a', 'passed'))])
  assert.equal(summary.status, 'pass')
  assert.equal(summary.passed, 1)
})

test('separates consistent failures from flaky tests', () => {
  const summary = merge([
    run(result('broken', 'failed'), result('flaky', 'passed')),
    run(result('broken', 'failed'), result('flaky', 'failed')),
  ])
  assert.equal(summary.status, 'fail')
  assert.deepEqual(summary.failed.map((test) => test.name), ['broken'])
  assert.deepEqual(summary.flaky, [{ file: 'backend/tests/a.test.ts', name: 'flaky', statuses: ['passed', 'failed'] }])
})

test('fails a run that matched no tests', () => {
  const summary = merge([run()])
  assert.equal(summary.status, 'fail')
  assert.equal(summary.brokenFiles[0].message, 'No tests matched.')
})

test('reads added line numbers from a zero-context diff', () => {
  const diff = [
    '+++ b/backend/src/a.ts',
    '@@ -1,0 +2,3 @@',
    '@@ -9 +12 @@',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
  ].join('\n')
  assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', new Set([2, 3, 4, 12])]]))
})

test('counts only executable changed lines', () => {
  const coverage = parseLcov('SF:src/a.ts\nDA:2,1\nDA:3,0\nDA:20,0\nend_of_record\n', 'backend')
  const added = new Map([
    ['backend/src/a.ts', new Set([1, 2, 3])],
    ['README.md', new Set([1])],
  ])
  assert.deepEqual(diffCoverage(added, coverage), {
    changed: 2,
    covered: 1,
    percent: 50,
    files: [{ path: 'backend/src/a.ts', changed: 2, covered: 1, uncovered: [3] }],
  })
})
