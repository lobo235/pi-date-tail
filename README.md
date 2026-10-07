# pi-date-tail

**Your calendar day for [pi](https://github.com/earendil-works/pi), without touching the system prompt.**

pi does not tell the model what day it is. It took the date out of its system prompt
([pi#6621](https://github.com/earendil-works/pi/issues/6621)) so the prompt stays the same from one day to the
next and a provider's prompt cache keeps working. That is the right call for the cache, but a model with no date
guesses one: it dates a changelog entry from its training cutoff, misreads "yesterday" in a log, or works out a
deadline from the wrong day. pi-date-tail gives the model the day back as one short, hidden message appended to
the conversation, once a day, so nothing a cache already holds ever changes.

## What the model sees

```
Current date: 2026-09-21 (Monday), your calendar day in Europe/Berlin. No time is given here: run `TZ=Europe/Berlin date` when a time matters.
```

One line, about 40 tokens, after your prompt. It is hidden in pi's interface; the model receives it like any
other message.

## Install

```bash
pi install npm:pi-date-tail
```

To try it for one session without installing: `pi -e npm:pi-date-tail`.

Requirements: Node.js 22.19 or newer (pi's own requirement) and pi (see *Compatibility*). No configuration is
needed: the day is your machine's.

## How it works

On every prompt you send, pi runs its extensions' `before_agent_start` handlers. pi-date-tail's handler returns
a custom message of type `date-tail` with `display: false`. pi appends it right after your prompt and records it
on the session transcript, so it stays in every later request of the session like any other message.

- **Once per calendar day.** If the current branch already carries today's message (the same text, after the
  latest compaction), nothing is added. A session that runs for a week gets one message a day.
- **Again after a compaction.** A compaction replaces older messages with a summary, which may have dropped the
  date, so the first prompt after one adds it again.
- **A new day without a restart.** The day is worked out on each prompt, so a session that crosses midnight
  gets the new day with your next prompt.
- **A day, never a time.** A time would change on every prompt. The message says so and gives the model the
  command for the current time, with the zone in it.
- **It steps aside for a `date` section.** If another extension already puts a `date` section in pi's system
  prompt, pi-date-tail adds nothing and leaves that section as it is.
- **It never fails a prompt.** If the clock cannot be read, no message is added. If the session branch cannot
  be read, the message is added anyway (a repeat is appended, so it costs no cache).

### Why a message, not the system prompt

Providers that cache prompts (hosted prompt caching, and self-hosted servers such as vLLM or llama.cpp with
prefix caching) reuse work only for the part of a request that is identical to an earlier one, counted from the
start. The system prompt comes first. Change one character in it and everything after it, the whole
conversation, is read again at full price and full latency.

- **A date in the system prompt** changes it once a day: the first request after midnight re-reads the whole
  conversation. That is why pi removed it.
- **A `date` section added by an extension** changes it much more often. As of pi 1.0.4, pi asks extensions for
  their sections only on prompts you send. A run that starts any other way (a message from another extension,
  a background task reporting back) is built from pi's base sections, so the date drops out, and your next
  prompt puts it back. Each flip is a change at the start of the request, and a server whose chat template
  renders all system text first re-reads the conversation every time.
- **A date fixed at launch** (`--append-system-prompt`) never flips, but it is wrong from midnight until the
  session restarts.
- **A message appended to the conversation** changes nothing ahead of it. A new day costs one short message at
  the end.

### When not to use it

- **You want the model to be date-blind**, for reproducible evaluations or replays: the message makes each
  day's requests differ.
- **You would rather not tell your model provider your time zone.** The message names it. Set
  `PI_DATE_TAIL_TZ=UTC` to send only the UTC day.
- **Another extension already gives the date as a message.** The model would get two.
- **You need the time of day in context.** pi-date-tail gives the day only; a time in the conversation would
  have to be re-sent constantly to stay true. The model can run `date`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PI_DATE_TAIL_TZ` | unset: this process's zone | The IANA time zone whose calendar day is given, such as `Europe/Berlin`, `America/New_York` or `UTC`. Unset or empty means the zone pi runs in: `TZ` when it names a zone, otherwise the system's. Surrounding spaces are ignored and the name is spelled canonically in the message (`europe/berlin` becomes `Europe/Berlin`). A value that is not a zone name, or an offset such as `+05:00`, stops pi at launch with an error naming the variable and the value. |

The zone is read once, when pi loads the extension; a change takes effect at the next pi start.

If `PI_DATE_TAIL_TZ` is unset and the process has no named zone (`TZ` set to something that is not a zone, for
example), the day is the one the process itself uses, and the message says "this machine's local time zone" and
suggests plain `date`.

## Compatibility

pi-date-tail uses one public extension event (`before_agent_start` returning a custom message) and reads the
session branch. It does not check pi's version at runtime.

- Tested on pi 1.0.4, the version this repository vendors for its tests.
- CI runs the tests, pi's own extension loader and a real pi (with a fake model) on every push, on Linux and
  macOS. Windows runs too, but is not yet required to pass.
- A nightly job runs the same against the newest pi on npm and opens an issue when it fails. A pi version known
  to break pi-date-tail is listed under *Known issues* until it is fixed.

## Known issues

- **A run that does not start from your prompt sees the last message.** A run started after midnight by
  another extension's message, before you send a prompt, still sees yesterday's date. That is the cost of never
  touching the system prompt; your next prompt brings the new day.
- **After a compaction that kept the date message, there are two copies** until the next compaction. One short
  line; the check does not try to tell a kept message from a summarized one.
- **The suggested `TZ=<zone> date` command assumes a POSIX shell.**
- No pi version is currently known to break it.

## Checking it on your own pi

```sh
dir=$(mktemp -d)
pi -p --session-dir "$dir" --model example-provider/example-model "What is today's date? Reply with only YYYY-MM-DD." </dev/null
date +%F                                                    # the two should agree
jq -c 'select(.type == "custom_message")' "$dir"/*.jsonl    # one entry, customType "date-tail"
```

Name your own model with `--model`. A second prompt the same day in that session (`pi -c --session-dir "$dir"
...`) adds no second entry.

## Versioning

pi-date-tail follows [Semantic Versioning](https://semver.org). The contract is:

- the environment variable `PI_DATE_TAIL_TZ` and its meaning, including that unset means the process's zone and
  an invalid value stops pi at launch;
- the persisted custom message type `date-tail`, hidden (`display: false`), which tools that read transcripts
  can rely on to recognize it;
- that the message gives a calendar day and its zone, never a time, at most once per day per branch and again
  after a compaction.

Removing or renaming any of these, or changing what it means, is a major version. The exact wording of the
message is not part of the contract; a release that changes it makes a resumed session add the new wording
once. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## More

[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
