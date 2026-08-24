# Setup

The dashboard runs with **no backend and no hardware** out of the box
(`NEXT_PUBLIC_DATA_SOURCE=mock`). Everything below is only needed for the
Firebase work.

## Everyday commands

```bash
npm run dev          # http://localhost:3000
npm test             # unit tests (node env, no emulator)
npm run typecheck
npm run lint
npm run build
```

## Firebase emulators

Rules tests run against the Firestore emulator:

```bash
npm run emulators    # start auth + firestore, UI on :4000
npm run test:rules   # start emulators, run the rules suite, shut down
```

### Two environment gotchas

**1. The Firestore emulator is a Java application.** Without a JDK you get
`Process 'java -version' has exited with code 1`. On macOS the `temurin` cask
needs a `sudo` password; the Homebrew formula does not:

```bash
brew install openjdk
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
```

`openjdk` is keg-only, so that `PATH` line is required in any shell that runs
the emulators. Add it to `~/.zshrc` to make it permanent.

**2. Firestore runs on port 8085, not the default 8080.** Port 8080 was already
taken on the development machine. The port lives in `firebase.json`; change it
there if 8085 clashes for you, and nothing else needs updating.

## Node version

Next.js 15.5 targets Node 22 LTS / 24. On **Node 25** the dev server aborts with
a V8 error (`Lazy deopt after a fast API call ...`) that looks like an app bug
but is not. Either use Node 22/24, or start the dev server as:

```bash
node --no-turbo-fast-api-calls ./node_modules/next/dist/bin/next dev
```

The flag cannot go through `NODE_OPTIONS` — node rejects V8 flags there.

Also: do not run `next build` while `next dev` is running. They share `.next`
and the dev server starts returning HTTP 500. Recover with `rm -rf .next`.

## Credentials

Firebase config comes from `.env.local`, which is git-ignored and must stay that
way. Emulator work needs no credentials at all — the project id `demo-feeder` is
recognised as a demo project and never touches a real backend.
