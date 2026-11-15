// `prepare` hook: build the CLI bundle (and the app) on install,
// so a fresh clone has dist/cli/sloppy-lib.mjs without a manual
// `npm run build` first (F3). The build needs the dev tools
// (typescript, vite); a production-only install (`npm ci
// --omit=dev`) has none of them, so in that case skip quietly
// instead of failing the install — the bundle built by an earlier
// full install stays on disk, and the CLI still runs.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let vitePresent = false
try {
  require.resolve('vite')
  vitePresent = true
} catch {
  vitePresent = false
}

if (!vitePresent) {
  console.log(
    'sloppy: build tools not installed, skipping the build (the CLI bundle must already exist).',
  )
  process.exit(0)
}

const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
