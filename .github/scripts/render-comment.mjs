#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MARKER = '<!-- unit-test-agent -->'
const STACKS = ['backend', 'frontend']

// Agent output is derived from untrusted PR content: no HTML, no mentions, no table breaks.
export function clean(value, limit = 300) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const short = text.length > limit ? `${text.slice(0, limit - 1)}…` : text
  return short.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/\|/g, '\\|').replace(/@(?=\w)/g, '@\u200b')
}

const code = (value) => `\`${clean(value, 200).replace(/`/g, "'")}\``
const icon = (ok) => (ok ? '✅' : '❌')
const table = (header, rows) =>
  rows.length ? [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n') : ''

export function evaluate({ report, agentResult, guard, typecheck, runs, patchEmpty }) {
  const reasons = []
  if (agentResult && agentResult !== 'success') reasons.push(`agent job ended with "${agentResult}"`)
  if (!report) reasons.push('the agent did not produce a report')
  if (!guard?.ok) reasons.push('patch guard rejected the changes')
  for (const stack of STACKS) {
    if (typecheck?.[stack] === false) reasons.push(`${stack} type check failed`)
    if (runs?.[stack] && runs[stack].status !== 'pass') reasons.push(`${stack} tests failed`)
  }
  return { commit: !patchEmpty && reasons.length === 0, reasons }
}

export function render({ report, agentResult, guard, typecheck, runs, diffCoverage, validation, patchEmpty, agent, runUrl }) {
  const status = evaluate({ report, agentResult, guard, typecheck, runs, patchEmpty })
  const decisions = report?.decisions ?? []
  const counts = Object.fromEntries(['create', 'update', 'skip'].map((d) => [d, decisions.filter((x) => x.decision === d).length]))
  const headline = status.reasons.length
    ? `❌ Tests were **not** committed: ${status.reasons.join('; ')}.`
    : patchEmpty
      ? 'ℹ️ No test changes were needed.'
      : '✅ Verified tests are committed to this branch by the next job.'

  const checks = [
    ['Patch guard (test files only, no skipped/focused tests)', icon(guard?.ok)],
    ...STACKS.filter((s) => typecheck?.[s] !== undefined).map((s) => [`Type check · ${s}`, icon(typecheck[s])]),
    ...STACKS.filter((s) => runs?.[s]).map((s) => {
      const r = runs[s]
      return [`Tests · ${s} (${r.runs}× run)`, `${icon(r.status === 'pass')} ${r.passed}/${r.total} passed, ${r.flaky.length} flaky`]
    }),
    ...(diffCoverage?.percent != null ? [['Coverage of changed lines', `${diffCoverage.percent}% (${diffCoverage.covered}/${diffCoverage.changed})`]] : []),
    ['Report validation', validation ? (validation.ok ? '✅' : `⚠️ ${validation.errors.length} issue(s)`) : '—'],
  ]

  const sections = [
    MARKER,
    '## 🧪 Unit test agent',
    headline,
    table(['Check', 'Result'], checks),
    `### Decisions — ${counts.create} create · ${counts.update} update · ${counts.skip} skip`,
    table(['File', 'Decision', 'Score', 'Reason'], decisions.map((d) => [code(d.path), d.decision, d.score ?? '—', clean(d.reason, 160)])),
  ]

  const findings = report?.findings ?? []
  if (findings.length) {
    sections.push('### ⚠️ Possible bugs in this PR', table(['Severity', 'Where', 'Problem', 'Evidence'], findings.map((f) => [f.severity, code(f.where), clean(f.problem), clean(f.evidence)])))
  }
  const failed = STACKS.flatMap((s) => runs?.[s]?.failed ?? [])
  if (failed.length) sections.push('### Failing tests', table(['Test', 'Message'], failed.map((t) => [code(`${t.file} › ${t.name}`), clean(t.message)])))
  if (guard?.violations?.length) sections.push('### Guard violations', table(['Path', 'Rule', 'Line'], guard.violations.map((v) => [code(v.path), v.rule, clean(v.line ?? '')])))
  if (guard?.removedAssertions?.length) {
    sections.push('### 👀 Removed assertions — needs a human look', table(['File', 'Line'], guard.removedAssertions.map((a) => [code(a.path), code(a.line)])))
  }

  const notes = (report?.review?.notes ?? []).filter((n) => n.status !== 'fixed')
  if (notes.length) sections.push('### Open review notes', table(['Kind', 'Where', 'Problem', 'Status'], notes.map((n) => [n.kind, code(n.where), clean(n.problem), n.status])))

  const tests = report?.tests ?? []
  if (tests.length) sections.push(`<details><summary>Test files (${tests.length})</summary>\n\n${tests.map((t) => `- ${code(t.path)} → ${code(t.for)}`).join('\n')}\n\n</details>`)
  const plan = report?.plan ?? []
  if (plan.length) {
    sections.push(`<details><summary>Test plan (${plan.length} cases, each tied to a source line)</summary>\n\n${table(['Source', 'Behaviour', 'Test'], plan.map((p) => [code(p.source), clean(p.behaviour, 140), clean(p.test, 140)]))}\n\n</details>`)
  }
  const attempts = (report?.failures ?? []).length
  const meta = [
    agent?.turns != null && `${agent.turns} turns`,
    agent?.cost != null && `$${Number(agent.cost).toFixed(2)}`,
    attempts && `${attempts} red test(s) resolved during the run`,
    runUrl && `[workflow run](${runUrl})`,
  ].filter(Boolean)
  if (meta.length) sections.push(`<sub>${meta.join(' · ')}</sub>`)
  return { status, markdown: `${sections.filter(Boolean).join('\n\n')}\n` }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  const read = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : undefined)
  const session = read('session.json')
  const { status, markdown } = render({
    report: read('report.json'),
    agentResult: process.env.AGENT_RESULT,
    guard: read('guard.json'),
    typecheck: read('typecheck.json'),
    runs: Object.fromEntries(STACKS.map((s) => [s, read(`tests-${s}.json`)]).filter(([, r]) => r)),
    diffCoverage: read('diff-coverage.json'),
    validation: read('validation.json'),
    patchEmpty: !existsSync(join(dir, 'agent.patch')) || readFileSync(join(dir, 'agent.patch'), 'utf8').trim() === '',
    agent: session && { turns: session.num_turns, cost: session.total_cost_usd },
    runUrl: process.env.RUN_URL,
  })
  writeFileSync(join(dir, 'comment.md'), markdown)
  writeFileSync(join(dir, 'status.json'), JSON.stringify(status))
  process.stdout.write(`${JSON.stringify(status)}\n`)
}
