# Changing the missionary meal sign-up script

This script runs a live calendar that a congregation uses. The failures
that matter are the quiet ones — a form that still accepts sign-ups
while nothing records them, or names landing in the wrong calendar
squares — so the point of this procedure is to find them somewhere
other than production.

Three layers, cheapest first:

| | What it catches | Cost |
|---|---|---|
| `npm test` | logic mistakes | a second |
| the TEST project | anything involving the real Google API | a few minutes |
| this checklist | pasting into the wrong place, half-finished deploys | a minute |

---

## One-time setup

### Tests

Nothing to install. Node 24 and its built-in test runner are all it uses.

```bash
cd missionary-meals
npm test
```

### The TEST project

A second Apps Script project with its own form, calendar and sheets.
Nothing in it is shared with the live one, so you can do anything to it.

1. https://script.google.com → **New project**, name it
   `Missionary Meals (TEST)`.
2. Paste in all of `missionary-meal-signup.gs`.
3. **Project Settings** (gear) → **Time zone** → *Central Time – Chicago*.
   The Sunday pause and the nightly pruning both read this.
4. Change exactly two constants, so the files are unmistakable in Drive:
   ```js
   const WARD_NAME = 'TEST Ward';
   const FOLDER_NAME = 'Missionary Meals (TEST)';
   ```
5. Set `START_DATE` / `END_DATE` to the current month.
6. Run `createSignupForm()` and approve the permissions prompt.
7. Run `healthCheck()`. It should name TEST files and list four triggers.

Those two constants are the **only** difference between the projects
from then on. Everything else finds its form and sheets through script
properties, so the identical file works in both.

---

## Every change

**1. Tests pass**

```bash
cd missionary-meals && npm test
```

If you changed behaviour on purpose, update the test that describes it.
If you added behaviour, add a test. A suite that only ever goes green
is not protecting anything.

**2. Back up production**

In the **live** project, run `exportScriptProperties()` and keep the
output. `SCHEDULE_MAP` is the only record of which calendar square
belongs to which date and cannot be rebuilt from the sheet.

Never skip this before anything that touches the schedule — above all
`removeOldMonths()`.

**3. Bump the version**

```js
const SCRIPT_VERSION = '2026-09-22.1';   // date, plus a number if you deploy twice
```

**4. Deploy to TEST and try it**

Paste the whole file into the **TEST** project, save, run `healthCheck()`.
Confirm it names the TEST files and still lists four triggers.

Then exercise whatever you changed, on the TEST form:

- **sign-ups** — submit the real form; the name appears on the calendar,
  the date leaves the dropdown, the confirmation email arrives (and
  submitting with the email box empty still works)
- **Quick Add** — a row with name + date claims the date
- **Quick Cancel** — a row with a date reopens it, in the right order
- **past dates** — `previewOldDates()` then `pruneOldDates()`
- **Sunday pause** — set `PAUSE_DAY` to today's number, run
  `checkSundaySchedule()`, load the public form URL and check it shows
  the pause message, then set `PAUSE_DAY` back to `0` and run again
- **a new month** — `extendSignupForm()`

**5. Deploy to production**

Paste the whole file into the **live** project, save, run `healthCheck()`.
Check all of:

- the version matches what you just ran in TEST
- the file names are the real ones, not `TEST`
- four triggers: `onSignup`, `onResponsesEdit`, `checkSundaySchedule`,
  `pruneOldDates`
- the open-date count is what you expect
- nothing is reported `MISSING`

**6. Commit**

```bash
git add -A && git commit -m "... (v2026-09-22.1)"
```

---

## Do not run these in production

- **`createSignupForm()`** — builds a whole new form and calendar and
  repoints the script properties at them, orphaning the real ones. It
  refuses to run while a form exists in the Drive folder, but do not
  rely on that.
- **`removeOldMonths()` with `REMOVE_MONTHS_FORCE = true`** — removes a
  month people may be signed up for. Back up properties first (step 2).
- **Deleting triggers by hand** — the Sunday pause and the nightly prune
  reinstall their own, but `onSignup` and `onResponsesEdit` only come
  from `createSignupForm()`. If one is gone, the only supported fix is
  recreating it manually in the Triggers UI.

## If something looks wrong on the live calendar

All read-only, in this order:

1. `healthCheck()` — is anything missing or unexpected?
2. `diagnoseSignups()` — for "they signed up but the calendar is blank".
   Names the cause: missing `onSignup` trigger, dates offered that were
   never drawn on the calendar, a renamed `Schedule` tab, or names that
   never got written. It also prints the roster's column headers, which
   is how you spot a form question having been renamed.
3. `previewOldDates()` — says what is stale.
4. `exportScriptProperties()` — compare `SCHEDULE_MAP` with your last backup.

Then to fix:

- **names missing from the calendar** → `previewCalendarRepair()`, then
  `repairCalendar()`. It reads the names out of the responses sheet, so
  nothing has to be retyped.
- **a corrupted `SCHEDULE_MAP`** → **Project Settings → Script
  Properties**, paste the saved value back into the property it came from.

### Remember the execution log

`onSignup()` reports a failed sign-up with `console.error` and nothing
else, so a broken sign-up is silent unless you look. The **Executions**
page in the left sidebar is the first place to check, and the stack
trace's line numbers tell you which version is actually deployed.

---

## What the tests do and do not cover

`tests/` runs the real `.gs` file under Node against stand-ins for the
Google services — no build step, no second copy of the logic, so the
tests run against exactly the bytes you paste.

They check the script's **logic**. They cannot check assumptions about
the Google API itself, because the stand-ins are written to match what
the script expects. Real bugs found in this script that unit tests
would *not* have caught:

- a blanket `deleteTrigger` loop removing `onSignup`
- `greyOutPastDates()` not being runnable from the Run menu, because it
  takes three arguments

That is what step 4 is for. Green tests are not a substitute for trying
it in TEST.
