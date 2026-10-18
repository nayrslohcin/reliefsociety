# Relief Society Meal Sign-Up

A free tool that sets up a meal sign-up for someone who needs help: a
new baby, a surgery, a loss in the family. You type in their name and
the dates meals are needed, and it creates:

- **A sign-up form** (a Google Form) with a dropdown of open dates. When
  someone takes a date, it disappears from the dropdown, so each day
  goes to one person.
- **A schedule anyone can view**: a Google Sheet laid out as a monthly
  calendar, showing who is bringing a meal on each day. It shows names
  only, never phone numbers.
- **A private responses sheet**, visible only to you, with each
  volunteer's name, phone number and email.
- **A confirmation email** to each volunteer, with a calendar invite
  they can tap to add the date to their own calendar.

When every date is taken, the form stops accepting sign-ups.

You can run sign-ups for many people from one setup, and each person's
sign-up is kept completely separate.

Everything runs inside your own Google account. There's nothing to
install and nothing to pay for.

---

## What you need

- **A Google account.** A regular Gmail account works.
- **A computer.** The setup page doesn't work on a phone. Once
  everything is set up, the forms and sheets work fine on phones.
- **About 15 minutes** for the first setup.

You won't need to write any code. You'll copy and paste one file and
change a few lines of settings, and these instructions show exactly
what to type.

---

## Part 1: One-time setup

