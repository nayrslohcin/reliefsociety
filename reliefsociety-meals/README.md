# Relief Society Meal Sign-Up

A free Google Apps Script that sets up a meal sign-up for someone who
needs help: a new baby, a surgery, a loss in the family. You fill in a
name and a date range, and the script creates:

- **A Google Form** with a dropdown of open dates. When someone takes a
  date, it disappears from the dropdown, so each day goes to one person.
- **A public, read-only schedule**: a spreadsheet laid out as a monthly
  calendar, showing who is bringing a meal on each day. It shows names
  only, never phone numbers.
- **A private responses spreadsheet**, visible only to you, with each
  volunteer's name, phone number and email.
- **A confirmation email** to each volunteer, with a calendar invite
  attached.

When every date is taken, the form closes itself.

One copy of the script can run sign-ups for as many people as you
like, and each person's sign-up is kept completely separate.

Everything runs in your own Google account. There is nothing to install
and nothing to pay for.

---

## What you need

- A Google account (a personal Gmail account works).
- About 10 minutes for the first setup.

You don't need git or any programming knowledge.

---

## Setup (one time)

### 1. Copy the script

1. Open [`reliefsociety-meal-signup.gs`](reliefsociety-meal-signup.gs)
   on GitHub.
2. Click the **Copy raw file** button (two overlapping squares, top
   right of the file) to copy all of it.

### 2. Create an Apps Script project

1. Go to <https://script.google.com> and click **New project**.
2. Click **Untitled project** at the top and rename it, for example
   `Relief Society Meals`.
3. Delete the sample code in the editor, paste in the whole script,
   and click the **Save** icon.

Use this one project for every person you set up. Don't make a new
project each time.

### 3. Set your time zone and permissions

1. Click **Project Settings** (the gear icon on the left).
2. Tick **Show "appsscript.json" manifest file in editor**.
3. Go back to the **Editor** (the `< >` icon), open `appsscript.json`,
   and replace its contents with:

   ```json
   {
     "timeZone": "America/Chicago",
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "oauthScopes": [
       "https://www.googleapis.com/auth/forms",
       "https://www.googleapis.com/auth/spreadsheets",
       "https://www.googleapis.com/auth/drive.file",
       "https://www.googleapis.com/auth/script.scriptapp",
       "https://www.googleapis.com/auth/script.send_mail"
     ]
   }
   ```

4. Change `"timeZone"` to your own, for example `America/New_York`,
   `America/Denver`, `America/Los_Angeles` or `America/Phoenix`. A
   full list is on
   [Wikipedia](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).
   Save.

This step is optional but recommended. Without it, Google asks for
access to your **whole** Google Drive. With it, the script can only see
the files it creates itself.

### 4. Enter your ward's details

Open `reliefsociety-meal-signup.gs` and find the block marked
`// ======== EDIT THESE ========`. Change at least:

| Setting | What to put |
|---|---|
| `WARD_NAME` | Your ward's name. It appears in every form title. |
| `PERSON_NAME` | Who the meals are for, e.g. `'The Johnson Family'`. It must be unique for each person. |
| `START_DATE`, `END_DATE` | The first and last day meals are needed, as `'yyyy-mm-dd'`. They can be the same day. |
| `EXCLUDE_DATES` | Any days in that range to leave off the form. Leave it as `[]` for none. |
| `MEAL_TIME` | The drop-off time used in the calendar invite, in 24-hour time (e.g. `'17:00'`). |
| `MEAL_LOCATION` | Optional address for the calendar invite. Leave it as `''` to leave it out. |

Save.

### 5. Run it

1. In the function dropdown at the top of the editor, choose
   **`createSignupForm`** and click **Run**.
2. Google asks you to approve permissions. It also warns that the app
   isn't verified, because it's your own script and not a published
   app. Click **Advanced → Go to (project name) → Allow**.
3. When the run finishes, the **Execution log** at the bottom shows
   three links:
   - **Sign-up form**: send this to the ward.
   - **Schedule**: read-only. Anyone can use it to see who's coming when.
   - **Responses**: private to you. It contains phone numbers, so
     don't share it.

All the files are saved in your Google Drive under
`Relief Society Meals/<person's name>/`. **Don't share that folder.**
The private responses sheet is in it.

---

## Everyday use

You run each of these by choosing it in the function dropdown and
clicking **Run**. Most of them act on whoever is set in `PERSON_NAME`,
so check that value first.

| To… | Do this |
|---|---|
| Set up another person | Change `PERSON_NAME`, the dates and `EXCLUDE_DATES`, then run `createSignupForm`. Nobody already set up is affected. |
| Add more days for someone | Keep their `PERSON_NAME`, change `START_DATE`/`END_DATE`, and run `extendSignupForm`. The links you already shared keep working. |
| Cancel one sign-up | Set `CANCEL_DATE` (and `PERSON_NAME`), then run `cancelSignup`. That date goes back on the form. |
| Add a sign-up taken by phone or in person | In that person's private responses spreadsheet, open the **Quick Add** tab and type a name and date. |
| Cancel without opening the script | In the responses spreadsheet, open the **Quick Cancel** tab and type the date. |
| See everyone who's set up, with their links | Run `listPeople`. |
| Remove a person from the script | Run `forgetPerson`, then delete their folder in Drive yourself. |

Running `createSignupForm` again for the same `PERSON_NAME` is safe. It
won't overwrite anything; it just logs that a form already exists.

### Optional: let someone else set up sign-ups without the script

Run **`createAdminSetupForm`** once. It creates a request form with the
same fields as the settings above. Give that form's link to your meals
coordinator: each time they submit it, a new sign-up is created, and
its links appear in a **Result** column on that form's response
spreadsheet.

Test it with the form's real link, not the **Preview** button in the
Forms editor, because preview submissions don't trigger the script. If
the Result column stays blank after a real submission, run
`reinstallAdminTrigger` and try again.

---

## Troubleshooting

- **"Authorization required" or a permissions screen again.** This is
  expected whenever the permission list changes (for example after
  step 3). Approve it again.
- **Dates are off by a day, or the form opens and closes at the wrong
  time.** Check `"timeZone"` in `appsscript.json` (step 3).
- **A volunteer didn't get a confirmation email.** They may have mistyped
  their email address, or it went to spam. Their sign-up still counts.
  Check the Schedule.

The comments at the top of `reliefsociety-meal-signup.gs` cover every
feature in more detail.

---

## Privacy

Volunteers' phone numbers and emails go only into the private responses
spreadsheet in **your** Drive. The public schedule shows only the name
each volunteer typed. The script never sends data anywhere outside your Google
account, except the confirmation email to the volunteer.
