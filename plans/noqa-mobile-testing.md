# Agent-driven mobile testing

## Scope

Use the local noqa CLI to check the native app. Phase 4 covers reminder
settings and permission UX; Phase 5 adds local scheduled notifications.
Do not use paid `noqa runs` without approval.

## iOS setup

- Desktop app: `/Applications/noqa.app` (must stay open).
- CLI: `noqa`; sign-in is already configured.
- Test simulator: iPhone 17 Pro, iOS 26.4.
- Simulator ID: `E69F5CFC-51AA-4FB7-81D9-4EC1468A03BA`.
- App ID: `com.friendshipgarden.app`.

Build and install a self-contained simulator app (no Metro server required):

```sh
cd apps/mobile
npx expo run:ios --configuration Release \
  --device E69F5CFC-51AA-4FB7-81D9-4EC1468A03BA --no-bundler
```

Expo generates the ignored `ios/` directory and installs CocoaPods.
Simulator builds do not need a physical-device signing certificate.

If Expo cannot find the Simulator desktop app, but `simctl` and noqa already
control the booted device, use the generated workspace directly:

```sh
# From apps/mobile, after Expo prebuild and CocoaPods installation
xcodebuild -workspace ios/FriendshipGarden.xcworkspace \
  -scheme FriendshipGarden -configuration Release -sdk iphonesimulator \
  -destination 'id=E69F5CFC-51AA-4FB7-81D9-4EC1468A03BA' \
  -derivedDataPath ios/build/noqa CODE_SIGNING_ALLOWED=NO \
  IPHONEOS_DEPLOYMENT_TARGET=15.1 ONLY_ACTIVE_ARCH=YES build
xcrun simctl install E69F5CFC-51AA-4FB7-81D9-4EC1468A03BA \
  ios/build/noqa/Build/Products/Release-iphonesimulator/FriendshipGarden.app
```

The deployment-target override also covers dependency resource bundles:
Xcode 27 rejects AsyncStorage's generated iOS 13.4 resource target.
Build only the active simulator architecture; the dual-architecture attempt
failed with Swift and asset-catalog errors on this machine.

## Device checks

```sh
noqa devices active
# Connect only if this simulator is not already active:
noqa devices connect E69F5CFC-51AA-4FB7-81D9-4EC1468A03BA
noqa action activate-app --bundle-id com.friendshipgarden.app
noqa screen
```

Inspect the screen before each action, then verify the result with another
`noqa screen`. Use coordinate actions from the screen tree to avoid paid
grounding calls. Keep test data on the simulator, not in a personal garden.

Phase 4 checks:

1. Fresh launch and opening settings do not request permission.
2. Enabling reminders opens the OS permission dialog.
3. Denial leaves reminders off and the garden usable.
4. Enable permission in OS Settings; return to the app and enable reminders.
5. Select a time, close settings, and reopen them.
6. Restart the app and verify the selected time and enabled state persist.
7. Disable reminders and verify the disabled state persists after restart.

Do not clear app data or uninstall an existing app without confirming that
it contains only disposable test data.

## Automated checks

```sh
# Repository root
npm test
# apps/mobile
npm test
npm run ts:check
```

## Limits

iOS simulator results do not prove physical-device delivery, locked-phone
behavior, or Android behavior. Android automation needs its own build and a working
UiAutomator2 driver before it can be called verified.

## Verified run: 2026-10-06

Built and installed the Release app with the direct `xcodebuild` command
above. noqa launched it and drove the following checks without paid runs:

| Check | Result |
| --- | --- |
| Fresh launch / opening reminder settings | No permission prompt |
| Enable reminders | OS notification permission dialog appeared |
| Deny permission | Reminders stayed off; denial explanation appeared |
| OS Settings recovery | Enabled permission through Settings → Apps → Friendship Garden → Notifications |
| Enable after recovery | Worked after tapping the in-app permission action |
| Time persistence | Selected 18:00; enabled state and time survived app restart (screen tree + screenshot) |
| Disable persistence | Off state survived app restart |
| Mobile unit tests / typecheck | 70 tests passed; typecheck passed |
| Root test suite | 186 tests passed |

