#!/usr/bin/env node
// Thin entry point for the `sloppy` command. All of the work lives
// in src/lib/cli.ts; this file only loads the bundle `npm run build`
// produces (dist/cli/sloppy-lib.mjs) and hands it the real process.
import { readFile } from 'node:fs/promises'

let runCli
try {
  ;({ runCli } = await import('../dist/cli/sloppy-lib.mjs'))
} catch (caught) {
  console.error(
    'sloppy: the CLI bundle could not be loaded. Run `npm run build` first — it produces dist/cli/sloppy-lib.mjs.',
  )
  if (caught instanceof Error) console.error(caught.message)
  process.exit(2)
}

let version
try {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  version = typeof pkg.version === 'string' ? pkg.version : undefined
} catch {
  version = undefined
}

process.exitCode = await runCli(process.argv.slice(2), undefined, { version })
