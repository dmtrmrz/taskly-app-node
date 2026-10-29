#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const SKIP_RULES = [
  [/^frontend\/src\/design-system\//, 'design system: excluded from coverage by vite.config.ts'],
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/(^|\/)types\.ts$|\.types\.ts$|\.d\.ts$/, 'type declarations only'],
  [/\.stories\.tsx$/, 'Storybook story'],
  [/\.styles\.ts$|\.css$/, 'styling'],
  [/(^|\/)index\.ts$/, 'barrel re-export'],
  [/^backend\/src\/main\.ts$|^frontend\/src\/main\.tsx$/, 'process entry point'],
  [/^frontend\/src\/test\//, 'test support code'],
]

const TEST_FILE = /\.test\.tsx?$|^backend\/tests\//

export function stackOf(path) {
  if (path.startsWith('backend/')) return 'backend'
  if (path.startsWith('frontend/')) return 'frontend'
  return 'other'
}

export function testPathFor(path) {
  if (path.startsWith('backend/src/')) {
    return `backend/tests/${path.split('/').pop().replace(/\.ts$/, '.test.ts')}`
  }
  return path.replace(/\.(tsx?)$/, '.test.$1')
}

export function classify(entries, exists) {
  return entries.map(({ status, path }) => {
    const stack = stackOf(path)
    const base = { path, status, stack }
    if (TEST_FILE.test(path)) return { ...base, kind: 'test', gate: 'context' }
    const isSource = stack !== 'other' && /\/src\/.+\.tsx?$/.test(path)
    if (!isSource) return { ...base, kind: 'other', gate: 'skip', reason: 'not application source' }
    const rule = SKIP_RULES.find(([pattern]) => pattern.test(path))
    if (rule) return { ...base, kind: 'source', gate: 'skip', reason: rule[1] }
    const testPath = testPathFor(path)
    const testExists = exists(testPath)
    if (status === 'D') {
      return testExists
        ? { ...base, kind: 'source', gate: 'candidate', suggested: 'update', testPath, testExists, reason: 'source deleted; its test is orphaned' }
        : { ...base, kind: 'source', gate: 'skip', reason: 'source deleted, no test' }
    }
    return { ...base, kind: 'source', gate: 'candidate', suggested: testExists ? 'update' : 'create', testPath, testExists }
  })
}

export function parseNameStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t')
      return { status: status[0], path: paths.at(-1) }
    })
}

export function coverageGaps(summaries, threshold) {
  return summaries.flatMap(({ stack, summary }) =>
    Object.entries(summary)
      .filter(([path]) => path !== 'total')
      .map(([path, metrics]) => ({
        status: 'M',
        path: `${stack}/${path.slice(path.indexOf(`/${stack}/`) + stack.length + 2)}`,
        coverage: { lines: metrics.lines.pct, branches: metrics.branches.pct },
      }))
      .filter(({ coverage }) => coverage.lines < threshold || coverage.branches < threshold),
  )
}

function changedEntries(root, base) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  // Diff the working tree against the merge base so local, uncommitted changes are included.
  const mergeBase = git('merge-base', base, 'HEAD').trim()
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }))
  return { mergeBase, entries: [...parseNameStatus(git('diff', '--name-status', '-M', mergeBase)), ...untracked] }
}

function gapEntries(root, threshold) {
  const summaries = ['backend', 'frontend'].map((stack) => {
    const file = join(root, stack, 'coverage/coverage-summary.json')
    if (!existsSync(file)) throw new Error(`${file} missing: run run-tests with --coverage for ${stack} first.`)
    return { stack, summary: JSON.parse(readFileSync(file, 'utf8')) }
  })
  return coverageGaps(summaries, threshold)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { gaps: { type: 'boolean', default: false }, threshold: { type: 'string', default: '80' } },
  })
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const exists = (path) => existsSync(join(root, path))
  if (values.gaps) {
    const entries = gapEntries(root, Number(values.threshold))
    const coverage = new Map(entries.map((entry) => [entry.path, entry.coverage]))
    const files = classify(entries, exists).map((file) => ({ ...file, coverage: coverage.get(file.path) }))
    process.stdout.write(`${JSON.stringify({ mode: 'gaps', threshold: Number(values.threshold), files }, null, 2)}\n`)
  } else {
    const base = positionals[0] ?? 'origin/main'
    const { mergeBase, entries } = changedEntries(root, base)
    process.stdout.write(`${JSON.stringify({ mode: 'diff', base, mergeBase, files: classify(entries, exists) }, null, 2)}\n`)
  }
}
