# Friendship Garden PRD

## Problem Statement

People often care about maintaining close friendships but lose track of when they last spoke to specific friends. This is especially easy when relationships are healthy but low-friction: nobody is upset, nothing is urgent, and time quietly passes. The result is accidental neglect, not lack of care.

The user wants a private, mobile-first web app that turns friendship maintenance into a gentle weekly ritual. Instead of a social CRM, task manager, or journaling system, the app should present an intentional circle of friends as a garden. Friends who have not been contacted recently should visibly need watering, making it easy to notice who deserves attention without creating guilt, surveillance, or social pressure.

## Solution

Build a private, local-first web app called Friendship Garden. The app shows an intentional garden of friends, each represented as a plant-like item. The garden helps the user perform a weekly check-in by showing:

- All friends in the intentional close circle.
- The last time each friend was spoken to.
- Which friends need watering because their contact cadence has elapsed.
- Upcoming birthdays as lightweight garden highlights.
- A fast way to log a conversation after speaking with someone.

The first version should be deliberately collapsed around one core behavior: preventing accidental neglect. It should not become a contact manager, message automation tool, calendar product, or relationship journal.

Data should live locally in the browser, with import/export support so the user can back up or move their garden manually without requiring an account, backend, or third-party integrations.

## User Stories

1. As a friendship garden owner, I want to add a friend manually, so that I can intentionally choose who belongs in my garden.
2. As a friendship garden owner, I want the app to start empty, so that it does not assume my contacts are meaningful relationships.
3. As a friendship garden owner, I want to enter a friend's name, so that I can recognize them in the garden.
4. As a friendship garden owner, I want to optionally enter a friend's birthday, so that the garden can highlight upcoming birthdays.
5. As a friendship garden owner, I want each friend to have a default two-week contact cadence, so that I get a sensible reminder rule without configuration work.
6. As a friendship garden owner, I want to customize a friend's cadence, so that different friendships can have different maintenance rhythms.
7. As a friendship garden owner, I want to record when I last spoke to a friend, so that the garden reflects the current state of the relationship.
8. As a friendship garden owner, I want to log a conversation quickly from the garden, so that updating the app does not become a chore.
9. As a friendship garden owner, I want logging a conversation to reset that friend's watering state, so that the garden immediately reflects that I reached out.
10. As a friendship garden owner, I want to optionally mark the type of interaction, so that I can distinguish messages, calls, and in-person conversations when useful.
11. As a friendship garden owner, I want interaction type to be optional, so that logging a conversation remains low-friction.
12. As a friendship garden owner, I want to optionally add a short note to a logged conversation, so that I can remember lightweight context without creating a full journal.
13. As a friendship garden owner, I want to see a basic history of conversations for each friend, so that I can understand recent contact patterns.
14. As a friendship garden owner, I want the garden to show who needs watering, so that I can see who I have not spoken to recently.
15. As a friendship garden owner, I want friends who need watering to look gently dry, so that the app gives a clear signal without implying the friendship is dying.
16. As a friendship garden owner, I want the garden to show the number of days since I last spoke to each friend, so that the signal is understandable and concrete.
17. As a friendship garden owner, I want the app to avoid guilt-heavy language, so that friendship maintenance feels caring rather than punitive.
18. As a friendship garden owner, I want the home screen to support a weekly check-in ritual, so that I can review my garden at a predictable time.
19. As a friendship garden owner, I want to see the most urgent friends during my weekly check-in, so that I know who deserves attention first.
20. As a friendship garden owner, I want upcoming birthdays to be highlighted in the garden, so that I can notice important relationship moments.
21. As a friendship garden owner, I want birthday highlighting without a separate reminder engine, so that the first version stays focused on contact neglect.
22. As a friendship garden owner, I want the app to work well on mobile web, so that I can log conversations soon after they happen.
23. As a friendship garden owner, I want large, obvious tap targets, so that the app is comfortable to use one-handed.
24. As a friendship garden owner, I want the app to support between zero and twenty-five friends, so that the garden works for a small intentional circle.
25. As a friendship garden owner, I want a useful empty state, so that I understand how to begin when I have no friends added yet.
26. As a friendship garden owner, I want a private app that friends cannot see, so that the garden does not create social pressure or surveillance concerns.
27. As a friendship garden owner, I want my data to stay local by default, so that I do not need an account or cloud storage for sensitive relationship data.
28. As a friendship garden owner, I want to export my garden data, so that I can back it up manually.
29. As a friendship garden owner, I want to import previously exported garden data, so that I can restore or move my garden.
30. As a friendship garden owner, I want imports to validate the data before replacing my garden, so that malformed files do not silently corrupt my records.
31. As a friendship garden owner, I want clear feedback after import or export, so that I know whether my backup action succeeded.
32. As a friendship garden owner, I want to edit a friend's details, so that I can correct names, birthdays, or cadence settings.
33. As a friendship garden owner, I want to remove a friend from the garden, so that the intentional circle remains accurate.
34. As a friendship garden owner, I want destructive actions to be confirmed, so that I do not accidentally delete relationship history.
35. As a friendship garden owner, I want the app to distinguish between friends who are watered, nearing dryness, and needing watering, so that I can prioritize attention.
36. As a friendship garden owner, I want the app to avoid push notifications in the first version, so that the experience remains calm and dashboard-based.
37. As a friendship garden owner, I want the app to avoid email reminders in the first version, so that the first version does not require notification infrastructure.
38. As a friendship garden owner, I want the app to avoid contact imports in the first version, so that the garden remains intentional rather than noisy.
39. As a friendship garden owner, I want the app to avoid message integrations in the first version, so that private communication data stays outside the system.
40. As a friendship garden owner, I want the garden metaphor to remain lightweight, so that the app feels warm without hiding important information.
41. As a friendship garden owner, I want the app to remain usable even if I skip a weekly check-in, so that stale friends are still visible the next time I open it.
42. As a friendship garden owner, I want the app to make the primary action obvious, so that I always know how to log that I spoke to someone.
43. As a friendship garden owner, I want optional fields to stay optional, so that I can maintain the garden with minimal data entry.
44. As a friendship garden owner, I want the app to treat any meaningful interaction as enough to water a friend, so that the system reflects real relationship maintenance rather than strict communication categories.
45. As a friendship garden owner, I want the app to remain separate from social networks, so that it serves my private intention rather than platform engagement.

