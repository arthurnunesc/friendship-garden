# Plan: Native Mobile Migration

> Source context: `plans/friendship-garden-prd.md`, `plans/friendship-garden-implementation.md`, and the current Vite + React web app.

## Goal

Migrate Friendship Garden toward a native mobile app that is primarily individual, local-first, minimalist, calm, and dependable for remembering to talk to friends.

The existing web app should keep working during the migration. Treat it as the stable fallback until the native app has feature parity and tested local reminders.

## Product Direction

- Friendship Garden is primarily a private relationship-maintenance tool, not a social network, CRM, task manager, contact importer, or messaging integration.
- The native app should optimize for a small intentional circle of roughly zero to twenty-five friends.
- The core promise is calm remembrance: helping the user notice when a friend may deserve attention.
- Avoid guilt mechanics, streaks, punishment language, surveillance language, and visuals that imply a friendship is dying.
- Social features may come later, but must not shape the first native migration.
- The app should remain useful with no account, no backend, and no network connection.

## Repository Strategy

- Keep the current Vite web app at the repository root unchanged during the first migration phases.
- Add the native app under `apps/mobile` as an isolated Expo app.
- Do not convert the repository to a full monorepo until the native app proves the product direction.
- Do not move the current web source files during the initial migration.
- Do not change root web scripts unless a phase explicitly requires it.
- After every significant native change, rerun the current web test suite to confirm the web app still works.

## Durable Technical Decisions

- **Native stack**: Expo + React Native + TypeScript.
- **Mobile location**: `apps/mobile`.
- **Initial storage**: local mobile storage behind an adapter. `AsyncStorage` is acceptable first because the dataset is small and JSON-shaped.
- **Notifications**: native local scheduled notifications through `expo-notifications`, not PWA Web Push.
- **Reminder model**: schedule local notifications from friend cadence and last interaction. Do not rely on background JavaScript loops.
- **Backend**: no backend for the native migration.
- **Accounts**: no accounts for the native migration.
- **Social**: defer social features until the personal reminder loop is proven.
- **Domain sharing**: copy the small domain module into mobile first. Extract a shared package later only after native behavior is proven.

## Existing Web Domain To Preserve

The current app stores friendship records locally and derives watering state from friend data.

Important existing concepts:

- `Friend`
- `Interaction`
- `WateringState`
- `createFriend`
- `editFriend`
- `logInteraction`
- `deriveWateringState`
- `sortFriendsByUrgency`
- birthday highlighting
- import/export validation

Current watering behavior:

- A friend with no `lastInteractionAt` is `dry`.
- A friend is `watered` while `daysSince < cadenceDays`.
- A friend is `nearing` while `cadenceDays <= daysSince < cadenceDays * 1.5`.
- A friend is `dry` once `daysSince >= cadenceDays * 1.5`.

Native reminders should use a related but separate rule:

- Schedule reminders when the contact cadence has elapsed, not when the friend reaches the `dry` threshold.
- Example: if Alice has `cadenceDays = 14`, `lastInteractionAt = 2026-06-01`, and the preferred reminder time is `09:00`, the next reminder target is 2026-06-15 at 09:00.

## Implementation Guardrails

- Keep phases small and independently verifiable.
- Prefer vertical slices over broad rewrites.
- Preserve the current web app as a working fallback.
- Do not introduce a backend, auth, contact import, message integration, calendar integration, or social graph during this migration.
- Do not promise exact-to-the-minute notification delivery. Use copy such as "around your chosen time" when needed.
- Do not depend on background JS execution for reminders.
- Do not request notification permission on first launch. Ask only from a clear user action such as enabling reminders.
- Keep reminder copy calm and optional.

---

## Phase 0: Baseline Web Checks

**Purpose**: Establish that the current web app works before native work begins.

### What to do

Run and record the current web baseline. This phase should not change production code.

### AI checks

- Inspect `git status` before editing.
- Run the existing web tests with `npm test`.
- Confirm the current domain model and import/export shape still match the PRD.
- Confirm the root `package.json` scripts are still web-only: `dev`, `build`, `preview`, and `test`.

### Manual checks for the human

- Open the current web app locally.
- Add a friend.
- Log an interaction.
- Edit cadence.
- Delete a friend only after confirming the destructive flow is acceptable.
- Export data.
- Import the exported data.
- Confirm the web app still feels acceptable as the fallback while native work happens.

### Acceptance criteria

- [ ] Existing web tests pass.
- [ ] Current web app works manually for the core flows.
- [ ] Any existing dirty git changes are understood and not overwritten.
- [ ] No native code has been added yet.

---

## Phase 1: Add Isolated Expo App

**Purpose**: Create the native app without disturbing the current web app.

