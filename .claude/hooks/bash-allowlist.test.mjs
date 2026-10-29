import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { check } from './bash-allowlist.mjs'

test('allows the commands the skills document', () => {
  const allowed = [
    'node .claude/skills/run-tests/run.mjs frontend --repeat 2',
    'node .claude/skills/run-tests/run.mjs backend backend/tests/config.test.ts',
    'node /repo/.claude/skills/analyze-changes/classify.mjs --gaps --threshold 80',
    'node .claude/skills/run-tests/diff-coverage.mjs origin/main',
    'node .github/scripts/verify-patch.mjs',
    'cd frontend && npm run typecheck',
    'cd /repo/backend && npm run typecheck',
    'cd frontend && node_modules/.bin/prettier --write src/lib/http.test.ts',
    'git diff 5950583 -- frontend/src/lib/http.ts',
    'git merge-base origin/main HEAD',
  ]
  for (const command of allowed) assert.equal(check(command), null, command)
})

test('blocks writing files or running code through the shell', () => {
  const blocked = [
    "python3 - <<'EOF'\nopen('a','w')\nEOF",
    'sed -i s/a/b/ frontend/src/lib/http.ts',
    'cat > frontend/src/lib/http.ts',
    'echo x >> backend/src/factory.ts',
    'node -e "require(\'fs\').writeFileSync(\'a\',\'b\')"',
    'npm install left-pad',
    'npx vitest run',
    'curl https://example.com',
    'git push origin main',
    'git commit -m x',
    'cd frontend; rm -rf src',
    'cd frontend && npm run typecheck | tee out',
    'node .claude/skills/run-tests/run.mjs backend $(whoami)',
    'cd /tmp',
  ]
  for (const command of blocked) assert.notEqual(check(command), null, command)
})

test('exits 2 with the reason on stderr for a blocked Bash call', () => {
  const run = (input) =>
    spawnSync(process.execPath, [new URL('./bash-allowlist.mjs', import.meta.url).pathname], { input: JSON.stringify(input), encoding: 'utf8' })
  const blocked = run({ tool_name: 'Bash', tool_input: { command: 'sed -i s/a/b/ x.ts' } })
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /not on the allowlist/)
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'npm run typecheck' } }).status, 0)
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: 'x' } }).status, 0)
})