## Implementation Decisions

- The first version will be mobile-web-first.
- The first version will be private and single-user.
- The app will be local-first, storing friendship garden data in browser storage.
- The app will support manual export and import for backup and portability.
- No account system, backend database, cloud sync, or authentication is required for the first version.
- The core product job is preventing accidental friendship neglect.
- The home screen will be optimized for a weekly check-in ritual rather than constant daily usage.
- Friends will be added manually to preserve the intentional close-circle model.
- The default contact cadence will be two weeks.
- Each friend may override the default cadence.
- A friend profile will include name, optional birthday, cadence, current last-talked date, and basic interaction history.
- Conversation history will store date, optional interaction type, and optional note.
- Interaction type should be optional and should not block fast logging.
- The primary action from a friend in the garden will be logging a conversation.
- Logging a conversation updates the friend state immediately and records the interaction in basic history.
- The garden will visually indicate friends who need watering after their cadence has elapsed.
- The garden will use gentle dry or needs-watering visual language rather than death, decay, shame, or punishment.
- Birthdays will be represented as garden highlights, not as a separate notification or reminder engine.
- The system should model watering state as derived data from last interaction date and cadence, not as manually stored state.
- The app should support approximately zero to twenty-five friends without requiring search, grouping, or filtering in the first version.
- The app should provide clear empty states for a new garden.
- Import must validate data before applying it.
- Export should include enough data to fully restore friends, cadence settings, birthdays, and conversation history.
- A Friend Garden domain module should encapsulate friend records, interaction logging, cadence calculations, birthday highlighting, import validation, and export serialization behind a small interface.
- A Garden State module should derive display states such as watered, nearing dryness, needs watering, and birthday highlight from the underlying domain data.
- A Persistence module should handle local browser storage and import/export boundaries without leaking storage details into the UI.
- UI components should be mostly presentational where practical, with state and domain decisions kept out of visual components.
- The first implementation should not optimize for integrations or future cloud sync unless doing so costs very little, because premature integration seams will make the app more complex before the core behavior is proven.

## Testing Decisions

- Good tests should verify external behavior and domain rules rather than implementation details.
- Tests should focus on what the user can observe or what the domain guarantees, not internal component structure.
- The Friend Garden domain module should be tested because it owns the highest-value rules: adding friends, editing friends, logging conversations, maintaining history, and deriving last-talked values.
- The cadence calculation should be tested because it determines whether a friend needs watering.
- Birthday highlighting should be tested because date logic is easy to get subtly wrong around month/year boundaries.
- Import validation should be tested because malformed backup data must not corrupt the garden.
- Export/import round-tripping should be tested because the app is local-first and backup is the only portability mechanism in v1.
- Persistence should be tested at its public boundary with fake or test storage, not by coupling tests to browser implementation details.
- UI tests should cover the primary user flows: empty garden, adding a friend, seeing watering state, logging a conversation, seeing birthday highlights, exporting data, and importing data.
- Visual polish does not need brittle screenshot tests in the first version unless the project already has that pattern.
- There is no prior test structure in the current directory because the project has no repository files yet.

## Out of Scope

- Push notifications.
- Email digests.
- SMS reminders.
- Calendar integrations.
- Contacts import.
- Message integrations with WhatsApp, iMessage, Discord, Slack, Instagram, or similar services.
- AI-generated outreach suggestions.
- Shared gardens.
- Friend-visible status.
- Multi-user collaboration.
- Authentication.
- Cloud sync.
- Backend database.
- Full CRM contact fields such as phone numbers, emails, handles, addresses, or relationship tags.
- Rich journaling, attachments, memories, or emotional scoring.
- Required interaction quality ratings.
- Task queue workflows.
- Advanced filtering, grouping, or friend tiers.
- Analytics dashboards.
- Native mobile app implementation.

## Further Notes

- The app succeeds only if the user actually performs the weekly check-in ritual. Because v1 has no push or email reminders, the dashboard cannot remind the user unless the user opens it.
- If the weekly ritual fails, the next expansion should likely be a calm weekly digest rather than deeper profile features.
- The product should remain emotionally careful. Friendship maintenance is sensitive; the app should avoid guilt mechanics, streaks, punishment language, or visuals that imply a friendship is dying.
- The strongest product boundary is that this is not a social CRM. It is a private relationship maintenance garden.
- Intended issue tracker label: `ready-for-agent`.
- This PRD was saved locally because the current project directory is not a Git repository and no issue tracker was available.
