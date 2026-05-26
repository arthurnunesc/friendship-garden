# Plan: Friendship Garden Implementation

> Source PRD: `plans/friendship-garden-prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Stack**: Vite + React + TypeScript + Vitest + plain CSS or CSS Modules.
- **Future mobile path**: React is chosen for the web UI because it keeps a future React Native migration path open, but v1 will not introduce React Native Web, Expo, or native abstractions prematurely.
- **Routes**: Start as a single-page local app at `/`; friend detail, edit, import, and export flows can be represented as in-app views or dialogs until deeper URL routing is justified.
- **Storage**: Browser-local storage only for v1. Storage access must stay behind a persistence boundary so the app can later move from `localStorage` to IndexedDB or a native adapter without changing domain behavior.
- **Key models**: `Friend`, `Interaction`, `Garden`, `WateringState`, and `ImportExportPayload`.
- **Derived state**: Watering state and birthday highlights are calculated from stored friend data and interaction history; they are not manually stored as mutable state.
- **Privacy boundary**: No accounts, backend database, authentication, cloud sync, contact import, social integrations, message integrations, push notifications, or email reminders in v1.
- **Scale boundary**: The garden supports roughly zero to twenty-five friends; v1 does not require search, grouping, filtering, analytics, or CRM-style fields.
- **Testing approach**: Domain rules and import/export behavior should be covered with focused tests; UI tests should cover observable user flows rather than internal component structure.

---

## Phase 1: Empty Garden Foundation

**User stories**: 2, 25, 26, 27, 40, 42

### What to build

Create the mobile-first app foundation with an empty garden experience that explains the private, local-first purpose of the product and makes the primary action to add a friend obvious. This slice should be demoable without any saved data.

### Acceptance criteria

- [ ] The app opens to an empty garden state when no friends exist.
- [ ] The empty state explains that the garden starts intentionally empty and private.
- [ ] The primary action to add a friend is visible and comfortable on mobile.
- [ ] The UI avoids social CRM, guilt-heavy, punitive, or surveillance language.
- [ ] A basic test verifies the empty garden path and primary action are visible.

---

## Phase 2: Add and Display Friends

**User stories**: 1, 3, 4, 5, 6, 22, 23, 24, 43

### What to build

Allow the user to manually add friends with a required name, optional birthday, and contact cadence. Persist the garden locally and display added friends in a mobile-friendly garden view.

### Acceptance criteria

- [ ] A user can add a friend with a name and no optional fields.
- [ ] A user can optionally provide birthday and custom cadence values.
- [ ] A friend without a custom cadence receives the default two-week cadence.
- [ ] Added friends remain visible after reloading the app.
- [ ] The garden remains usable for zero to twenty-five friends without requiring search or grouping.
- [ ] Tests cover adding friends, optional fields, default cadence, custom cadence, and local persistence boundaries.

---

## Phase 3: Log Conversations

**User stories**: 7, 8, 9, 10, 11, 12, 13, 44

### What to build

Let the user quickly log that they had a meaningful interaction with a friend. Logging should support an interaction date, optional interaction type, and optional short note, then update the friend's recent history immediately.

### Acceptance criteria

- [ ] A user can log a conversation from a friend in the garden.
- [ ] Interaction type and note are optional and do not block fast logging.
- [ ] Logging a conversation updates the friend's last-spoken date immediately.
- [ ] A basic conversation history is visible for a friend.
- [ ] Any meaningful interaction can count as watering the friend regardless of category.
- [ ] Tests cover logging conversations, optional interaction metadata, history ordering, and last-spoken updates.

---

## Phase 4: Watering State and Weekly Check-In

**User stories**: 14, 15, 16, 17, 18, 19, 35, 41

### What to build

Derive and display each friend's garden state from their last interaction date and cadence. The home screen should support a weekly check-in ritual by making the most urgent friends easy to notice without shaming the user.

### Acceptance criteria

- [ ] Friends display as watered, nearing dryness, or needing watering based on derived state.
- [ ] The app shows days since the user last spoke to each friend.
- [ ] Friends who need watering are visually distinct in a gentle, non-punitive way.
- [ ] The weekly check-in view makes the most urgent friends clear.
- [ ] Skipping a weekly check-in still leaves stale friends visible the next time the app opens.
- [ ] Tests cover cadence boundaries, derived watering states, urgent ordering, and skipped check-in behavior.

---

## Phase 5: Birthday Highlights

**User stories**: 20, 21

### What to build

Add upcoming birthday highlights directly into the garden display, keeping birthdays as lightweight contextual signals rather than creating a separate reminder engine.

### Acceptance criteria

- [ ] Friends with upcoming birthdays receive a visible garden highlight.
- [ ] Birthday highlighting works without push notifications, email reminders, or calendar integrations.
- [ ] Friends without birthdays are unaffected.
- [ ] Tests cover upcoming birthday windows and date boundary cases around month and year changes.

---

## Phase 6: Edit and Remove Friends

**User stories**: 32, 33, 34

### What to build

Allow the user to correct friend details and remove friends from the intentional circle. Destructive actions should be confirmed before relationship history is deleted.

### Acceptance criteria

- [ ] A user can edit a friend's name, birthday, and cadence.
- [ ] Edits are persisted locally and reflected in derived garden state.
- [ ] A user can remove a friend only after confirming the destructive action.
- [ ] Cancelling removal preserves the friend and their history.
- [ ] Tests cover editing, persistence after edits, removal confirmation, and cancellation.

---

## Phase 7: Import and Export

**User stories**: 28, 29, 30, 31

### What to build

Provide manual backup and restore through export and import. Export should include enough data to fully restore the garden, and import must validate the payload before replacing local data.

### Acceptance criteria

- [ ] A user can export the full garden data to a backup payload.
- [ ] The exported payload includes friends, cadence settings, birthdays, and conversation history.
- [ ] A user can import a valid previously exported payload and restore the garden.
- [ ] Malformed import data is rejected before replacing current garden data.
- [ ] The app gives clear success or failure feedback after import and export actions.
- [ ] Tests cover export shape, import validation, failed imports, successful imports, and export/import round-tripping.

---

## Phase 8: Boundary Hardening

**User stories**: 36, 37, 38, 39, 45

### What to build

Verify that v1 remains inside the intended product boundary: a private dashboard for intentional friendship maintenance, not a notification system, contact manager, message integration, social network, or CRM.

### Acceptance criteria

- [ ] The app does not request notification, email, contacts, calendar, or message permissions.
- [ ] There are no contact imports, platform integrations, message automations, or friend-visible status features.
- [ ] UI copy reinforces private intentional maintenance rather than engagement mechanics.
- [ ] Existing core flows still work after boundary cleanup and polish.
- [ ] A final v1 review confirms every PRD out-of-scope item remains excluded.