You only do this part once. After that, setting up a new person takes
about two minutes (see [Part 2](#part-2-set-up-a-sign-up-for-someone)).

### Step 1. Copy the script

1. Open [`reliefsociety-meal-signup.gs`](reliefsociety-meal-signup.gs)
   here on GitHub.
2. At the top right of the file, click the **Copy raw file** button
   (it looks like two overlapping squares). That copies the whole file,
   about 1,500 lines. Keep this browser tab open.

### Step 2. Create a project at Google Apps Script

Apps Script is Google's free tool for running small programs inside
your Google account.

1. Go to <https://script.google.com>, signed in with the Google account
   that should own the forms and sheets.
2. Click **New project**. An editor opens with a file called `Code.gs`
   containing a few lines like `function myFunction() {}`.
3. Click inside that text, press **Ctrl+A** (**Cmd+A** on a Mac) to
   select it all, then paste with **Ctrl+V** (**Cmd+V**). The editor now
   holds only the script you copied.
4. Click **Untitled project** at the top left and rename it, for
   example `Relief Society Meals`.
5. Click the **Save** icon (a floppy disk) above the code.

You'll use this one project for everyone you set up. Don't create a new
project for each person.

### Step 3. Limit the script's access to your Drive, and set your time zone

Without this step, Google asks you to give the script access to
**everything** in your Google Drive. This step limits it to the files
the script creates itself. It's optional, but recommended.

1. In the left sidebar, click **Project Settings** (the gear icon).
2. Tick the box **Show "appsscript.json" manifest file in editor**.
3. Click **Editor** in the left sidebar (the `< >` icon). A new file
   called `appsscript.json` now appears in the file list. Click it.
4. Select everything in it and replace it with exactly this:

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

   To copy it, hover over the box above and click the copy icon in its
   top right corner.
5. Click **Save**.
6. Go back to **Project Settings** (gear icon), and under **Time zone**,
   choose your own time zone from the list. The script uses it for the
   dates and times in sign-ups and calendar invites.

Do these in this order: paste first, then choose the time zone. Pasting
the text sets the time zone to Central Time, and the dropdown then
changes it to yours.

### Step 4. Enter your ward name

1. Click **Editor** (`< >`), then click `Code.gs` in the file list.
2. Press **Ctrl+F** (**Cmd+F** on a Mac) and search for `WARD_NAME`.
3. Change the text between the quote marks to your ward's name:

   ```js
   const WARD_NAME = 'Maple Grove 2nd Ward';
   ```

   It appears in the title of every sign-up form.
4. Click **Save**.

**Tips for editing settings**, here and in Part 2:

- Only change the text **between the quote marks** `'like this'`. Keep
  the quote marks, and the `;` at the end of the line.
- If a name contains an apostrophe, put a backslash in front of it:
  `'Sister O\'Brien'`.
- Don't change anything outside the settings block, which starts at
  `// ======== EDIT THESE ========` and ends at `// ============================`.
- If you make a mess, you can always start over by copying the file
  from GitHub again (Step 1).

### Step 5. Approve the script

The first time you run the script, Google asks you to approve what it's
allowed to do. You'll do this once now, as part of setting up your
first person in Part 2. Here's what to expect:

1. A box says **Authorization required**. Click **Review permissions**.
2. Choose your Google account.
3. A warning says **Google hasn't verified this app**. That's expected:
   this is your own copy of the script, not a published app. Click
   **Advanced** (small text, bottom left), then **Go to Relief Society
   Meals (unsafe)**.
4. Google lists what the script wants to do, and may show a checkbox
   next to each item. Tick **Select all**, then click **Continue**.
   If you leave any of them unticked, the script can't create the forms
   and sheets, or send confirmation emails.

The script then carries on running.

---

## Part 2: Set up a sign-up for someone

Do this each time someone in the ward needs meals.

### 1. Fill in their details

In `Code.gs`, find the settings block that starts with
`// ======== EDIT THESE ========`, and change these lines:

| Setting | What it's for | Example |
|---|---|---|
| `PERSON_NAME` | Who the meals are for. It must be different for every person: if two families share a surname, add a first name. It's used for the form title and the Drive folder name. | `'The Johnson Family'` |
| `START_DATE` | The first day a meal is needed. Write it as year-month-day. | `'2026-11-02'` |
| `END_DATE` | The last day a meal is needed. It can be the same as `START_DATE` for a single meal. | `'2026-11-15'` |
| `MEAL_TIME` | When meals should be dropped off, in 24-hour time. Used for the calendar invite. | `'17:30'` (5:30 PM) |
| `MEAL_LOCATION` | Optional. An address for the calendar invite. Leave it as `''` to leave it out. | `'123 Main St'` |

Dates always look like `'2026-11-02'`: four-digit year, two-digit month,
two-digit day, with dashes, inside quote marks.

**To skip some days** inside that range (for example, a day when family
is visiting), find `EXCLUDE_DATES`. It looks like this:

```js
const EXCLUDE_DATES = [
  // '2026-08-27',
  // ['2026-08-29', '2026-08-30'],
];
```

Lines starting with `//` are ignored by the script, so as written this
skips no days. To skip days, add your own lines, each ending in a
comma:

```js
const EXCLUDE_DATES = [
  '2026-11-05',                  // skips one day
  ['2026-11-09', '2026-11-11'],  // skips the 9th, 10th and 11th
];
```

Click **Save** when you're done.

### 2. Run it

1. At the top of the editor, next to the **Run** and **Debug** buttons,
   there's a dropdown showing a name like `createSignupForm`. Click it
   and choose **`createSignupForm`**.
2. Click **Run**. The first time, Google asks for approval (see
   [Step 5](#step-5-approve-the-script)).
3. An **Execution log** panel opens at the bottom of the screen. When it
   says **Execution completed**, it lists these links:
   - **SIGN-UP link**: send this to the ward, by email, text or the
     ward newsletter.
   - **SCHEDULE link**: share this too, so everyone can see who's
     bringing a meal when. People can view it but can't change it.
   - **Private responses spreadsheet**: for you only, because it
     includes phone numbers. Bookmark it.
   - **Form EDIT link**: for you only, in case you want to change the
     form's wording.

   To copy a link, select it with your mouse and press **Ctrl+C**
   (**Cmd+C**).

If you lose the links, run **`listPeople`** the same way. It lists
the sign-up and schedule links for everyone you've set up.

All of a person's files are saved in your Google Drive, in a folder
called **Relief Society Meals**, under a folder with their name.
**Don't share that folder.** The private responses sheet is in it.

If the log shows a red error instead, see [Troubleshooting](#troubleshooting).

---

## Day-to-day tasks

### Without opening the script (in the private responses sheet)

Open the person's **private responses spreadsheet**. At the bottom,
there are tabs:

- **Quick Add**: for sign-ups taken by phone or in person. On a new row,
  type the volunteer's **Name** and the **Date** (like `2026-11-04`).
  Phone and email are optional. The date is taken off the form and the
  name goes on the schedule, just as if they'd used the form.
- **Quick Cancel**: when a volunteer has to back out. On a new row,
  type the **Date**. It's cleared from the schedule and goes back on the
  form for someone else.

The **Status** column fills in by itself after a few seconds, showing
"Done", "Reopened", or a message explaining a problem. Don't type in it
yourself.

### From the script

These all work the same way: change the settings, click **Save**,
choose the name in the dropdown at the top, then click **Run**.

**Always check `PERSON_NAME` first.** These act on whoever it's set
to, so it must match exactly the name you used when you set that
person up.

| To… | Change these settings | Then run |
|---|---|---|
| Set up another person | `PERSON_NAME`, the dates, `EXCLUDE_DATES` | `createSignupForm` |
| Add more days for someone already set up | Keep their `PERSON_NAME`; set new `START_DATE`/`END_DATE` | `extendSignupForm` |
| Reopen a date someone cancelled | `PERSON_NAME`, and `CANCEL_DATE` set to that date | `cancelSignup` |
| See everyone set up, with their links | nothing | `listPeople` |
| Wrap up once someone's meals are done | `PERSON_NAME` | `forgetPerson` |

Adding more days with `extendSignupForm` keeps the same links, so you
don't need to resend anything.

You can't break anything by running `createSignupForm` again for a name
that's already set up. It won't overwrite anything; it just shows that
person's existing link.

**Run `forgetPerson` once a person's meals are over.** One setup can
handle about 10 people at a time, and `forgetPerson` frees up that
person's spot. After it runs, their form and schedule stop updating, so
don't run it while anyone might still sign up. It doesn't delete their
files: their schedule stays in Drive as a record. If you want the files
gone too, delete their folder in Google Drive yourself.

### Optional: let a meals coordinator set up sign-ups without the script

If someone else coordinates meals and you'd rather they never open the
script, you can give them a simple request form instead:

1. Choose **`createAdminSetupForm`** in the dropdown and click **Run**.
   You only do this once.
2. The log shows the request form's link. Give it only to your
   coordinator, and don't post it publicly, because anyone with the
   link can create sign-ups.
3. Each time they fill it out, a new sign-up is created. Its links
   appear in the **Result** column of the request form's response
   spreadsheet, which is in your **Relief Society Meals** folder in
   Drive. Share that spreadsheet with your coordinator so they can see
   the links.

On the request form, dates to skip are typed like
`2026-11-05, 2026-11-09 to 2026-11-11`.

To try the request form yourself, open its real link. The **Preview**
button (eye icon) in the Forms editor won't work, because preview
submissions don't trigger the script. If the Result column stays blank
after a real submission, run **`reinstallAdminTrigger`** and try again.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| **"Start date must be in yyyy-mm-dd format"** or a similar date error | Check that the dates look like `'2026-11-02'`, inside quote marks. |
| **"Person name is required"** | `PERSON_NAME` is blank. Put a name between the quote marks. |
| **"A sign-up form already exists for…"** | That person is already set up, and the log shows their link. To add days, use `extendSignupForm`. To set up someone new, change `PERSON_NAME`. |
| **"No existing form found for…"** | `PERSON_NAME` doesn't exactly match the name you used at setup. Run `listPeople` to see the exact names. |
| **"SyntaxError"** or **"Unexpected token"** | A quote mark, comma or bracket was removed by accident in the settings. Compare your line with the examples above, or copy the file from GitHub again (Step 1). |
| **"Authorization required"** appears again | That's normal after Step 3, or after pasting a new version of the script. Approve it again (Step 5). |
| **Dates are off by a day** | Check the time zone in **Project Settings** (Step 3). |
| **A volunteer didn't get a confirmation email** | They may have mistyped their email address, or it went to spam. Their sign-up still counts: check the Schedule. |
| **"…running as many sign-ups as Google allows"** | About 10 people are set up at once, which is Google's limit. Run `listPeople`, pick someone whose meals are over, set `PERSON_NAME` to their name, and run `forgetPerson`. Then set `PERSON_NAME` back to the new person and try again. |
| **"No one called … is set up"** when running `forgetPerson` | The name doesn't exactly match. Run `listPeople` and copy the name from there. |

The comments at the top of the script describe every feature in more
detail.

---

## Getting a newer version of the script

If the script on GitHub is updated, copy it again (Step 1) and paste it
over everything in `Code.gs` (Step 2). Your settings in the editable
block get replaced too, so set `WARD_NAME` again (Step 4) before running
anything.

Everyone you've already set up keeps working: their forms, schedules
and links don't change.

---

## Privacy

Volunteers' phone numbers and emails go only into the private responses
spreadsheet in **your** Drive. The public schedule shows only the name
each volunteer typed. The script never sends data anywhere outside your
Google account, except the confirmation email to the volunteer.
