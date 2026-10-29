#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const STACKS = ['backend', 'frontend']

export function parseLcov(text, prefix) {
  const files = new Map()
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      current = new Map()
      files.set(`${prefix}/${line.slice(3)}`, current)
    } else if (line.startsWith('DA:') && current) {
      const [lineNo, hits] = line.slice(3).split(',').map(Number)
      current.set(lineNo, hits)
    }
  }
  return files
}

export function parseUnifiedDiff(text) {
  const added = new Map()
  let file = null
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice(6)
      if (file) added.set(file, new Set())
    } else if (line.startsWith('@@') && file) {
      const [, start, count = '1'] = line.match(/\+(\d+)(?:,(\d+))?/)
      for (let n = 0; n < Number(count); n++) added.get(file).add(Number(start) + n)
    }
  }
  return added
}

export function diffCoverage(added, coverage) {
  const files = []
  for (const [path, lines] of added) {
    const hits = coverage.get(path)
    if (!hits) continue
    const executable = [...lines].filter((line) => hits.has(line)).sort((a, b) => a - b)
    if (!executable.length) continue
    const uncovered = executable.filter((line) => hits.get(line) === 0)
    files.push({ path, changed: executable.length, covered: executable.length - uncovered.length, uncovered })
  }
  const changed = files.reduce((sum, file) => sum + file.changed, 0)
  const covered = files.reduce((sum, file) => sum + file.covered, 0)
  return { changed, covered, percent: changed ? Math.round((covered / changed) * 1000) / 10 : null, files }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? 'origin/main'
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const mergeBase = git('merge-base', base, 'HEAD').trim()
  const added = parseUnifiedDiff(git('diff', '-U0', '--no-color', mergeBase))
  const coverage = new Map()
  for (const stack of STACKS) {
    const lcov = join(root, stack, 'coverage/lcov.info')
    if (existsSync(lcov)) for (const entry of parseLcov(readFileSync(lcov, 'utf8'), stack)) coverage.set(...entry)
  }
  process.stdout.write(`${JSON.stringify({ base, ...diffCoverage(added, coverage) }, null, 2)}\n`)
}
