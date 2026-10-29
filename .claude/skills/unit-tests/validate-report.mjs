#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../../..')
const SOURCE = /^(?<path>[\w./-]+):(?<line>\d+)$/
const ENUMS = {
  mode: ['diff', 'gaps'],
  decision: ['create', 'update', 'skip'],
  outcome: ['fixed-test', 'product-bug', 'pre-existing', 'blocked', 'unresolved'],
  severity: ['critical', 'important', 'minor'],
  verdict: ['approved', 'changes-requested'],
  status: ['fixed', 'declined', 'open'],
}

export function validate(report, lineCount) {
  const errors = []
  const expect = (condition, message) => condition || errors.push(message)
  const oneOf = (field, value, where) => expect(ENUMS[field].includes(value), `${where}: ${field} "${value}" is not one of ${ENUMS[field].join('|')}`)

  oneOf('mode', report.mode, 'report')
  for (const [i, d] of (report.decisions ?? []).entries()) {
    oneOf('decision', d.decision, `decisions[${i}] ${d.path}`)
    expect(d.reason?.trim(), `decisions[${i}] ${d.path}: reason is empty`)
  }
  for (const [i, entry] of (report.plan ?? []).entries()) {
    const where = `plan[${i}] ${entry.test}`
    const match = SOURCE.exec(entry.source ?? '')
    if (!match) {
      errors.push(`${where}: source "${entry.source}" must be one line, path:line`)
      continue
    }
    expect(match.groups.path === entry.for, `${where}: source ${match.groups.path} is not the planned file ${entry.for}`)
    const lines = lineCount(match.groups.path)
    expect(lines !== null && Number(match.groups.line) <= lines, `${where}: ${entry.source} does not exist`)
  }
  for (const d of (report.decisions ?? []).filter((d) => d.decision !== 'skip')) {
    const planned = (report.plan ?? []).some((entry) => entry.for === d.path)
    const done = (report.notDone ?? []).some((entry) => entry.path === d.path) || (report.failures ?? []).some((f) => f.outcome === 'blocked' && f.test.startsWith(d.path))
    expect(planned || done, `${d.path}: ${d.decision} decision has no plan entry and no blocked outcome`)
  }
  for (const [i, f] of (report.failures ?? []).entries()) {
    oneOf('outcome', f.outcome, `failures[${i}] ${f.test}`)
    expect(f.cause?.trim(), `failures[${i}] ${f.test}: cause is empty`)
  }
  for (const [i, f] of (report.findings ?? []).entries()) oneOf('severity', f.severity, `findings[${i}] ${f.where}`)
  if (report.review) {
    oneOf('verdict', report.review.verdict, 'review')
    for (const [i, n] of (report.review.notes ?? []).entries()) oneOf('status', n.status, `review.notes[${i}] ${n.where}`)
  }
  return { ok: errors.length === 0, errors }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? join(ROOT, '.unit-test-agent/report.json')
  const lineCount = (path) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8').split('\n').length : null)
  const result = validate(JSON.parse(readFileSync(file, 'utf8')), lineCount)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exit(result.ok ? 0 : 1)
}