### What to build

Create an Expo + React Native + TypeScript app under `apps/mobile` with a minimal placeholder screen.

Do not move existing web files. Do not change the root web app entrypoint. Keep mobile dependencies scoped to the mobile app unless Expo tooling requires otherwise.

### Suggested structure

```text
apps/
  mobile/
    app.json or app.config.ts
    package.json
    tsconfig.json
    src/
      App.tsx or app/
```

The exact Expo routing choice can be decided during implementation. Prefer the simplest Expo template that supports TypeScript and native notifications later.

### AI checks

- Confirm the Expo app starts.
- Run any generated mobile typecheck/lint/test command if available.
- Run the root web tests after adding the native app.
- Confirm the root web app still starts with the same command as before.

### Manual checks for the human

- Start the Expo dev server from `apps/mobile`.
- Open the placeholder app in Expo Go or a development build.
- Confirm it works on at least one target device or simulator.

### Acceptance criteria

- [ ] `apps/mobile` exists and starts independently.
- [ ] The web app remains at the repository root.
- [ ] Root web tests still pass.
- [ ] No current web user flow was changed.

---

## Phase 2: Port Domain And Persistence

**Purpose**: Make the native app understand the same friendship garden rules as the web app.

### What to build

Copy the pure domain behavior into the mobile app. Keep it framework-independent inside the mobile source tree.

Port these behaviors:

- create friend
- edit friend
- log interaction
- delete interaction if present in the current web app
- derive watering state
- sort friends by urgency
- detect upcoming birthdays
- validate import payloads
- export garden payloads

Add a mobile persistence adapter. Start with local storage only. The storage API should hide the actual storage implementation from the UI.

### Why copy first instead of sharing immediately

The current domain module is small. Copying it avoids build-tooling churn in the working web app. Extracting a shared `packages/garden-core` package is useful later, but doing it first increases migration risk.

### AI checks

- Port or recreate the relevant domain tests in the mobile app.
- Verify cadence boundary behavior matches the web tests.
- Verify import validation rejects malformed payloads.
- Verify export/import round-tripping preserves friends, birthdays, cadence, and interaction history.
- Run root web tests after the mobile domain is added.

### Manual checks for the human

- None required unless the AI reports a storage or device-specific issue.

### Acceptance criteria

- [ ] Mobile domain tests cover creation, editing, logging, watering state, birthday highlighting, import, and export.
- [ ] Mobile persistence can save and load friends.
- [ ] Web app behavior is unchanged.
- [ ] Root web tests still pass.

---

## Phase 3: Build Native Core UI

**Purpose**: Recreate the working personal garden experience natively before adding reminders.

### What to build

Build the native app's core flows:

- empty garden state
- add friend
- display garden list
- display watering state
- display days since last interaction
- log interaction quickly
- optional interaction type
- optional note
- basic interaction history
- edit friend
- remove friend with confirmation
- birthday highlight

Keep the UI mobile-first and one-handed-friendly. Use large tap targets and calm language.

### Product copy guidance

Good direction:

- "Your garden is quiet right now. Add someone you want to keep close."
- "May need attention"
- "Last talked 12 days ago"
- "Log a conversation"

Avoid:

- "Neglected"
- "Dead friendship"
- "Failed streak"
- "You forgot Alice"

### AI checks

- Test core domain behavior through the native state layer.
- Add UI tests only where stable and valuable.
- Run mobile tests.
- Run root web tests.

### Manual checks for the human

- Add three to five friends on a physical phone if available.
- Log interactions.
- Edit cadence.
- Delete a friend and confirm the destructive flow is clear.
- Restart the app and confirm data persists.
- Confirm the app feels calmer and more native than the web fallback.

### Acceptance criteria

- [ ] A user can maintain a small friendship garden in the native app without notifications.
- [ ] Native data persists across app restarts.
- [ ] UI avoids guilt-heavy language.
- [ ] Web app still works and tests pass.

---

## Phase 4: Add Reminder Settings And Permission UX

**Purpose**: Let the user opt into reminders deliberately.

### What to build

Add reminder settings before scheduling per-friend notifications.

Required settings:

- reminders enabled/disabled
- preferred reminder time

Required permission behavior:

- Ask notification permission only after the user enables reminders or taps an explicit permission action.
- Handle denied permission gracefully.
- Let the user keep using the app without reminders.
- On Android, configure a notification channel before requesting/scheduling notifications.

Recommended explanation copy:

> Friendship Garden can gently remind you when someone may need attention.

### AI checks

- Test reminder setting persistence.
- Test enable/disable state transitions.
- Test denied-permission state at the logic level.
- Verify the app does not request notification permission during first launch.
- Run root web tests.

