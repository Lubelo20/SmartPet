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

## Taking it to a real Firebase project

1. Create a project in the Firebase console; note the project id.
2. Add a **Web app**; copy its config into `.env.local` using the names in
   `.env.local.example`.
3. Enable **Authentication → Sign-in method → Email/Password *and* Google.**
4. **Add your deployment domain to Authentication → Settings → Authorised
   domains.** Google sign-in fails with an opaque error otherwise — this is the
   single most common setup mistake.
5. Create a **Firestore database** in production mode.
6. Deploy the rules and indexes:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```
7. Seed the demo household (needs Admin credentials — see below):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project npm run seed -- --force
   ```
8. Set `NEXT_PUBLIC_DATA_SOURCE=firebase` in `.env.local` and `npm run dev`.

### About the seed script

`scripts/seed.ts` is the **one** place the Admin SDK is used. Everything the app
itself does goes through the client SDK under `firestore.rules`; seeding cannot,
because the rules require an authenticated member and the seed has to create the
household that membership refers to.

Against the emulator it needs no credentials:

```bash
NEXT_PUBLIC_USE_EMULATORS=true npm run seed
```

It refuses to run against a project whose id does not begin with `demo-` unless
you pass `--force`. Seeding a real project by accident is the failure worth
preventing.

## Troubleshooting

**`permission-denied`** — you are not a member of that household, or the rules
were never deployed. Check `memberUids` on the household document contains your
uid, and run the deploy in step 6.

**"The query requires an index"** — a composite index is missing. They are
declared in `firestore.indexes.json`; deploy them with step 6. The app surfaces
this as *"This query needs a Firestore index that has not been created yet."*

**Google sign-in fails with an opaque error** — your domain is not in
Authentication → Settings → Authorised domains. Step 4.

**Emulator will not start, "port taken"** — something else owns the port. Change
it in `firebase.json`; if you change the Firestore port, `lib/firebase/client.ts`
must match, and a test asserts that it does.

## Credentials

Firebase config comes from `.env.local`, which is git-ignored and must stay that
way. Emulator work needs no credentials at all — the project id `demo-feeder` is
recognised as a demo project and never touches a real backend.
