# Changelog

All notable changes to this project will be documented in this file.
There are no releases yet — the version stays 0.2.0 until the release
decision (see the repo settings notes) is made. Everything below is on
`main`.

## Unreleased

### Added

- Labelled benchmark corpus (`bench/`, 131 entries) with precision /
  recall gates as a CI test, and a scoring-calibration record
  (`bench/CALIBRATION.md`).
- Focal-word validation against real marketing copy
  (`bench/FOCAL_WORDS.md`).
- CI checks that the citations in `docs/METHOD.md` resolve
  (`scripts/check-citations.mjs`) and that the rule counts stated in
  the docs match the code (`scripts/check-docs.mjs`).
- Per-IP rate limiting and a 5-minute cache on the fetch endpoints.
- A false-positive issue template (`.github/ISSUE_TEMPLATE/`).
- This changelog and a security policy (`SECURITY.md`).

### Fixed

- **Critical (2026-11-15):** CLI `--url` SSRF guard; Web Worker crash
  on website scans (analysis now runs on the main thread); CLI
  packaging for real installs; website scanner no longer certifies
  pages it never read (unreadable pages report "Page not readable").
- **Runtime & CLI:** CLI input cap (8 MB) and linear density scoring,
  parser fixes, one shared SSRF guard, SARIF locations on site
  findings, shared server handlers, one Node version (24).
- **Engine & scoring:** fake-citation bypass closed; boundary slop
  coverage; curly-apostrophe folding; cross-sentence "not just" and
  testimonial gaps; short-draft floor and "Too short to score"
  verdict; code blocks skipped; burstiness alternation detection;
  context-aware buzzword exemptions; calibrated scoring constants;
  non-English text exempt from sentence rhythm.
- **Website scanner & server:** string-aware CSS parser; `@media`
  evaluated against a desktop viewport; paren-aware selector
  matching; hidden text excluded from visible copy; `aria-labelledby`
  with multiple IDs; pill-radius and palette thresholds scoped;
  fetch-API failure classification; claims lexicons split out of
  `claims.ts`.
- **Docs:** real citation titles and DOIs in `docs/METHOD.md`;
  six stale lines corrected across README, CONTRIBUTING, and the
  Method page; the no-drift guarantee softened to what the shared
  ledger actually covers; the STRESS3 header re-measured on the
  current engine.