Known UX finding: returning from OS Settings does not refresh permission
automatically. The denial message stays until the user taps “request
permission again” or reopens the settings screen. That action does not
re-show the iOS permission dialog after denial; permission must be changed
in OS Settings. This run recorded the issue; it did not change app logic.

Some switch taps needed `--duration 1` before their state changed. Always
verify state after the gesture; a successful CLI response alone is not proof.

Expo dependency check reported installed `54.0.35` versus expected
`~54.0.37`. No dependency upgrade was made as part of this setup.

## Verified run: 2026-10-07 — Phase 5

Rebuilt and installed the self-contained Release simulator app. All device
actions used local noqa commands; no paid runs or manual user tests were used.

| Check | Result |
| --- | --- |
| Foreground permission recovery | Revoked permission in OS Settings, returned to the open reminder screen, and saw denial. Enabled permission in Settings and returned again: denial cleared automatically, without an in-app permission request. |
| Denied recovery action | “open device settings” opened OS Settings; no misleading second permission prompt. |
| Preferred-time persistence | Saved `09:45`, then `09:51`; actual settings storage and restarted UI preserved the selected time. |
| Terminated-app delivery | Added disposable friend `Noqa Alice`, scheduled `09:45`, and terminated the app before that time. Notification Center contained “Friendship Garden” / “Noqa Alice may appreciate a check-in.” The OS delivered record also contained that identifier and copy. |
| Notification opens app | Swiping right on the Notification Center item opened the garden. Direct taps did not open it in this simulator. |
| Logging interaction | Set the next reminder to `09:51`, then logged an interaction. The OS pending queue held one reminder for **2026-10-21 09:51 local time**, not the imminent reminder. |
| Disable cancellation | Switch became off; OS pending queue count became **0** and persisted schedule registry became `[]`. |
| Startup reconciliation | Re-enabled and restarted. OS pending queue held exactly **1** reminder with the same friend identifier and cadence-due date. |
| Mobile unit tests / typecheck | **116 tests passed**; typecheck passed. |
| Web unit tests | **116 tests passed**. Root tests now include only `src/`; mobile tests run separately with their own React runtime. The older 186 count included 70 mobile tests. |

The OS queue checks read the simulator's `Library/UserNotifications` keyed
archives without changing them. The persisted registry was read from the
app's AsyncStorage `manifest.json`. A successful gesture alone was not
treated as evidence.

Automated tests cover local-date boundaries, next-time behavior for new and
overdue friends, logging, cadence/name edits, deletion, replacement/import
snapshots, disabled/denied cancellation, missing or stale OS records,
unrelated notification protection, concurrent reconciliation, and recovery
after scheduling errors. Hook tests cover hydration failures, foreground
permission changes, explicit permission requests, and persistence errors.
The import data boundary rejects calls before garden hydration; no Phase 6
import UI was added.

### Native configuration review

This app uses local notifications, runtime Android channels, and the default
sound. No custom native icon/sound or remote push configuration is needed.
The installed SDK 54 notifications plugin unconditionally adds the iOS
`aps-environment` entitlement. Its options do **not** support the newer
`enableRemoteNotifications: false` setting. Keep `plugins: []` for this
local-only scope rather than introduce APNs setup. The Release simulator
delivery above verifies the current iOS setup. Recheck configuration when
adding remote push or custom notification assets.

### Remaining platform checks

- Android device delivery is **not verified**. Pixel 8 is available but shut
  down; noqa reported that the UiAutomator2 driver was missing. Available
  disk space was about 3.7 GiB, so no second native build was attempted.
- Physical-device and locked-phone delivery are **not verified**.
- Cadence/name edits, deletion, and replacement/import cancellation have
  automated boundary coverage, not separate native UI runs.
- Android without exact-alarm permission uses Expo's inexact idle-capable
  alarm fallback. The UI promises delivery “around” the selected time.
- These limits do not require manual testing from the user to continue
  implementation; keep them as release-validation work.

## Verified run: 2026-10-07 — Phase 6

