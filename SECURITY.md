# Security policy

## Reporting a vulnerability

Do **not** open a public issue for a security problem. Report it
privately through a
[GitHub Security Advisory](https://github.com/coldabs/sloppy/security/advisories/new)
on this repository. Only the maintainers see the report, and the fix
can be coordinated before anything is disclosed.

Please include:

- what the problem is and where it lives (file and line, if you know it),
- steps to reproduce it, or a minimal proof of concept,
- what you think the impact is.

## Scope

The parts of this project where a report matters most are the ones that
fetch other people's pages:

- the fetch endpoints (`server/fetch.mjs`, the Netlify functions in
  `netlify/functions/`, the Vercel functions in `api/`) and the SSRF
  guard in `src/lib/ipGuard.mjs` — a bypass here can turn the server
  into a proxy for internal addresses;
- the CLI `--url` path (`src/lib/cli.ts`), which fetches through the
  same guard;
- the local dev server (`server.mjs`), which binds loopback and checks
  Host/Origin on its fetch route.

The scoring rules themselves run on text the user pastes in; a rule
that misfires is a false positive, not a vulnerability — report those
with the false-positive issue template instead.

## Supported versions

Only `main` is supported. There are no releases yet (see
[CHANGELOG.md](CHANGELOG.md)), so a fix lands on `main` and the live
site picks it up from there.
