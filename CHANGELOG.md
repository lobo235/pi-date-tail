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
- A `date` section another extension put in the system prompt wins: no message is added.
- CI: tests, pi's own extension loader and a real pi with a fake model on Linux and macOS, a secret scan
  and a package-contents check; a nightly run against the newest pi; npm publishing by trusted publishing.

### Changed

- A date message that the latest compaction kept (at or after its first kept entry) counts as present, so
  the next prompt no longer adds a second copy. A kept message from an earlier day still gets today's added.
