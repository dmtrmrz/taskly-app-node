import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validate } from './validate-report.mjs'

const lines = (path) => (path === 'frontend/src/lib/http.ts' ? 24 : null)
const entry = (source, extra = {}) => ({ for: 'frontend/src/lib/http.ts', behaviour: 'b', source, test: 'frontend/src/lib/http.test.ts › t', ...extra })
const report = (extra = {}) => ({
  mode: 'gaps',
  decisions: [{ path: 'frontend/src/lib/http.ts', decision: 'create', score: null, reason: 'error mapping' }],
  plan: [entry('frontend/src/lib/http.ts:14')],
  failures: [],
  findings: [],
  review: { verdict: 'approved', notes: [] },
  ...extra,
})

test('accepts a complete report', () => {
  assert.deepEqual(validate(report(), lines), { ok: true, errors: [] })
})

test('rejects plan sources that are ranges, lists or missing lines', () => {
  const sources = [
    'frontend/src/lib/http.ts:6-24',
    'frontend/src/lib/http.ts:11,16',
    'frontend/src/lib/http.ts',
    'frontend/src/lib/http.ts:99',
    'frontend/src/lib/other.ts:3',
  ]
  for (const source of sources) {
    const plan = [entry('frontend/src/lib/http.ts:14'), entry(source)]
    assert.equal(validate(report({ plan }), lines).ok, false, source)
  }
})

test('requires a plan entry or a blocked outcome for every create or update', () => {
  assert.equal(validate(report({ plan: [] }), lines).ok, false)
  const blocked = [{ test: 'frontend/src/lib/http.ts › x', outcome: 'blocked', cause: 'needs a fixture outside tests' }]
  assert.equal(validate(report({ plan: [], failures: blocked }), lines).ok, true)
})

test('rejects unknown enum values and failures without a cause', () => {
  const { errors } = validate(
    report({
      failures: [{ test: 't', outcome: 'gave-up', cause: '' }],
      findings: [{ where: 'x:1', severity: 'blocker' }],
      review: { verdict: 'ok', notes: [{ where: 'x:1', status: 'done' }] },
    }),
    lines,
  )
  assert.equal(errors.length, 5)
})