### Manual checks for the human

- Enable reminders on iOS.
- Enable reminders on Android if available.
- Deny permission once and confirm the app handles it gracefully.
- Re-enable permission from OS settings if practical.

### Acceptance criteria

- [ ] User can set a preferred reminder time.
- [ ] User can enable and disable reminders.
- [ ] Permission is requested only from explicit user action.
- [ ] Permission denied does not break the app.
- [ ] No per-friend reminders are required yet.

---

## Phase 5: Implement Local Notification Scheduler

**Purpose**: Make the native app send local reminders without backend infrastructure.

### What to build

Add a scheduling module that owns all notification scheduling decisions.

The scheduler should:

- compute the next reminder target for each friend
- schedule a local notification when reminders are enabled
- cancel scheduled notifications when reminders are disabled
- cancel and reschedule notifications when friend data changes
- reconcile all schedules on app startup
- store scheduled notification identifiers so stale schedules can be cancelled

### Required reschedule triggers

Reschedule reminders after:

- adding a friend
- logging an interaction
- editing a friend name
- editing a friend cadence
- deleting a friend
- changing the preferred reminder time
- enabling reminders
- disabling reminders
- importing garden data

### Reminder calculation rule

Use the cadence-due date, not the dry threshold.

```text
nextReminderDate = date portion of lastInteractionAt + cadenceDays, at preferredReminderTime
```

If a friend has no `lastInteractionAt`, choose one of these behaviors during implementation and document it:

- schedule a gentle reminder for the next preferred reminder time, or
- do not schedule until the first interaction is logged.

Recommendation: schedule a gentle reminder for the next preferred reminder time, because a newly added friend with no interaction is already attention-worthy in the current domain model.

### Notification content guidance

Good direction:

- Title: "Friendship Garden"
- Body: "Alice may appreciate a check-in."
- Body for multiple friends: "3 friends may appreciate a check-in."

Avoid:

- "Alice is neglected."
- "Your friendship is dying."
- "You failed to keep up."

### AI checks

- Unit test next reminder calculation.
- Unit test friends with no `lastInteractionAt`.
- Unit test already-due friends.
- Unit test rescheduling after logging an interaction.
- Unit test changing cadence.
- Unit test deleting a friend cancels the old notification.
- Unit test disabling reminders cancels scheduled notifications.
- Unit test import triggers schedule reconciliation when reminders are enabled.
- Run root web tests.

### Manual checks for the human

- Schedule a test reminder one to two minutes in the future.
- Confirm it fires on iOS.
- Confirm it fires on Android if available.
- Kill the app and confirm the notification still fires.
- Lock the phone and confirm the notification still appears.
- Tap the notification and confirm it opens the app.
- Log an interaction before a scheduled reminder and confirm the old reminder does not still fire.

### Acceptance criteria

- [ ] Local notifications can be scheduled without a backend.
- [ ] Notifications fire when the app is closed, subject to normal OS permission and delivery behavior.
- [ ] Notifications are cancelled and rescheduled when relevant friend/reminder data changes.
- [ ] Notification copy is calm and non-punitive.
- [ ] The app does not rely on background JavaScript loops.

---

## Phase 6: Web-To-Mobile Import

**Purpose**: Let current web users move their data into the native app.

### What to build

Support importing the existing web export JSON into the mobile app.

The import flow must:

- validate before replacing mobile data
- preserve friend names
- preserve birthdays
- preserve cadence values
- preserve interaction history
- preserve `lastInteractionAt`
- show clear success or failure feedback
- trigger reminder schedule reconciliation if reminders are enabled

Mobile export should reuse the same backup shape if practical. If the shape changes, document why and maintain backward compatibility for current web exports.

### AI checks

- Test importing a current web export shape.
- Test malformed import rejection.
- Test export/import round-trip.
- Test import with reminders enabled triggers scheduler reconciliation.
- Run root web tests.

### Manual checks for the human

- Export real or sample data from the current web app.
- Import it into the native app.
- Confirm friends, birthdays, cadence, and interaction history are correct.
- If reminders are enabled, confirm imported friends receive expected schedules.

### Acceptance criteria

- [ ] Existing web export data can be imported into mobile.
- [ ] Invalid imports do not corrupt current mobile data.
- [ ] Import feedback is clear.
- [ ] Web app remains usable as fallback.

---

## Phase 7: Device Reliability Pass

**Purpose**: Verify the native app actually works on real devices.

### What to do

Test the complete native workflow on physical devices where possible. Notification behavior must be manually verified because simulators and Expo Go can differ from production-like builds.

### AI checks

