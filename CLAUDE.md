@AGENTS.md

## Integration Surface & Consumers

What pi-date-tail exposes, and who depends on it. The README's *Versioning* section is the SemVer contract.

**Exposes**

- The npm package `pi-date-tail`: the pi extension entry `src/index.ts` (`package.json` `pi.extensions`). The
  TypeScript modules are not an importable API.
- The environment variable `PI_DATE_TAIL_TZ` (unset means the process's zone; an invalid value stops pi at
  launch).
- The persisted custom message type `date-tail`, hidden (`display: false`): a calendar day and its zone, never a
  time, at most once per day per branch, and again after a compaction summarized it away.

**Consumers**

- pi users who install the package, and their transcripts.
- Tools that read pi transcripts and recognize or filter the `date-tail` message by type.
- Compaction extensions (pi's own, Longhaul) that summarize the message; the re-send after a compaction depends
  on it being summarized away.
- The maintainer's private operations repo carries an in-tree copy of this extension and a pre-push guard for
  this clone; a contract change is also a change there.
- Docs: README (*Configuration*, *Versioning*), `CHANGELOG.md`.
