# Working on pi-date-tail (for coding agents)

pi-date-tail is a pi extension that gives the model the calendar day as a hidden custom message appended to the
conversation, once per day and again after a compaction that summarized it away, and never in the system prompt. Human contributors:
[CONTRIBUTING.md](CONTRIBUTING.md) says the same with more context.

## Commands

```bash
npm ci                 # Node >= 22.19; installs the vendored pi as a devDependency
npm test               # typecheck + src/**/*.test.ts + load smoke + pi smoke; must pass before any commit
npm run typecheck      # tsc only
node --test src/date-message.test.ts   # one file
npm run load-smoke     # the entry through the vendored pi's own loader (jiti)
npm run smoke          # the vendored pi (packed + installed copy, and src), fresh HOME and agent dir, fake model
npm run smoke -- --keep   # the same, leaving the temporary directory for inspection
npm run check-pack     # what npm would publish: the allowlist, nothing test-only
```

## Layout

- `src/index.ts`: the extension entry: the factory pi calls, and `registerDateTail` with injectable env and clock.
- `src/date-message.ts`: the message text and the once-per-day check. `src/time-zone.ts`: `PI_DATE_TAIL_TZ`.
- `src/test-support.ts`: a fake pi and a helper that runs code under a given `TZ`. Never shipped.
- `load-smoke.mjs`, `scripts/pi-smoke.ts` (with `scripts/rpc-pi.ts`, `scripts/packed.ts`, `scripts/child-env.ts`
  and `scripts/fake-model.ts`),
  `scripts/check-pack.ts`: the smokes and the package check.

## Invariants (do not break these)

1. **Never touch the system prompt.** No section, no `systemPrompt` result, no launch-time flag. The whole point is
   that nothing ahead of the message changes.
2. **A day, never a time.** Anything that changes more than once a day re-sends a message on every prompt.
3. **Persisted names never change.** The custom message type `date-tail` and the variable `PI_DATE_TAIL_TZ` are
   the SemVer contract; renaming either is a major version.
4. **The handler never fails a prompt.** Everything per prompt is guarded; only an invalid `PI_DATE_TAIL_TZ` may
   throw, and only at load.
5. **No hard-coded zone.** Unset means the process's own zone.
6. **No network calls, no files of its own.**
7. **Test data is synthetic.** No real transcripts, hostnames, IP addresses, user names or keys.

## How to change code

- Test first, one behaviour at a time, through the public function or the registered handler. Use the fake pi in
  `src/test-support.ts`, not mocks that assert call order.
- Functions stay under 60 lines and files under 400.
- Update the README and `CHANGELOG.md` (under `## [Unreleased]`) in the same change.
- Do not bump the version unless asked; it is a release step.
