# Friendship Garden — agent guide

Friendship Garden is a calm, local-first app for keeping in touch with
friends: a Vite + React web app, an Expo React Native app, and an optional
account-sync API (Netlify Functions, Better Auth, Neon Postgres, Resend).
The local garden works without an account.

## 1. Private operational context — first step of every session

This repository is **public**. The owner's development hosts, device testing
(native builds, simulators, emulators, noqa), provider logins, and their
runbooks are described in a private file outside it:

`~/Developer/systems/projects/friendship-garden/AGENTS.md`

If that file exists on this machine, read it before you start, and follow its
runbooks. If it does not exist, use only this file, and ask the owner before
any native build, device test, or hosted-resource step.

Never commit host names, IP addresses, account names, credential paths, or
other infrastructure details to this repository; they belong in the private
context. Check every diff for them before you commit.

## 2. Repository map and checks

Three **independent npm installs** (no workspaces; keep it that way):

| Path | What | Install | Checks (counts on 2026-11-20) |
| --- | --- | --- | --- |
| `/` (`src/`, `package.json`) | Web app: React 19, Vite 6, Vitest | `npm ci` | `npm test` (159), `npm run build` |
| `apps/api/` | Netlify Functions API: Better Auth 1.7.14, `pg`, Resend; migrations in `apps/api/migrations/` | `npm --prefix apps/api ci` | `npm --prefix apps/api test` (140), `npm --prefix apps/api run ts:check` |
| `apps/mobile/` | Expo SDK 54, React Native 0.81.5 | `npm --prefix apps/mobile ci` | in `apps/mobile`: `npm test` (232), `npm run ts:check` |
| `packages/garden-sync/` | Shared, dependency-free sync/merge logic. No `package.json`; imported by relative path. | — | covered by the suites above |
| `plans/` | Plans, status, dated evidence | — | — |

- Run all three suites after changes to `packages/garden-sync/` or shared types.
- **`node_modules` holds platform binaries.** Install on the machine that runs
  the code. A tree copied from macOS fails on Linux with
  `Cannot find module @rollup/rollup-linux-x64-gnu`; fix it with `npm ci` in that
  package (lockfiles stay unchanged).
- npm 11 skips install scripts outside `allowScripts` (`esbuild`, `fsevents`).
  All checks pass this way; keep the default.
- Generated and ignored: `dist/`, `apps/mobile/ios/`, `apps/mobile/android/`
  (Expo prebuild output). Change native settings through `apps/mobile/app.json`.
- Node: Netlify builds with Node 22; the API requires `^22.13.0 || >=24.0.0`.

## 3. Environments

- **Production**: <https://friendship-garden.arthurnun.es>, Netlify site
  `friendship-garden`, branch `main`. The `main--` alias is production too.
  Production is read-only for agents: no deploys, environment changes,
  migrations, or test data.
- **Feature preview**: branch `feature/mobile-app-creation` →
  <https://feature-mobile-app-creation--friendship-garden.netlify.app>.
  **A `git push` of this branch deploys the preview**, so push only when the
  user asks in the current task.
- **Development database**: Neon project `friendship-garden-development`; the
  retained branch is pinned in `apps/api/development-database.json`. Hosted
  tests use disposable branches; the procedure is in the private context.
- **Secrets**: `apps/api/.env.local` and `apps/mobile/.env.local` are ignored.
  Report variable names only, never values. Mobile config holds only public
  `EXPO_PUBLIC_*` values.

## 4. Hard rules

- **Disposable test resources.** Use isolated simulators, emulators, databases,
  and browser profiles. Register cleanup before you create them, remove only
  what you created, verify the removal, and report anything retained with its
  exact ID.
- **Approval each time** for outward-facing actions: `git push` (it deploys),
  Netlify/Neon/Resend/DNS changes, email to real addresses, and messages to
  outside services.
- **noqa**: free device commands only. Paid runs (`noqa runs`) and grounding
  by description (`-d`) need explicit approval.
- **Physical devices are out of scope**: the owner's iPhone and Android phone,
  and Apple signing certificates. A request to test "on iPhone" or "on
  Android" means the iOS simulator or Android emulator; say so in the reply.
  Simulator and emulator results are simulator evidence; name them that way,
  never as hardware proof.
- **Owner-only checks stay open until the owner reports them**: real Google
  consent, personal-inbox email delivery, and physical-phone acceptance
  (checklist in `plans/account-sync-foundation.md`, "Final user-run
  verification checklist").
- **Product invariants** (details in `plans/account-sync-foundation.md`):
  - Signing in never uploads the local garden; import needs explicit consent.
  - The local garden and local reminders keep working without an account.
  - A missing record in a sync payload is not a deletion; deletions use
    tombstones and version rules.
  - Native local notifications are the reminder channel; backend reminders
    are a later scope.

## 5. Status and sources of truth

Trust the newest dated status section of each plan over older unchecked lists.

| File | Source of truth for |
| --- | --- |
| `plans/account-sync-notifications-roadmap.md` | Overall roadmap and current status |
| `plans/account-sync-foundation.md` | Account sync design, hosted evidence, owner checklist |
| `plans/native-mobile-migration.md` | Native app phases (1–7 done, simulator/emulator scope) |
| `plans/noqa-mobile-testing.md` | Device test evidence up to 2026-11-02 (later runs: private context) |
| `plans/friendship-garden-prd.md`, `plans/friendship-garden-implementation.md` | Original web product |

## 6. Conventions

- **Commits**: Conventional Commits (`feat(sync):`, `fix(mobile):`,
  `docs(mobile):`, `chore(mobile):`), small and verified, no AI attribution.
- **Plans and docs**: ASD-STE100 English. Evidence sections are dated and
  record exact test counts, commits, resource IDs created and removed, and the
  limits of what was proven. Mark work as implemented, automatically checked,
  or manually verified, never more.
