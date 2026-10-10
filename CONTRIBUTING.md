# Contributing to pi-date-tail

Thank you for helping. This file says how a change gets in. Coding agents: [AGENTS.md](AGENTS.md) has the same
rules in a shorter form.

## Before you write code

**Open an issue first** for anything larger than a typo or a one-line fix. pi-date-tail is deliberately small:
it gives the model the calendar day and nothing else, and it never touches the system prompt. An issue saves you
writing a pull request that cannot be merged.

**Never paste a transcript or a session file into an issue**: it contains your conversations. Security problems
go to [SECURITY.md](SECURITY.md), not an issue.

## Setting up

```bash
git clone https://github.com/lobo235/pi-date-tail && cd pi-date-tail
npm ci          # Node >= 22.19; installs the pi the tests run against
npm test        # typecheck, unit tests, pi's loader, a real pi with a fake model
```

To try a change in your own pi: `pi install /path/to/pi-date-tail` (a local path install), then start a new
pi session. `pi remove /path/to/pi-date-tail` undoes it.

## Making the change

- **The pull request title** becomes the squash commit's subject: `area: summary`, in the imperative or as a
  statement of the new behaviour (`render: keep the Goal line once the Request moves`).
- **Tests first**, one behaviour at a time, through the public function or the registered handler. Fakes over
  mocks: `src/test-support.ts` has a fake pi.
- **Test data is synthetic.** No real transcript, hostname, IP address, user name or key.
- **Small pieces**: functions under 60 lines, files under 400.
- **Docs in the same pull request**: the README for behaviour or configuration, and a line in `CHANGELOG.md`
  under `## [Unreleased]`.
- The persisted message type `date-tail` and the `PI_DATE_TAIL_TZ` variable never change outside a major
  version; see the README's *Versioning*.

`npm test` must pass. CI runs it on Linux, macOS and Windows, plus a secret scan, a security audit of the workflows (zizmor) and a check
of what the package would publish (`npm run check-pack`).

## A new pi version

The nightly workflow installs the newest pi and runs `npm test` against it; a failure opens an issue. To check
one by hand, set the exact version of `@earendil-works/pi-coding-agent` in `devDependencies`, run
`npm install`, then `npm test`.

## Releasing (maintainers)

1. Bump `version` in `package.json` (it starts at `0.0.0`), and rename `## [Unreleased]` in `CHANGELOG.md` to
   `## [vX.Y.Z] - YYYY-MM-DD`, with the `v` (`release.yml` looks for exactly that heading). Add a fresh empty
   `## [Unreleased]` above it. Point `pi.image` in `package.json` at the new tag too: the release job checks it.
2. **The first publish of the package is manual.** npm cannot configure a trusted publisher for a package that
   does not exist yet, so the first version is published by hand: `npm publish --access public`, with 2FA. Right
   after it, on npmjs.com: configure the trusted publisher (this repository, workflow `release.yml`, environment
   `npm`), set publishing access to "require two-factor authentication and disallow tokens", and delete any token
   used for the first publish.
3. **Every later release:** tag `vX.Y.Z` on `main` and push the tag. `release.yml` checks the tag against
   `package.json` and the changelog, runs the tests, and publishes with provenance from the `npm` environment.
4. A trusted-publisher configuration must complete its first publish within 2 days, or it expires and has to be
   set up again.

**Where a release shows up.** The [pi package gallery](https://pi.dev/packages) lists the package from npm within
minutes of a publish: its card shows the `package.json` `description` and the `pi.image` card
(`.github/assets/card.png`, pinned to the release tag), and its page renders the README inside the published
tarball. Editing either on GitHub changes nothing there until the next release, and a README link to a file the
package does not ship must be an absolute GitHub URL. After `publish`, `release.yml` creates the GitHub Release
for the tag from its `CHANGELOG.md` section; for the manual first publish, run
`gh release create vX.Y.Z --verify-tag --title vX.Y.Z --notes-file <that section>` instead. The repository's
social preview (Settings > General) is `.github/assets/social-preview.png`, uploaded by hand.

## Repository settings (maintainers)

The workflows and docs depend on these GitHub settings:

- **Environment `npm`** with required reviewers (otherwise a tag publishes without a maintainer's approval) and a
  deployment tag rule for `v*`.
- **Rulesets**: `main` requires a pull request approved by a code owner (`.github/CODEOWNERS`), with its review threads
  resolved and a linear history (squash or
  rebase merges), and every CI check: the `test` legs, `workflows` and `secrets`. Maintainers can bypass it. `v*` tags are
  protected.
- **Security**: Dependabot alerts and security updates, plus the weekly version updates in `.github/dependabot.yml`; CodeQL
  default setup, whose high and critical alerts block a merge; secret scanning with push protection.
- **Discussions** enabled: the issue template's "Questions and setup help" link points there.
- **Private vulnerability reporting** enabled: SECURITY.md sends reports to the Security tab.
- The nightly workflow opens issues, never pull requests, so "Allow GitHub Actions to create and approve pull
  requests" is not needed.
- GitHub pauses scheduled workflows in a repository with no activity for 60 days; re-enable `nightly-pi` from
  the Actions tab when that happens.

## Licence

pi-date-tail is MIT licensed. By opening a pull request you agree your contribution is licensed under the same
terms (inbound = outbound). There is no CLA and no sign-off requirement.

## Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