The existing settings screen now includes **garden backups**. Choose a JSON
file using the native document picker, or paste JSON and review it. Validation
runs before the replacement preview and again before persistence. Import
replaces the garden; it does not merge it. Export uses the native share sheet
and the existing web `version: 1` / `exportedAt` / `friends` backup shape.
Backups do not include reminder settings or notification IDs.

Added SDK 54-compatible `expo-document-picker`, `expo-file-system`, and
`expo-sharing`. Regenerated the ignored iOS workspace without cleaning it,
ran `pod install`, and rebuilt the Release simulator app.

| Check | Result |
| --- | --- |
| Current web export import | Generated a sample through the actual web `exportGarden` function. Pasted it into the simulator, reviewed `Web Alice` and the history count, then explicitly confirmed replacement. |
| Data preservation | Read persisted mobile data and compared it with the web payload: name, birthday, cadence, timestamps, interaction type, and note all matched exactly. |
| Enabled-reminder reconciliation | OS queue contained only `friendship-garden:phase6-web-alice`, with calm copy and **2026-10-22 09:51 local** as its cadence-due time. The old friend's schedule was removed. |
| Native export | Share sheet displayed a JSON attachment; saved it to Files. Read the saved file and confirmed version 1 and exact friend/history preservation. |
| Native file import / round-trip | Chose that saved JSON in the document picker, saw the replacement preview, and confirmed import successfully. |
| Malformed JSON | Pasted `{broken`; review showed a clear JSON error and no replacement action. Persisted garden data stayed unchanged. |
| Confirmation cancellation / persistence failures | Component and store tests confirm cancellation makes no import call and failed persistence preserves existing data. |
| Mobile checks | **137 tests passed**; typecheck passed. |
| Web fallback | **116 web tests passed**; no web production files changed. |

Mobile validation rejects blank names/IDs, invalid dates, nonpositive or
noninteger cadence, and duplicate friend/interaction IDs. Valid backups keep
their IDs and optional fields unchanged. Empty backups remain valid and need
the same replacement confirmation. Temporary cached import/export files are
removed after use; files explicitly saved through the share sheet remain.

The native UI review found keyboard obstruction and singular/plural copy;
the final pass adds drag-to-dismiss, a bounded-height JSON editor, and correct
interaction-count wording. The section keeps the existing settings styles.
Review was completed in the primary session because the independent worker
hit a usage limit; no independent review pass is claimed.

Android native import/export and physical-device checks remain Phase 7 work.
No paid noqa runs were used. The simulator contains disposable `Web Alice`
sample data; no personal garden data was replaced.

## Verified run: 2026-10-10 — Android emulator

Tested the self-contained ARM64 Release APK on noqa's Pixel 8 emulator,
Android 17, with UiAutomator2 4.2.8. The first build failed with “No space
left on device.” After disk space increased to 32 GiB, the build passed:

