# Contributing

Thanks for taking an interest. This is a small project, so the rules are short.

## Send pull requests to `dev`

**Always target `dev`. Never `main`.**

`main` is the stable branch and only ever receives merges from `dev`. GitHub
cannot block a pull request from targeting a branch, so this is the one rule
that relies on you rather than on tooling — a PR opened against `main` will be
closed and asked to retarget.

`dev` is the default branch, so the base is already correct unless you change it.

## Layout

Two independent npm packages with no workspace root. Install and run each from
its own directory; there is nothing to install at the top level.

| | |
| --- | --- |
| `server/` | Express 5 + TypeScript, MongoDB, Gemini, SSE streaming |
| `client/` | React 19 + Vite + Tailwind |

## Getting set up

You need Node 22+, a MongoDB you can write to, and a Gemini API key.

```bash
cp server/.env.example server/.env   # fill in GEMINI_API_KEY, MONGODB_URI_DEV, JWT_SECRET
cp client/.env.example client/.env

cd server && npm install && npm run dev    # port 5000
cd client && npm install && npm run dev    # port 5173
```

The server reads `.env` from its working directory, so start it from `server/`.
It fails at boot rather than on the first request if a required variable is
missing — that is deliberate, and the message names the variable.

## Before you open a pull request

Run these in **both** packages. Coverage thresholds are enforced at 80%, not
advisory, so a change that adds untested code fails the last one.

```bash
npm run typecheck
npm test
npm run test:coverage
npm run lint          # client only (oxlint)
```

## How the code is expected to look

The seven coding standards in [`CLAUDE.md`](CLAUDE.md) apply to both packages —
guard clauses over nesting, names that say what a thing holds, external systems
kept behind a boundary, invalid states made unrepresentable, decisions separated
from actions, errors carrying a machine-readable `code`, and one reason per pull
request. [`client/CLAUDE.md`](client/CLAUDE.md) adds the frontend specifics,
including a 400-line file ceiling and the React Compiler rules.

Two conventions worth stating outright, because reviewers will ask:

- **Tests sit next to the code they cover** — `sse.ts` and `sse.test.ts` in the
  same folder. There is no mirrored `tests/` tree, so moving or deleting a
  module takes its test with it.
- **Query by accessible role or name in component tests**, never by test id or
  class name, so a test breaks when the UI stops being usable rather than when
  the markup is refactored.

Comments explain what is not obvious from the code, in one to three lines. A
comment restating the line below it will be removed.

## Commit messages

Conventional prefixes, imperative mood, lowercase after the colon:

```
feat: fold older messages into a rolling chat summary
fix: keep the view on a reply while it streams
docs: cover projects, compaction and limits in the README
chore: prepare the repository to be made public
test: cover middleware, models, and client pages
```

Say what the change does and, where it is not obvious, why. The body is a good
place for the reasoning that would otherwise become a comment.

## Reporting a security issue

Please do not open a public issue. Report it privately through GitHub's
[security advisories](https://github.com/UppiliSrinivas/ai-chat-app/security/advisories/new)
instead.
