// check-docs.mjs — F57: numbers stated in the docs must match the code.
// - README.md's "<N> copy rules" must equal the rule count in
//   src/lib/rules/ (one `id: '...',` per rule definition).
// - docs/METHOD.md's vocabulary/cliché union sizes must equal the
//   values pinned by src/lib/polish.test.ts, which measures the
//   phrase lists directly.
// Run in CI via `npm run check:docs`; needs no network.
import { readFileSync, readdirSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const failures = []

const ruleFiles = readdirSync(new URL('../src/lib/rules/', import.meta.url)).filter(
  (file) => file.endsWith('.ts'),
)
let rules = 0
for (const file of ruleFiles) {
  rules += (read(`../src/lib/rules/${file}`).match(/^\s*id: '[^']+',/gm) ?? []).length
}
const readme = read('../README.md')
const readmeCount = readme.match(/(\d+) copy rules/)?.[1]
if (readmeCount === undefined) {
  failures.push('README.md states no "<N> copy rules"')
} else if (Number(readmeCount) !== rules) {
  failures.push(`README.md says ${readmeCount} copy rules, code has ${rules}`)
}

const polish = read('../src/lib/polish.test.ts')
const vocab = polish.match(/expect\(vocab\.size\)\.toBe\((\d+)\)/)?.[1]
const cliche = polish.match(/expect\(cliche\.size\)\.toBe\((\d+)\)/)?.[1]
const method = read('../docs/METHOD.md')
const methodVocab = method.match(/vocabulary union is (\d+)/)?.[1]
const methodCliche = method.match(/cliche union is (\d+)/)?.[1]
if (vocab !== undefined && methodVocab !== vocab) {
  failures.push(`METHOD.md vocabulary union is ${methodVocab}, polish test pins ${vocab}`)
}
if (cliche !== undefined && methodCliche !== cliche) {
  failures.push(`METHOD.md cliche union is ${methodCliche}, polish test pins ${cliche}`)
}

if (failures.length > 0) {
  console.error('check-docs: FAILED')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(
  `check-docs: ${rules} rules, vocab ${vocab ?? '?'}, cliche ${cliche ?? '?'} — docs match`,
)