- Run all mobile tests.
- Run all web tests.
- Inspect notification scheduling code for stale notification IDs.
- Inspect permission handling paths.
- Inspect startup reconciliation.
- Confirm no backend, auth, contact import, or message integration was added.

### Manual checks for the human

- Test on physical iPhone.
- Test on physical Android if available.
- Test permission granted.
- Test permission denied.
- Test permission re-enabled in OS settings.
- Test app killed.
- Test phone locked.
- Test tapping notification.
- Test changing reminder time.
- Test watering a friend before the reminder fires.
- Test deleting a friend before the reminder fires.
- Test importing data with reminders enabled.

### Acceptance criteria

- [ ] Human confirms reminders work on target iOS device.
- [ ] Human confirms reminders work on target Android device if Android is supported for release.
- [ ] Known platform caveats are documented.
- [ ] Native app is usable as the primary app.
- [ ] Web app still works.

---

## Phase 8: Optional Shared Core Extraction

**Purpose**: Remove domain duplication only after the native app has proven itself.

### When to do this

Do this only after the mobile app has working local storage, core UI, import/export, and notification scheduling.

### What to build

Extract pure domain logic into a shared package such as:

```text
packages/
  garden-core/
```

The shared package should contain only platform-independent code:

- domain types
- friend creation/editing/logging
- watering state derivation
- sorting
- birthday calculation
- import/export validation

Do not put React, React Native, browser storage, native storage, notifications, or UI code in the shared package.

### AI checks

- Move tests to shared core where practical.
- Verify web app imports shared core successfully.
- Verify mobile app imports shared core successfully.
- Run root web tests.
- Run mobile tests.

### Manual checks for the human

- Smoke test web app.
- Smoke test mobile app.

### Acceptance criteria

- [ ] Domain duplication is reduced.
- [ ] Web behavior remains unchanged.
- [ ] Mobile behavior remains unchanged.
- [ ] Shared core stays platform-independent.

---

## Phase 9: Future Social Layer Placeholder

**Purpose**: Keep a path open for social features without contaminating the native migration.

### Do not build during migration

- accounts
- backend sync
- friend-visible status
- shared gardens
- contact import
- message integrations
- server push notifications
- social feeds
- streaks
- engagement analytics

### Future-compatible direction

If social becomes necessary later, add it as an optional layer:

- optional account sync
- optional encrypted backup
- optional shared signal such as "I reached out"
- server push only for social events, not the core personal reminder loop

The core reminder experience should continue working locally without social infrastructure.

### Acceptance criteria

- [ ] Migration remains personal and local-first.
- [ ] Social design is deferred to a future PRD.
- [ ] Core reminders do not depend on social infrastructure.

---

## Suggested Work Chunks For Lower-Context Agents

Each chunk below should be small enough for a separate implementation session.

1. **Baseline verification only**
   - Run web tests.
   - Manually verify web app.
   - Do not edit code.

2. **Expo scaffold only**
   - Add `apps/mobile`.
   - Show placeholder screen.
   - Verify web tests still pass.

3. **Mobile domain port only**
   - Copy pure domain logic.
   - Add mobile domain tests.
   - No UI beyond placeholder.

4. **Mobile persistence only**
   - Add local storage adapter.
   - Save/load friends.
   - Test persistence boundary.

5. **Empty and add-friend UI only**
   - Empty state.
   - Add friend.
   - Persist and show list.

6. **Conversation logging UI only**
   - Log interaction.
   - Optional type/note.
   - Show recent history.

7. **Watering and birthday display only**
   - Derived state display.
   - Urgency ordering.
   - Birthday highlights.

8. **Edit/delete UI only**
   - Edit friend.
   - Delete with confirmation.
   - Preserve calm copy.

9. **Reminder settings only**
   - Enable/disable reminders.
   - Preferred reminder time.
   - Permission request UX.
   - No per-friend scheduling yet.

10. **Notification scheduler only**
    - Calculate next reminder date.
    - Schedule/cancel local notifications.
    - Reconcile on startup.

11. **Import/export only**
    - Import web export.
    - Validate malformed data.
    - Export mobile data.

12. **Physical-device reliability pass only**
    - iOS manual notification tests.
    - Android manual notification tests if supported.
    - Document caveats.

13. **Optional shared core extraction only**
    - Extract pure domain after mobile proves itself.
    - Keep platform adapters separate.

## Definition Of Done For The Migration

- Native app can be used as the primary Friendship Garden experience.
- User can add, edit, water, and remove friends.
- User can see gentle watering state and birthday highlights.
- User can enable local reminders and receive scheduled notifications without a backend.
- User can import existing web garden data.
- Existing web app remains functional as fallback.
- No social features, accounts, backend, contact imports, or message integrations were added.
- Reminder behavior and platform caveats are documented.
