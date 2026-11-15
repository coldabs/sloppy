#!/usr/bin/env node
// Thin entry point for the `sloppy` command. All of the work lives
// in src/lib/cli.ts; this file only loads the bundle `npm run build`
// produces (dist/cli/sloppy-lib.mjs) and hands it the real process.
import { readFile } from 'node:fs/promises'

let runCli
try {
  ;({ runCli } = await import('../dist/cli/sloppy-lib.mjs'))
} catch (caught) {
  const message = caught instanceof Error ? caught.message : ''
  // Name the actual cause: a missing bundle means the build never
  // ran, but a missing package means the install is incomplete —
  // the old message blamed the build for both (F3).
  const missingPackage = /Cannot find package '([^']+)'/.exec(message)?.[1]
  if (missingPackage) {
    console.error(
      `sloppy: the CLI bundle needs the package '${missingPackage}', which is not installed. Run \`npm install\` in the sloppy directory.`,
    )
  } else {
    console.error(
      'sloppy: the CLI bundle could not be loaded. Run `npm run build` first — it produces dist/cli/sloppy-lib.mjs.',
    )
  }
  if (message) console.error(message)
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
