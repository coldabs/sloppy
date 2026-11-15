# Contributing to sloppy

Thank you for reading this first. sloppy is a small tool, and it stays
useful by staying small and honest. That is the whole guide, in practice.

## How to contribute

1. Open an issue first if the change is more than a typo or a single rule.
   Say what the draft looks like now, what should change, and why.
2. Fork the repository, make the change on a branch, and open a pull
   request against `main`.
3. Keep a pull request to one thing. A rule change, a fix, and a redesign
   do not belong in the same request.

## Rules for rules

The scanner and the documentation share one source of truth:
`src/lib/rules/` — one module per rule group, re-exported by the
`src/lib/rules.ts` barrel. That is where a rule lives, and the page and
`docs/METHOD.md` both describe it from there.

- A new rule needs a test in `src/lib/analyzer.test.ts` that shows a
  draft it catches and, where it matters, a draft it must leave alone.
- A rule needs a plain-language note and a fix. A flag without a fix is
  not a finished rule.
- Do not widen a rule to catch a single example. If a pattern only shows
  up in one draft, it does not belong in the fixed list.
- False positives are a cost, not a detail. Say in the pull request
  which ordinary words the rule will also catch.

## Checks before opening a pull request

```sh
npm install
npm test
npm run lint
npm run build
```

All four must pass. If a check fails, fix it in the same request rather
than leaving it for the reviewer.

## What will not be accepted

- A language model, a network request, analytics, or an account. The
  draft stays in the tab. That is a design rule, not a missing feature.
- A UI framework, an icon pack, or a new visual system. The Swiss poster
  look is the identity of the tool.
- Claims the tool cannot support. A high score is not proof of quality,
  and the documentation must keep saying so.

## Review

A human reads every issue and pull request. Nothing merges on its own.
Expect questions, especially about false positives and about whether a
new rule earns its place in a list of 29.

## License

By contributing, you agree that your contributions will be licensed
under the Apache License 2.0. See [LICENSE](LICENSE).
