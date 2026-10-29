#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ALLOWED = [
  /^cd (?:\S+\/)?(?:backend|frontend)$/,
  /^node (?:\S+\/)?\.claude\/skills\/[\w-]+\/[\w-]+\.mjs(?: [\w./@:=-]+)*$/,
  /^node (?:\S+\/)?\.github\/scripts\/verify-patch\.mjs$/,
  /^npm run typecheck$/,
  /^node_modules\/\.bin\/prettier --(?:write|check)(?: [\w./@-]+)+$/,
  /^git (?:diff|status|log|show|merge-base|rev-parse|ls-files)(?: [\w./@:^~=-]+)*$/,
]
const SHELL_SYNTAX = /[;|<>`$(){}\\\n]|&(?!&)/

export function check(command) {
  const trimmed = command.trim()
  if (SHELL_SYNTAX.test(trimmed.replaceAll('&&', ''))) {
    return 'Shell syntax beyond `&&` is not allowed. Write files with Edit/Write and read them with Read/Grep/Glob.'
  }
  const rejected = trimmed.split('&&').map((part) => part.trim()).find((part) => !ALLOWED.some((rule) => rule.test(part)))
  return rejected === undefined
    ? null
    : `\`${rejected}\` is not on the allowlist (run-tests and analyze-changes scripts, verify-patch, npm run typecheck, prettier, read-only git). Write files with Edit/Write.`
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const reason = input.tool_name === 'Bash' ? check(input.tool_input?.command ?? '') : null
  if (reason) {
    process.stderr.write(reason)
    process.exit(2)
  }
}
