#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ALLOWED_PATH = /^backend\/tests\/[^]+\.ts$|^(backend|frontend)\/src\/[^]+\.test\.tsx?$/
const DISABLED_TEST = /\b(?:it|test|describe|suite)\s*\.\s*(?:skip|only|todo|fails|skipIf|runIf)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/
const ASSERTION = /\bexpect(?:\.soft)?\s*\(|\bassert\b/

export function parseDiff(text) {
  const files = []
  let file = null
  let inHunk = false
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { path: null, status: 'M', added: [], removed: [] }
      files.push(file)
      inHunk = false
    } else if (!file) {
      continue
    } else if (line.startsWith('@@')) {
      inHunk = true
    } else if (inHunk) {
      if (line.startsWith('+')) file.added.push(line.slice(1))
      else if (line.startsWith('-')) file.removed.push(line.slice(1))
    } else if (line.startsWith('new file mode')) {
      file.status = 'A'
    } else if (line.startsWith('deleted file mode')) {
      file.status = 'D'
    } else if (line.startsWith('rename to ')) {
      file.path = line.slice(10)
    } else if (line.startsWith('+++ ')) {
      if (line !== '+++ /dev/null') file.path = line.slice(6)
    } else if (line.startsWith('--- ')) {
      if (!file.path && line !== '--- /dev/null') file.path = line.slice(6)
    }
  }
  return files
}

export function verify(files) {
  const violations = []
  const removedAssertions = []
  for (const file of files) {
    if (!ALLOWED_PATH.test(file.path)) {
      violations.push({ path: file.path, rule: 'outside-test-files' })
      continue
    }
    for (const line of file.added.filter((added) => DISABLED_TEST.test(added))) {
      violations.push({ path: file.path, rule: 'disabled-or-focused-test', line: line.trim() })
    }
    if (file.status === 'D') {
      violations.push({ path: file.path, rule: 'deleted-test-file' })
    } else {
      for (const line of file.removed.filter((removed) => ASSERTION.test(removed))) {
        removedAssertions.push({ path: file.path, line: line.trim() })
      }
    }
  }
  return { ok: violations.length === 0, violations, removedAssertions }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // The patch under review is the working tree against HEAD, untracked files included.
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
  const files = [
    ...parseDiff(git('diff', 'HEAD', '--no-color', '-M')),
    ...untracked.map((path) => ({ path, status: 'A', removed: [], added: readFileSync(join(root, path), 'utf8').split('\n') })),
  ]
  const result = verify(files)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exit(result.ok ? 0 : 1)
}