```sh
# From apps/mobile; generate only if android/ does not exist
npx expo prebuild --platform android --no-install
# From apps/mobile/android
ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
# From the repository root
adb -s emulator-5554 install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

The generated project signs this Release APK with its local debug key.
This is an emulator test build, not a production-signed distribution build.

| Check | Result |
| --- | --- |
| Fresh launch / opening settings | No automatic permission prompt. |
| First explicit enable | **Failed:** fresh install reports denied; tapping enable does not show the Android permission prompt. See finding below. |
| OS Settings recovery | In-app link opened app settings. Enabled notifications there; returning to the app automatically cleared the denial UI. |
| Scheduling after OS grant | Enabling reminders created an actual OS alarm for the next preferred time. |
| Preferred-time persistence | Selected `17:13`, later `19:06`; settings survived app restart. |
| Native file import | Generated a sample through the real web exporter and selected its JSON from Downloads. Preview and explicit replacement succeeded. |
| Imported fields | Name and birthday `1990-05-14` appeared correctly; the edit screen selected “every 3 weeks”; history retained call type and “Android migration sample” note. |
| Import reconciliation | Old alarm replaced by one alarm due **2026-10-22 17:13 local**, matching the imported October 1 interaction plus 21 days. Changing preferred time moved it to `19:06`. |
| Malformed import | `{broken` displayed a clear JSON error and offered no replacement; existing garden and alarm remained. |
| Export | Native share sheet displayed a `.json` attachment. Cancelled without sending to an external account. Receipt by another app / Android file round-trip was not tested. |
| Disable / restart | Disabling cleared all app alarms. Re-enabling and restarting left exactly one alarm for the single imported friend. |
| Process-killed delivery | Scheduled a new test friend for `19:06`, backgrounded the app, then used `adb shell am kill`. `pidof` confirmed no app process. Natural delivery appeared at approximately **19:06:38** with “Android Delivery may appreciate a check-in.” No notification was injected. |
| Notification opens app | Tapping the notification in the shade opened the garden. |
| Logging interaction | Alarm moved to **2026-10-24 19:06 local**, 14 days after logging. |
| Deletion | Removing the imported friend removed its October 22 alarm; removing the remaining test friend left zero app alarms. |
| Automated checks | 137 mobile tests, mobile typecheck, and 116 web tests passed again after the Android checks. |

An earlier delivery attempt was interrupted when noqa and the emulator
closed. It is not counted as a pass. The later natural-delivery check above
was completed while the emulator remained running.

### Android permission finding — resolved on 2026-10-11

On a fresh installation, Android package inspection showed
`POST_NOTIFICATIONS` not granted, with no `USER_SET` denial flag. Expo SDK 54's
Android permission adapter reports `denied` when notifications are not yet
enabled, even when the runtime permission can still be requested.
`permissions.ts` reduces this response to status alone; `useReminders` only
requests permission for `undetermined`. This blocks the first in-app request
and shows an incorrect “currently denied” explanation.

Fix direction: preserve requestability (`canAskAgain`) at the permission
boundary and allow an explicit Android enable action to request permission
when permitted. Keep startup reads non-interactive and preserve Settings
recovery for a permanent denial. Add regression coverage before changing it.
No production source code was changed during this check.

### Permission fix and retest: 2026-10-11

After approval, the adapter now preserves Android `denied` plus
`canAskAgain: true` as `requestable`. Explicit enable requests that state;
startup and foreground reads remain non-interactive. Permanent denial and
iOS authorization mapping remain unchanged.

Rebuilt the ARM64 Release APK and tested with app data and permission state
reset on the same Android 17 emulator:

- Startup and opening settings showed no prompt or false permanent-denial hint.
- Explicit enable opened the OS notification permission prompt.
- “Allow” enabled the reminder switch.
- First “Don’t allow” left reminders disabled; another explicit enable opened
  a second prompt.
- Second denial produced `USER_SET|USER_FIXED` permission flags, displayed
  Settings recovery, and further enable did not prompt again.
- Regression checks: **143 mobile tests**, mobile typecheck, and **116 web
  tests** passed. Adapter and enable-flow regressions failed before their fixes.

noqa's compact tree omitted the switch; its full tree included it. System
dialog coordinates were clipped, so permission buttons were tapped through
ADB using the inspected screenshot and device dimensions. No paid runs or
vision-grounding credits were used. No friend data was added; the installed
updated APK retains an empty garden, disabled reminders, and the final denied
permission state. Temporary device inspection files were removed; cleanup
traps stopped the owned emulator and `adb devices` confirmed no devices.
OS Settings recovery was verified in the original run, not repeated here.

### Timing and platform limits

The APK does not request exact-alarm permission. `dumpsys alarm` showed
inexact `RTC_WAKEUP` alarms with a one-hour window. The observed 38-second
delay is one emulator result, not an exact-time guarantee. Android **Force
stop** is different from killing a background process and can suppress alarms;
force-stop delivery is not claimed. Physical Android delivery, OEM battery
restrictions, and locked-device behavior remain unverified.

### Cleanup

- Used only disposable friends, removed through the app at the end.
- Removed the exact owned file
  `/sdcard/Download/friendship-garden-noqa-20261010.json` and verified it was gone.
- Verified the final app alarm count was **0**.
- Stopped the emulator started by this task; preserved the user's AVD.
- Retained the installed test APK with an empty garden for later inspection.
- No paid noqa runs, production services, Docker containers, or disposable
  database volumes were used.
