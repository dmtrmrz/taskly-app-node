import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clean, evaluate, MARKER, render } from './render-comment.mjs'

const pass = { status: 'pass', runs: 2, total: 3, passed: 3, failed: [], flaky: [] }
const inputs = (extra = {}) => ({
  report: {
    decisions: [{ path: 'frontend/src/lib/http.ts', decision: 'create', score: null, reason: 'error mapping' }],
    tests: [{ path: 'frontend/src/lib/http.test.ts', for: 'frontend/src/lib/http.ts' }],
    plan: [],
    findings: [],
    review: { verdict: 'approved', notes: [] },
  },
  guard: { ok: true, violations: [], removedAssertions: [] },
  typecheck: { backend: true, frontend: true },
  runs: { frontend: pass },
  patchEmpty: false,
  ...extra,
})

test('commits only when guard, type check and tests all pass', () => {
  assert.deepEqual(evaluate(inputs()), { commit: true, reasons: [] })
  assert.deepEqual(evaluate(inputs({ guard: { ok: false } })).reasons, ['patch guard rejected the changes'])
  assert.deepEqual(evaluate(inputs({ typecheck: { backend: true, frontend: false } })).reasons, ['frontend type check failed'])
  assert.deepEqual(evaluate(inputs({ runs: { frontend: { ...pass, status: 'fail' } } })).reasons, ['frontend tests failed'])
  assert.equal(evaluate(inputs({ patchEmpty: true })).commit, false)
})

test('never commits a partial run', () => {
  assert.deepEqual(evaluate(inputs({ agentResult: 'failure' })).reasons, ['agent job ended with "failure"'])
  assert.deepEqual(evaluate(inputs({ report: undefined })).reasons, ['the agent did not produce a report'])
})

test('renders a sticky comment with checks and decisions', () => {
  const { markdown } = render(inputs())
  assert.ok(markdown.startsWith(MARKER))
  assert.match(markdown, /Verified tests are committed/)
  assert.match(markdown, /Tests · frontend \(2× run\) \| ✅ 3\/3 passed, 0 flaky/)
  assert.match(markdown, /1 create · 0 update · 0 skip/)
})

test('surfaces failures, findings and removed assertions', () => {
  const { markdown } = render(
    inputs({
      runs: { frontend: { ...pass, status: 'fail', failed: [{ file: 'a.test.ts', name: 'x', message: 'boom' }] } },
      guard: { ok: true, violations: [], removedAssertions: [{ path: 'a.test.ts', line: 'expect(a).toBe(1)' }] },
      report: { ...inputs().report, findings: [{ severity: 'important', where: 'a.ts:3', problem: 'off by one', evidence: 'expected 2 got 3' }] },
    }),
  )
  assert.match(markdown, /not\*\* committed: frontend tests failed/)
  assert.match(markdown, /Possible bugs in this PR/)
  assert.match(markdown, /Removed assertions/)
})

test('neutralises HTML, mentions and table breaks from agent output', () => {
  assert.equal(clean('<img src=x> @octocat a|b\nc'), '&lt;img src=x&gt; @​octocat a\\|b c')
  assert.equal(clean('x'.repeat(10), 5), 'xxxx…')
})
