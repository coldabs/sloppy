// Build the CLI bundle: src/lib/cliEntry.ts (the analyser, the
// SARIF/JSON formatters, and the happy-dom DOM shim) into
// dist/cli/sloppy-lib.mjs, which bin/sloppy.mjs imports. Uses the
// Vite already in devDependencies — no new tooling — and runs as
// part of `npm run build`.
import { build } from 'vite'

await build({
  configFile: false,
  logLevel: 'info',
  // No public dir: this is a node bundle, not the web app, so the
  // app's public/ files must not be copied into dist/cli.
  publicDir: false,
  // Node build, not a browser build: without the external below,
  // Vite replaces node:fs/promises with a browser stub that cannot
  // read files. (The top-level `ssr` option does not change this
  // for a lib build in Vite 8, so the builtin is externalised
  // explicitly instead.)
  build: {
    outDir: 'dist/cli',
    emptyOutDir: true,
    target: 'es2023',
    minify: false,
    lib: {
      entry: 'src/lib/cliEntry.ts',
      formats: ['es'],
      fileName: () => 'sloppy-lib.mjs',
    },
    rollupOptions: {
      // happy-dom cannot be bundled: its classes break under
      // bundling ("Class extends value undefined"). It stays an
      // external import, loaded from node_modules at runtime, which
      // is why the CLI needs a plain `npm install` first. It is
      // a dependency (the CLI needs a DOM for site scans), so this
      // adds no new dependency. node:fs/promises is external for
      // the same reason in reverse: bundling it would replace it
      // with a browser stub that cannot read files. The node
      // builtins the guarded fetch uses (server/fetch.mjs) are
      // external for the same reason: without this, Vite replaces
      // them with browser stubs and the SSRF guard cannot run.
      external: [
        'happy-dom',
        'node:fs/promises',
        'node:dns/promises',
        'node:http',
        'node:https',
        'node:net',
      ],
    },
  },
})
