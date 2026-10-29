#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

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

export function applies(input, agents) {
  return input.tool_name === 'Bash' && (!agents.length || agents.includes(input.agent_type))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `--agent <type>` scopes the hook to one subagent; without it, every Bash call in the session is checked.
  const { values } = parseArgs({ options: { agent: { type: 'string', multiple: true, default: [] } } })
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const reason = applies(input, values.agent) ? check(input.tool_input?.command ?? '') : null
  if (reason) {
    process.stderr.write(reason)
    process.exit(2)
  }
}
