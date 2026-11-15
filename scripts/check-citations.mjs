// check-citations.mjs — F55: every arXiv ID and DOI cited in
// docs/METHOD.md must resolve. arXiv abs pages must answer 200.
// DOIs are checked against doi.org with redirects NOT followed:
// doi.org answers a real DOI with a redirect to the publisher, and
// some publishers (e.g. science.org) refuse non-browser clients
// with 403 after the redirect, so the check accepts any 2xx/3xx
// from doi.org itself and only fails on 4xx/5xx (a dead DOI answers
// 404). Run in CI via `npm run check:citations`; needs network.
import { readFileSync } from 'node:fs'

const METHOD = new URL('../docs/METHOD.md', import.meta.url)

const text = readFileSync(METHOD, 'utf8')
const arxivIds = [...new Set(text.match(/arXiv:(\d{4}\.\d{4,5})/g) ?? [])].map(
  (match) => match.slice('arXiv:'.length),
)
const dois = [...new Set(text.match(/doi:(10\.\S+?)(?=[\s,;)]|$)/g) ?? [])]
  .map((match) => match.slice('doi:'.length).replace(/\.$/, ''))

if (arxivIds.length === 0 && dois.length === 0) {
  console.error('check-citations: no arXiv IDs or DOIs found in docs/METHOD.md')
  process.exit(1)
}

const failures = []

const check = async (label, url, accept) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!accept(response.status)) {
      failures.push(`${label}: ${url} answered HTTP ${response.status}`)
    } else {
      console.log(`ok ${label}: HTTP ${response.status}`)
    }
  } catch (error) {
    failures.push(`${label}: ${url} failed (${error.message})`)
  } finally {
    clearTimeout(timer)
  }
}

for (const id of arxivIds) {
  await check(`arXiv:${id}`, `https://arxiv.org/abs/${id}`, (status) => status === 200)
}
for (const doi of dois) {
  await check(
    `doi:${doi}`,
    `https://doi.org/${doi}`,
    (status) => status >= 200 && status < 400,
  )
}

if (failures.length > 0) {
  console.error('check-citations: FAILED')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`check-citations: ${arxivIds.length} arXiv IDs, ${dois.length} DOIs, all resolve`)
