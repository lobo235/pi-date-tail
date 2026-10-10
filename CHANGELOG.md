# Changelog

All notable changes to pi-date-tail are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) over the contract the README defines
(*Versioning*): the `PI_DATE_TAIL_TZ` variable, the persisted `date-tail` message type, and the
once-per-day behaviour. The message's exact wording is not part of it.

## [Unreleased]

### Added

- The calendar day as a hidden `date-tail` custom message appended after your prompt, once per calendar
  day per branch and again after a compaction that summarized it, never in the system prompt.
- `PI_DATE_TAIL_TZ`: the IANA zone whose day is given. Unset means the zone pi runs in (`TZ`, then the
  system's); a value that is not a zone name stops pi at launch, naming the variable and the value.
- The message names the zone and gives the command for the current time (`TZ=<zone> date`).
- A `date` section that an extension running earlier put in the system prompt wins: no message is added.
- A date message that the latest compaction kept (at or after its first kept entry) counts as present, so
  the next prompt adds no second copy. A kept message from an earlier day still gets today's added.
- CI on Linux, macOS and Windows: the tests; the entry loaded through pi's own extension loader (jiti); a real pi with
  a fake model, run both on the package as `npm pack` builds it, installed with `pi install` so pi finds it
  through the `pi.extensions` manifest and the `files` allowlist, and on the source; a secret scan, a workflow security audit (zizmor), Dependabot updates and a
  package-contents check. A nightly run against the newest pi; npm publishing by trusted publishing, then a GitHub Release carrying the tag's changelog notes.
