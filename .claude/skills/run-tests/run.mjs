#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../../..')
const STACKS = ['backend', 'frontend']
const MESSAGE_LIMIT = 1500

export function summarize(report, stackDir) {
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      file: relative(ROOT, file.name),
      name: test.fullName,
      status: test.status,
      message: test.failureMessages?.join('\n').slice(0, MESSAGE_LIMIT),
    })),
  )
  const brokenFiles = report.testResults
    .filter((file) => file.status === 'failed' && !file.assertionResults.length)
    .map((file) => ({ file: relative(ROOT, file.name), message: file.message?.slice(0, MESSAGE_LIMIT) }))
  return { stack: relative(ROOT, stackDir), tests, brokenFiles }
}

export function merge(runs) {
  const byKey = new Map()
  for (const run of runs) {
    for (const test of run.tests) {
      const key = `${test.file}::${test.name}`
      const entry = byKey.get(key) ?? { ...test, statuses: [] }
      entry.statuses.push(test.status)
      if (test.status === 'failed') entry.message = test.message
      byKey.set(key, entry)
    }
  }
  const tests = [...byKey.values()]
  const flaky = tests.filter((test) => new Set(test.statuses).size > 1)
  const failed = tests.filter((test) => test.statuses.every((status) => status === 'failed'))
  const brokenFiles = runs.flatMap((run) => run.brokenFiles)
  const total = tests.length
  if (!total && !brokenFiles.length) brokenFiles.push({ file: '(none)', message: 'No tests matched.' })
  return {
    stack: runs[0].stack,
    runs: runs.length,
    status: total > 0 && !failed.length && !flaky.length && !brokenFiles.length ? 'pass' : 'fail',
    total,
    passed: tests.filter((test) => test.statuses.every((status) => status === 'passed')).length,
    failed: failed.map(({ file, name, message }) => ({ file, name, message })),
    flaky: flaky.map(({ file, name, statuses }) => ({ file, name, statuses })),
    brokenFiles,
  }
}

function runOnce(stackDir, files, coverage) {
  const outDir = mkdtempSync(join(tmpdir(), 'unit-test-run-'))
  const outputFile = join(outDir, 'report.json')
  const args = ['run', '--reporter=json', `--outputFile=${outputFile}`, ...files]
  if (coverage) args.push('--coverage', '--coverage.reporter=lcov', '--coverage.reporter=json-summary')
  // Call the locally installed binary, never npx: no on-the-fly package downloads.
  const result = spawnSync(join(stackDir, 'node_modules/.bin/vitest'), args, { cwd: stackDir, encoding: 'utf8' })
  try {
    return summarize(JSON.parse(readFileSync(outputFile, 'utf8')), stackDir)
  } catch {
    return { stack: relative(ROOT, stackDir), tests: [], brokenFiles: [{ file: '(vitest)', message: `${result.stderr}${result.stdout}`.slice(-MESSAGE_LIMIT) }] }
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { coverage: { type: 'boolean', default: false }, repeat: { type: 'string', default: '1' } },
  })
  const [stack, ...files] = positionals
  if (!STACKS.includes(stack)) {
    process.stderr.write(`Usage: run.mjs <${STACKS.join('|')}> [--coverage] [--repeat N] [repo-relative test files...]\n`)
    process.exit(2)
  }
  if (values.coverage && files.length) {
    process.stderr.write('--coverage needs the full suite: per-file thresholds fail on a partial run.\n')
    process.exit(2)
  }
  const stackDir = join(ROOT, stack)
  const stackFiles = files.map((file) => relative(stackDir, resolve(ROOT, file)))
  const runs = Array.from({ length: Number(values.repeat) }, (_, index) =>
    runOnce(stackDir, stackFiles, values.coverage && index === 0),
  )
  const summary = merge(runs)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exit(summary.status === 'pass' ? 0 : 1)
}
