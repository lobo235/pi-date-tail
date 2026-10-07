# Security policy

## Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab, then **Report a vulnerability**. Do not
open a public issue, discussion or pull request for it.

Include the pi-date-tail and pi versions, what an attacker controls, and what they gain. A minimal synthetic
input that shows it is ideal. **Do not send real transcripts or session files**; if the problem only shows on
real data, describe its shape instead.

You should get an acknowledgement within 7 days. A fix is released as a patch version, and the advisory is
published once a fixed version is available, crediting you unless you prefer otherwise.

## Supported versions

The latest release.

## Scope

pi-date-tail makes no network calls, writes no files of its own, and reads one environment variable
(`PI_DATE_TAIL_TZ`) and the current session branch. In scope: anything where it turns untrusted input into
harm. For example:

- session entries (a transcript you resume may have been written elsewhere) that make the handler throw, hang
  or fail your prompt;
- text other than a calendar day, a weekday and a validated zone name reaching the model through the date
  message. `PI_DATE_TAIL_TZ` is checked against the time zone database and replaced by its canonical name
  before it is used, so arbitrary text in it should never reach the model;
- the date message changing anything ahead of it in a request.

Out of scope: pi itself and other extensions (report those to their projects), and a model provider's handling
of what it is sent.
