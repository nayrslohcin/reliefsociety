/**
 * RELIEF SOCIETY MEAL SIGN-UP — Google Apps Script
 *
 * Same idea as the "Missionary Meals" script, but built to run MANY
 * independent sign-ups from one script project — one per person/family
 * who needs meals — without any of them sharing data with each other
 * or with the missionary-meals script.
 *
 * What it does, per person:
 *  - Creates a Google Form with one dropdown of available dates
 *    (every day between START_DATE and END_DATE, inclusive — could be
 *    a single day or a whole month, there's no day-of-week skipping —
 *    minus any dates listed in EXCLUDE_DATES)
 *  - One person per day: when someone signs up, their date is
 *    removed from the form automatically
 *  - Responses (with phone numbers) go to a PRIVATE spreadsheet
 *    only you can see
 *  - A separate PUBLIC read-only "schedule" spreadsheet shows a real
 *    monthly calendar grid with who signed up for each day (names
 *    only, no phone numbers), updated automatically on every signup
 *  - The person who just signed up gets a confirmation email with a
 *    .ics calendar invite attached
 *  - When every date is taken, the form closes itself
 *
 * MULTIPLE PEOPLE, FULLY ISOLATED:
 *  Set PERSON_NAME below to whoever needs meals (e.g. "The Johnson
 *  Family" or "Sister Nguyen — recovering from surgery") and run
 *  createSignupForm() (or fill out the admin request form instead —
 *  see createAdminSetupForm() further down). Either way that creates:
 *    Relief Society Meals/
 *      <PERSON_NAME>/
 *        <form>
 *        <form> — Responses (private)
 *        <form> — Schedule
 *  Change PERSON_NAME to someone else and run createSignupForm()
 *  again — it creates a brand new folder, form, and schedule for
 *  them, with its own separate storage under the hood, so nothing
 *  about one person's sign-up (dates, names, responses, triggers)
 *  ever touches another's, even if their date ranges overlap in the
 *  same week. All functions below (extendSignupForm, cancelSignup,
 *  etc.) act only on whichever PERSON_NAME is currently set, so
 *  always double-check that value before running one.
 *  Run listPeople() any time to see every person currently set up
 *  and their links.
 *
 * SETUP (one time ever, ~3 minutes):
 *  1. Go to https://script.google.com and click "New project" (do
 *     this once — reuse the same project for every person; do NOT
 *     paste this into the missionary-meals project or vice versa)
 *  2. Delete the sample code and paste this entire file in
 *  3. Set WARD_NAME below
 *  4. Click the "Save" icon, then select "createSignupForm" in the
 *     function dropdown at the top and click "Run" (this uses the
 *     placeholder PERSON_NAME/START_DATE/END_DATE below to confirm
 *     everything works end to end — treat it as a real first entry,
 *     or use forgetPerson() + delete its Drive files afterward if it
 *     was just a test)
 *  5. Approve the permissions prompt (it's your own script — Google
 *     shows a warning because it isn't a published app; click
 *     Advanced > Go to project)
 *  6. Open the "Execution log" — it prints three links:
 *       - the SIGN-UP form link to send to the ward
 *       - the SCHEDULE link (read-only) so anyone can see who has
 *         signed up for which day
 *       - your private responses spreadsheet (includes phone numbers)
 *
 * TWO WAYS TO SET UP A NEW PERSON AFTER THAT:
 *  A) Edit PERSON_NAME/START_DATE/END_DATE/EXCLUDE_DATES below and run
 *     createSignupForm() again in the script editor — it will not
 *     touch anyone already set up.
 *  B) Run createAdminSetupForm() once (also one-time, like step 4
 *     above) to create a request form with those same fields, plus an
 *     optional custom form title/description (leave blank to
 *     auto-generate, same as leaving FORM_TITLE_OVERRIDE/
 *     DESCRIPTION_OVERRIDE blank above).
 *     From then on, filling out THAT form does the same thing as (A)
 *     without opening the script editor at all — hand its link to
 *     whoever coordinates meals. See createAdminSetupForm()'s comment
 *     for details; the links for each request land in a "Result"
 *     column on its own response spreadsheet. Test it through the
 *     form's real published link, not the "Preview" button in the
 *     Forms editor — preview submissions never fire the trigger that
 *     does the work. If the Result column stays blank after a real
 *     submission, run reinstallAdminTrigger() and try again.
 *
 * To open up more days for someone who ALREADY has a form (same
 * PERSON_NAME as before), update START_DATE/END_DATE and run
 * extendSignupForm() instead — it adds the new dates to that same
 * person's existing form and schedule, so the links already shared
 * keep working. createSignupForm() refuses to run again for a
 * PERSON_NAME that already has a form (it just logs a message and
 * stops), so it's safe to click Run on the wrong function by
 * accident — nothing gets overwritten.
 *
 * For signups and cancellations that don't happen through the form
 * itself (phone calls, in-person), open that person's private
 * responses spreadsheet:
 *  - "Quick Add" tab: type in a Name + Date (yyyy-mm-dd) to claim a
 *    date — updates the calendar and dropdown, and adds a row to the
 *    "Form Responses" tab too, same as a real form submission would
 *  - "Quick Cancel" tab: type in a Date (yyyy-mm-dd) to reopen it for
 *    someone else, same as cancelSignup() below
 * Either way, a Status column fills in automatically once it's
 * processed ("Done"/"Reopened", or an error message).
 *
 * (The script-editor equivalent of "Quick Cancel": set PERSON_NAME
 * and CANCEL_DATE below to match, then run cancelSignup().)
 *
 * ALL FILES for a person are placed in
 * "Relief Society Meals/<PERSON_NAME>/" in Drive (created
 * automatically, reused on later runs for that same PERSON_NAME). Do
 * NOT share that folder publicly — it contains the private responses
 * sheet with phone numbers. Only each person's schedule sheet is
 * shared, read-only.
 *
 * TRIM THE SCRIPT'S PERMISSION LIST (recommended):
 * By default Apps Script's auto-detected scopes ask for full,
 * account-wide Drive access ("See, edit, create, and delete all of
 * your Google Drive files") plus some it doesn't need at all (like
 * showing sidebars/dialogs). You can pin the scopes down so the Drive
 * grant covers ONLY files this script itself creates — not your
 * whole Drive:
 *  1. In the Apps Script editor: Project Settings (gear icon) >
 *     check "Show 'appsscript.json' manifest file"
 *  2. Open appsscript.json and replace its contents with:
 *
 * {
 *   "timeZone": "America/Chicago",
 *   "exceptionLogging": "STACKDRIVER",
 *   "runtimeVersion": "V8",
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/forms",
 *     "https://www.googleapis.com/auth/spreadsheets",
 *     "https://www.googleapis.com/auth/drive.file",
 *     "https://www.googleapis.com/auth/script.scriptapp",
 *     "https://www.googleapis.com/auth/script.send_mail"
 *   ]
 * }
 *
 *  3. Set "timeZone" to your time zone, save, and run again — since
 *     this list is narrower than what Apps Script would have picked
 *     on its own, you'll be asked to re-approve, and the consent
 *     screen will now say "...files that you have opened or created
 *     with this app" instead of "...all of your Google Drive files".
 *
 * Why "drive.file" instead of "drive": drive.file (the "restricted"
 * Drive scope) only lets the script see/touch files IT created or
 * that you explicitly opened with it — never your other Drive
 * content. Every Drive object this script touches (the "Relief
 * Society Meals" folder, each person's subfolder, each form, each
 * spreadsheet) is one it creates itself via DriveApp/FormApp/
 * SpreadsheetApp, and Google keeps that per-file access grant across
 * future runs of the same script — so getOrCreateFolder()/
 * getOrCreateChildFolder() can still find and reuse them on
 * createSignupForm()/extendSignupForm() later, and moveTo()/
 * setSharing() still work on the form/spreadsheets right after
 * creating them. The only downside: if you ever pre-create a folder
 * named "Relief Society Meals" by hand in Drive (outside the script)
 * and expect the script to find and reuse it, it won't — drive.file
 * can't see folders it didn't create, so it'll just make its own
 * new one instead. That's a minor, safe fallback, not an error.
 *
 * There's no Drive scope narrower than drive.file (Google doesn't
 * offer one scoped to a specific folder by ID/path) — drive.file is
 * as tight as it gets for a script that creates its own files.
 *
 * The other two prompts you're seeing (Sheets, Forms) CAN'T be
 * narrowed the same way — Google doesn't publish a "files this app
 * created only" variant of the spreadsheets or forms scopes for a
 * standalone script like this one (that restricted-scope option only
 * exists for scripts bound to one single existing form/sheet, which
 * doesn't fit this script's create-many-per-person design). Those two
 * will stay "manage your forms" / "manage your spreadsheets" no
 * matter what — that's a platform limit, not something fixable here.
 * In practice this script only ever touches the forms/sheets it
 * itself creates inside "Relief Society Meals" regardless of which
 * scope tier is active; you can verify that by reading the code above,
 * since it's your own script rather than a third-party add-on.
 *
 * script.send_mail is required for the confirmation email/calendar
 * invite sent to each person after they sign up.
 */

// ======== EDIT THESE ========
// Who this particular sign-up is for. This is the key that keeps
// every person's form/calendar/responses completely separate — pick
// something unique per person (it's also used as the Drive folder
// name under "Relief Society Meals").
const PERSON_NAME = 'Jane Doe';

const START_DATE = '2026-08-24';   // yyyy-mm-dd — can equal END_DATE for a single day
const END_DATE   = '2026-08-30';   // yyyy-mm-dd

// Dates inside START_DATE..END_DATE to leave off the form/calendar
// entirely (e.g. a day they'll be out of town, a holiday, a day
// someone already has a meal train through another ward). Each entry
// is either a single 'yyyy-mm-dd' string, or a ['yyyy-mm-dd', 'yyyy-mm-dd']
// pair for an inclusive range of consecutive days to exclude. Leave
// as [] to exclude nothing.
const EXCLUDE_DATES = [
  // '2026-08-27',
  // ['2026-08-29', '2026-08-30'],
];

// Optional overrides. Leave '' to auto-generate:
//   title:       "<WARD_NAME> Meal Sign-Up for <PERSON_NAME>"
//   description: "Thank you for signing up to bring a meal for
//                 <PERSON_NAME>! When you choose a date below, it
//                 will disappear from the available list."
// Whichever description ends up in effect (this override or the
// auto-generated one) still gets the schedule link appended
// automatically after creation — that part isn't optional.
const FORM_TITLE_OVERRIDE = '';
const DESCRIPTION_OVERRIDE = '';

const WARD_NAME = 'Plano 4th Ward';
const PARENT_FOLDER_NAME = 'Relief Society Meals';

// Calendar invite settings — used only for the .ics file emailed to
// whoever signs up, not shown anywhere else.
const MEAL_TIME = '17:00';        // 24-hour HH:mm, meal drop-off/start time
const MEAL_DURATION_MINUTES = 60;
const MEAL_LOCATION = '';         // e.g. their address; leave '' to omit

// Only used by cancelSignup() — set this to a date (yyyy-mm-dd) that
// someone had to cancel for PERSON_NAME above, then run
// cancelSignup(), so it reopens on their form for someone else to grab.
const CANCEL_DATE = '';           // yyyy-mm-dd, leave '' when not in use
// ============================

const Q_NAME = 'Your name';
const Q_PHONE = 'Phone number';
const Q_EMAIL = 'Email address (for your confirmation + calendar invite)';

// Questions on the "admin" request form (see createAdminSetupForm()) —
// filling that out is an alternative to editing PERSON_NAME/START_DATE/
// END_DATE/EXCLUDE_DATES above and running createSignupForm() by hand.
const Q_ADMIN_NAME = "Person's name (becomes the sign-up form's title and Drive folder name)";
const Q_ADMIN_START = 'Start date (yyyy-mm-dd)';
const Q_ADMIN_END = 'End date (yyyy-mm-dd) — can match the start date for a single day';
const Q_ADMIN_EXCLUDE = 'Dates to exclude (optional)';
const Q_ADMIN_TITLE = 'Form title (optional — leave blank to auto-generate)';
const Q_ADMIN_DESCRIPTION = 'Form description (optional — leave blank for the default message)';
const ADMIN_FORM_TITLE = WARD_NAME + ' Meal Sign-Up — New Request';

function createSignupForm() {
  const result = createSignupForCore({
    personName: PERSON_NAME,
    startDate: START_DATE,
    endDate: END_DATE,
    excludeDates: EXCLUDE_DATES,
    formTitle: FORM_TITLE_OVERRIDE,
    description: DESCRIPTION_OVERRIDE
  });

  if (result.status === 'exists') {
    Logger.log('A sign-up form already exists for "' + PERSON_NAME + '" — not creating a new one.');
    Logger.log('Existing form: ' + result.form.getPublishedUrl());
    Logger.log('To open up more days for them, update START_DATE/END_DATE and run extendSignupForm() instead.');
    Logger.log('To set up a DIFFERENT person, change PERSON_NAME above and run createSignupForm() again.');
    return;
  }

  Logger.log('SIGN-UP link for ' + PERSON_NAME + ' (share with the ward):\n' + result.form.getPublishedUrl());
  Logger.log('SCHEDULE link (read-only, share with the ward):\n' + result.scheduleSs.getUrl());
  Logger.log('Private responses spreadsheet (for you only):\n' + result.responsesSs.getUrl());
  Logger.log('To sign someone up by phone/in person, use the "Quick Add" tab in that spreadsheet.');
  Logger.log('To reopen a date someone had to cancel, use the "Quick Cancel" tab in that same spreadsheet.');
  Logger.log('Form EDIT link (for you):\n' + result.form.getEditUrl());
}

/**
 * Does the actual work of creating a person's sign-up form/schedule/
 * responses sheet, parameterized by config instead of reading the
 * top-of-file PERSON_NAME/START_DATE/END_DATE/EXCLUDE_DATES constants
 * directly — so it can be driven either by createSignupForm() (reads
 * those constants, for running by hand in the script editor) or by
 * onAdminSetupSubmit() (reads the same fields from a submitted admin
 * request form instead). config: { personName, startDate, endDate,
 * excludeDates, formTitle, description }, where startDate/endDate are
 * 'yyyy-mm-dd' strings, excludeDates is EXCLUDE_DATES-shaped (array of
 * 'yyyy-mm-dd' strings and/or ['yyyy-mm-dd', 'yyyy-mm-dd'] range
 * pairs), and formTitle/description are OPTIONAL — pass '' or omit
 * them to fall back to the auto-generated title/message.
 *
 * Returns { status: 'exists', form } if PERSON_NAME already has a
 * form, or { status: 'created', form, responsesSs, scheduleSs } on
 * success. Throws on invalid input (bad dates, empty name, etc.) —
 * callers decide how to surface that (a thrown error halting the
 * script editor run, or a message written back into a response row).
 */
function createSignupForCore(config) {
  const personName = String(config.personName || '').trim();
  if (!personName) throw new Error('Person name is required.');

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(config.startDate)) throw new Error('Start date must be in yyyy-mm-dd format.');
  if (!dateRe.test(config.endDate)) throw new Error('End date must be in yyyy-mm-dd format.');
  if (config.endDate < config.startDate) throw new Error('End date must be on or after the start date.');
  (config.excludeDates || []).forEach(entry => {
    (Array.isArray(entry) ? entry : [entry]).forEach(token => {
      if (!dateRe.test(token)) throw new Error('"' + token + '" in the exclude list is not a valid yyyy-mm-dd date.');
    });
  });

  const personKey = sanitizePersonKey(personName);
  const props = PropertiesService.getScriptProperties();

  // Refuse to create a second form for the same person while their
  // Drive files still exist — prevents accidentally overwriting an
  // existing form/schedule and orphaning its properties. But if
  // they've since been deleted (including just moved to Trash — the
  // normal result of hitting "Delete" in Drive, which FormApp.openById()
  // alone doesn't detect since a trashed file still opens fine), there's
  // nothing left to protect: clear the stale record automatically and
  // fall through to create a fresh one, so the same person's name can
  // be reused without a separate forgetPerson() step first.
  const existingFormId = getProp(props, personKey, 'FORM_ID');
  if (existingFormId) {
    let existingForm = null;
    try {
      const existingFile = DriveApp.getFileById(existingFormId);
      if (!existingFile.isTrashed()) {
        existingForm = FormApp.openById(existingFormId);
      }
    } catch (err) {
      existingForm = null;
    }
    if (existingForm) {
      return { status: 'exists', form: existingForm };
    }
    Logger.log('The form this script had on record for "' + personName + '" no longer exists in Drive ' +
      '(deleted, or moved to Trash) — clearing the stale record and creating a fresh one.');
    clearPersonProps(props, personKey);
  }

  // Each person needs two triggers and Apps Script allows 20 per
  // project. Check before creating any files: running out part-way
  // would leave a half-set-up person whose form never updates.
  if (ScriptApp.getProjectTriggers().length + 2 > 20) {
    throw new Error('This project is already running as many sign-ups as Google allows (about 10). ' +
      'Run listPeople(), then run forgetPerson() for someone whose meals are over, and try again.');
  }

  const formTitle = (config.formTitle && String(config.formTitle).trim()) ||
    (WARD_NAME + ' Meal Sign-Up for ' + personName);
  const description = (config.description && String(config.description).trim()) ||
    ('Thank you for signing up to bring a meal for ' + personName + '! ' +
      'When you choose a date below, it will disappear from the available list.');

  const parentFolder = getOrCreateFolder(PARENT_FOLDER_NAME);
  const personFolder = getOrCreateChildFolder(parentFolder, personName);

  const form = FormApp.create(formTitle);
  form.setDescription(description);
  form.setLimitOneResponsePerUser(false); // set true to limit 1 signup per Google account

  form.addTextItem().setTitle(Q_NAME).setRequired(true);
  form.addTextItem().setTitle(Q_PHONE).setRequired(true);
  form.addTextItem().setTitle(Q_EMAIL).setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  const dates = buildDateList(config.startDate, config.endDate, config.excludeDates);
  const dateItem = form.addListItem()
    .setTitle('Choose a date')
    .setRequired(true);
  dateItem.setChoiceValues(dates);

  // Private spreadsheet for full responses (includes phone numbers)
  const responsesSs = SpreadsheetApp.create(formTitle + ' — Responses (private)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSs.getId());
  setupQuickAddSheet(responsesSs);
  setupQuickCancelSheet(responsesSs);

  // Public read-only schedule spreadsheet, laid out as a real calendar
  // (month/year header, weekday columns, one row per week)
  const scheduleSs = SpreadsheetApp.create(formTitle + ' — Schedule');
  const startDate = new Date(config.startDate + 'T00:00:00');
  const endDate = new Date(config.endDate + 'T00:00:00');
  const blocks = buildCalendarBlocks(startDate, endDate, config.excludeDates);
  const dateMap = renderSchedule(scheduleSs, blocks);

  // Grey out any square that's already in the past (e.g. startDate
  // was set to earlier this month) — those never went in the dropdown
  // either, since buildDateList() only includes today onward
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  greyOutPastDates(scheduleSs.getSheetByName('Schedule'), dateMap, today);

  // Remember date -> cell mapping so onSignup can find the right box
  setProp(props, personKey, 'SCHEDULE_MAP', JSON.stringify(dateMap));

  // Make the schedule viewable by anyone with the link (read-only)
  DriveApp.getFileById(scheduleSs.getId())
    .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Move everything into this person's folder.
  // NOTE: the folder itself stays private — only the schedule file
  // above is shared.
  [form.getId(), responsesSs.getId(), scheduleSs.getId()].forEach(id =>
    DriveApp.getFileById(id).moveTo(personFolder));

  // Remember this person's form + schedule sheet so extendSignupForm()
  // (and the triggers below) can find them again later, plus which
  // calendar months are already on the schedule so extendSignupForm()
  // can't add the same month twice. Every key is scoped to this
  // person only — nothing here is shared with any other person.
  setProp(props, personKey, 'DISPLAY_NAME', personName);
  setProp(props, personKey, 'FORM_TITLE', formTitle);
  setProp(props, personKey, 'FOLDER_ID', personFolder.getId());
  setProp(props, personKey, 'SCHEDULE_ID', scheduleSs.getId());
  setProp(props, personKey, 'FORM_ID', form.getId());
  setProp(props, personKey, 'RESPONSES_ID', responsesSs.getId());
  setProp(props, personKey, 'ADDED_MONTHS', JSON.stringify(blocks.map(b => b.key)));
  registerPerson(props, personKey, personName);

  // Map this specific form/spreadsheet back to personKey so the
  // trigger handlers below — which are shared code, fired for
  // whichever person's file actually triggered them — know whose
  // properties to read. This is what lets many people's triggers
  // coexist without a "delete all triggers" step that would break
  // everyone else already set up.
  props.setProperty('formId:' + form.getId(), personKey);
  props.setProperty('ssId:' + responsesSs.getId(), personKey);

  // Trigger: after each signup, remove the date + update the schedule
  ScriptApp.newTrigger('onSignup')
    .forForm(form)
    .onFormSubmit()
    .create();

  // Trigger: watches the "Quick Add" / "Quick Cancel" tabs on this
  // person's private responses spreadsheet for phone/in-person
  // signups and cancellations typed in directly, instead of through
  // the form
  ScriptApp.newTrigger('onResponsesEdit')
    .forSpreadsheet(responsesSs)
    .onEdit()
    .create();

  // Optional: add the schedule link to the form description
  form.setDescription(description +
    '\n\n📅 You can view the current meal calendar here:\n' + scheduleSs.getUrl());

  return { status: 'created', form: form, responsesSs: responsesSs, scheduleSs: scheduleSs };
}

/**
 * ONE-TIME SETUP (run this once, ever — not once per person): creates
 * an "admin" Google Form that lets you (or anyone you share it with —
 * e.g. the rest of the Relief Society presidency) open a brand-new
 * person's meal sign-up just by filling out a web form, instead of
 * editing PERSON_NAME/START_DATE/END_DATE/EXCLUDE_DATES above and
 * running createSignupForm() by hand each time.
 *
 * Submitting it runs createSignupForCore() with whatever was typed
 * in, exactly like createSignupForm() does with the constants above,
 * and writes the resulting links (or an error message) into a
 * "Result" column on that request's own row in the response sheet —
 * check there after submitting, no need to open the execution log.
 *
 * Bookmark the admin form's link (printed below after you run this)
 * — do NOT share it publicly the way you share a person's sign-up
 * link. Unlike those, anyone with this link can create new sign-ups
 * (though never edit or delete an existing person's data — it only
 * ever calls the same "create" path createSignupForm() uses). Keep it
 * to whoever helps coordinate meals.
 */
function createAdminSetupForm() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('ADMIN_FORM_ID');
  if (existingId) {
    let existingForm;
    try {
      existingForm = FormApp.openById(existingId);
    } catch (err) {
      // Same stale-record recovery as createSignupForCore(): the
      // admin form was deleted from Drive outside the script, so
      // there's nothing left to protect — clear the record and fall
      // through to create a fresh one.
      Logger.log('The admin setup form on record no longer exists in Drive (deleted?) — clearing the stale record and creating a fresh one.');
      props.deleteProperty('ADMIN_FORM_ID');
      props.deleteProperty('ADMIN_RESPONSES_ID');
      existingForm = null;
    }
    if (existingForm) {
      Logger.log('The admin setup form already exists — not creating a new one.');
      Logger.log('Admin setup form (bookmark this — do not share publicly):\n' + existingForm.getPublishedUrl());
      return;
    }
  }

  const form = FormApp.create(ADMIN_FORM_TITLE);
  form.setDescription(
    'Fill this out to open a brand-new meal sign-up form + calendar for someone, ' +
    'without editing any code. After submitting, check the "Result" column on your ' +
    'row in the response spreadsheet for the new links (usually appears within seconds).');
  form.setLimitOneResponsePerUser(false);

  form.addTextItem().setTitle(Q_ADMIN_NAME).setRequired(true);
  form.addTextItem().setTitle(Q_ADMIN_START).setRequired(true)
    .setHelpText('Format: yyyy-mm-dd, e.g. 2026-09-01')
    .setValidation(FormApp.createTextValidation()
      .requireTextMatchesPattern('^\\d{4}-\\d{2}-\\d{2}$')
      .build());
  form.addTextItem().setTitle(Q_ADMIN_END).setRequired(true)
    .setHelpText('Format: yyyy-mm-dd')
    .setValidation(FormApp.createTextValidation()
      .requireTextMatchesPattern('^\\d{4}-\\d{2}-\\d{2}$')
      .build());
  form.addParagraphTextItem().setTitle(Q_ADMIN_EXCLUDE).setRequired(false)
    .setHelpText('Optional. Comma-separated. Single date: 2026-09-05. Range: ' +
      '2026-09-08 to 2026-09-10. Leave blank to include every day in the range above.');
  form.addTextItem().setTitle(Q_ADMIN_TITLE).setRequired(false)
    .setHelpText('Default: "' + WARD_NAME + ' Meal Sign-Up for <name>"');
  form.addParagraphTextItem().setTitle(Q_ADMIN_DESCRIPTION).setRequired(false)
    .setHelpText('Default: a generic "thank you for signing up" message. Either way, ' +
      'a link to the calendar is added underneath automatically.');

  const responsesSs = SpreadsheetApp.create(ADMIN_FORM_TITLE + ' — Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSs.getId());
  responsesSs.getActiveSheet().getRange(1, 8).setValue('Result').setFontWeight('bold');
  responsesSs.getActiveSheet().setColumnWidth(8, 420);

  const parentFolder = getOrCreateFolder(PARENT_FOLDER_NAME);
  [form.getId(), responsesSs.getId()].forEach(id => DriveApp.getFileById(id).moveTo(parentFolder));

  props.setProperty('ADMIN_FORM_ID', form.getId());
  props.setProperty('ADMIN_RESPONSES_ID', responsesSs.getId());

  // Bound to the SPREADSHEET (not .forForm(form)) — that's the only
  // onFormSubmit variant whose event object includes e.range, which
  // onAdminSetupSubmit() needs to find the row to write the Result
  // into. A form-bound trigger's event has e.response instead, with
  // no row/range information at all.
  ScriptApp.newTrigger('onAdminSetupSubmit')
    .forSpreadsheet(responsesSs)
    .onFormSubmit()
    .create();

  Logger.log('Admin setup form created — bookmark this link, it will not change (do not share it publicly):');
  Logger.log(form.getPublishedUrl());
  Logger.log('Its response/results spreadsheet (for you only):\n' + responsesSs.getUrl());
}

/**
 * Runs automatically whenever the admin setup form (see
 * createAdminSetupForm()) is submitted. Parses the six answers into
 * the same config shape createSignupForm() builds from the top-of-
 * file constants, runs it through createSignupForCore(), and writes
 * the outcome (links, "already exists", or a validation error) into
 * the "Result" column on that submission's own row.
 *
 * This is a SPREADSHEET-bound onFormSubmit trigger (see
 * createAdminSetupForm()), so e has e.range/e.namedValues — NOT
 * e.response like the per-person onSignup() trigger below, which is
 * bound directly to its form instead.
 */
function onAdminSetupSubmit(e) {
  const answer = title => ((e.namedValues[title] || [])[0] || '').trim();
  const personName = answer(Q_ADMIN_NAME);
  const startDate = answer(Q_ADMIN_START);
  const endDate = answer(Q_ADMIN_END);
  const excludeText = answer(Q_ADMIN_EXCLUDE);
  const formTitle = answer(Q_ADMIN_TITLE);
  const description = answer(Q_ADMIN_DESCRIPTION);
  const resultCell = e.range.getSheet().getRange(e.range.getRow(), 8);

  let result;
  try {
    const excludeDates = parseExcludeDatesText(excludeText);
    result = createSignupForCore({ personName, startDate, endDate, excludeDates, formTitle, description });
  } catch (err) {
    resultCell.setValue(sanitizeCell('ERROR: ' + err.message));
    console.error('Admin setup form submission failed for "' + personName + '": ' + err);
    return;
  }

  if (result.status === 'exists') {
    resultCell.setValue(sanitizeCell(
      'Already exists — sign-up: ' + result.form.getPublishedUrl() +
      '\nTo open up more days for them: in the script editor, set PERSON_NAME to "' + personName +
      '" and START_DATE/END_DATE to the new range, then run extendSignupForm().'))
      .setWrap(true);
    return;
  }

  resultCell.setValue(sanitizeCell(
    'Created!\nSign-up: ' + result.form.getPublishedUrl() +
    '\nSchedule: ' + result.scheduleSs.getUrl() +
    '\nPrivate responses: ' + result.responsesSs.getUrl()))
    .setWrap(true);
}

/**
 * Repair tool: re-attaches the onAdminSetupSubmit trigger to the
 * EXISTING admin setup form, without creating a new form/spreadsheet.
 * Use this if submitting the admin form doesn't do anything — check
 * the "Result" column on the response spreadsheet first: if it's
 * blank on your submission's row, the trigger never fired at all
 * (most likely cause: it's missing — a re-authorization, e.g. after
 * changing this script's OAuth scopes, can drop installable triggers;
 * also double-check you submitted through the form's real published
 * link and not the "Preview" button in the Forms editor, since
 * preview submissions never fire installable triggers either way).
 * Safe to run more than once — it removes any existing
 * onAdminSetupSubmit trigger(s) first, so it can't end up with
 * duplicates that would double-process the same submission.
 */
function reinstallAdminTrigger() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('ADMIN_RESPONSES_ID');
  if (!ssId) {
    throw new Error('No admin setup form found — run createAdminSetupForm() first.');
  }
  const responsesSs = SpreadsheetApp.openById(ssId);

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onAdminSetupSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Bound to the SPREADSHEET (not .forForm()) — see the comment where
  // this trigger is first created in createAdminSetupForm() for why.
  ScriptApp.newTrigger('onAdminSetupSubmit')
    .forSpreadsheet(responsesSs)
    .onFormSubmit()
    .create();

  Logger.log('Re-installed the onAdminSetupSubmit trigger on the admin setup form. Try submitting it again.');
}

/**
 * Clears the script's record of the admin setup form WITHOUT touching
 * its Drive files (the form or its response spreadsheet) — use this
 * to force createAdminSetupForm() to build a completely fresh admin
 * form, e.g. after this script gained new fields (like the optional
 * title/description overrides) that an already-existing admin form
 * doesn't have. Also removes its onFormSubmit trigger, since it would
 * otherwise be left pointed at a spreadsheet this script no longer
 * tracks. Does not affect any person's data. After running this,
 * delete the old admin form + its response spreadsheet from Drive
 * yourself (optional cleanup — they're just inert once forgotten),
 * then run createAdminSetupForm() to create the replacement.
 */
function forgetAdminSetupForm() {
  const props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onAdminSetupSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  props.deleteProperty('ADMIN_FORM_ID');
  props.deleteProperty('ADMIN_RESPONSES_ID');
  Logger.log('Forgot the admin setup form record — run createAdminSetupForm() to create a fresh one. Its old Drive files (if any) were not touched.');
}

/**
 * Parses the admin form's free-text "Dates to exclude" answer into an
 * EXCLUDE_DATES-shaped array: comma-separated entries, each either a
 * single 'yyyy-mm-dd' date or 'yyyy-mm-dd to yyyy-mm-dd' for a range
 * (turned into a [start, end] pair). Does not validate the date
 * tokens themselves — createSignupForCore() does that against every
 * entry and throws a clear message for whichever one is malformed.
 */
function parseExcludeDatesText(text) {
  if (!text) return [];
  return text.split(',')
    .map(s => s.trim())
    .filter(s => s)
    .map(token => {
      const m = token.match(/^(\S+)\s+to\s+(\S+)$/i);
      return m ? [m[1], m[2]] : token;
    });
}

/**
 * Extends the EXISTING form + schedule sheet for PERSON_NAME (as set
 * above) with a new date range, instead of making a fresh form. The
 * sign-up link and schedule link stay exactly the same — just update
 * START_DATE/END_DATE above and run this. Only touches PERSON_NAME's
 * own data; every other person set up in this script is untouched.
 *
 * - Adds the new range's dates to the form's dropdown, keeping any
 *   still-open dates from before (minus ones now in the past)
 * - Re-opens the form if a previous batch of dates had filled it up
 * - Appends a new calendar block to the schedule sheet below the
 *   existing one(s) — past months are left in place as a record
 * - Refuses to add a calendar month that's already been added before
 *   for this person (tracked per-person in ADDED_MONTHS), so
 *   re-running it with the same/overlapping START_DATE/END_DATE is a
 *   harmless no-op instead of creating a duplicate block or
 *   re-opening claimed dates
 *
 * Run createSignupForm() once first for this PERSON_NAME; after that,
 * just run this each time you want to open up more days for them.
 */
function extendSignupForm() {
  const personKey = sanitizePersonKey(PERSON_NAME);
  const props = PropertiesService.getScriptProperties();
  const formId = getProp(props, personKey, 'FORM_ID');
  const scheduleId = getProp(props, personKey, 'SCHEDULE_ID');
  if (!formId || !scheduleId) {
    throw new Error('No existing form found for "' + PERSON_NAME + '" — run createSignupForm() first.');
  }

  const startDate = new Date(START_DATE + 'T00:00:00');
  const endDate = new Date(END_DATE + 'T00:00:00');
  const allBlocks = buildCalendarBlocks(startDate, endDate, EXCLUDE_DATES);

  // Drop any calendar month already added for this person on a
  // previous run, so this function is safe to re-run with the same
  // or overlapping dates
  const addedMonths = JSON.parse(getProp(props, personKey, 'ADDED_MONTHS') || '[]');
  const skippedBlocks = allBlocks.filter(b => addedMonths.indexOf(b.key) !== -1);
  const newBlocks = allBlocks.filter(b => addedMonths.indexOf(b.key) === -1);

  if (skippedBlocks.length > 0) {
    Logger.log('Already added, skipping: ' + skippedBlocks.map(b => b.label).join(', '));
  }
  if (newBlocks.length === 0) {
    Logger.log('Nothing to do — every month in ' + START_DATE + ' to ' + END_DATE +
      ' has already been added for ' + PERSON_NAME + '. Change START_DATE/END_DATE to a new range.');
    return;
  }

  const form = FormApp.openById(formId);
  const scheduleSs = SpreadsheetApp.openById(scheduleId);

  // Re-open in case the last batch of dates filled up and the form
  // auto-closed itself
  form.setAcceptingResponses(true);

  // Keep still-open, still-future choices from before; drop the
  // "all filled" placeholder and anything now in the past
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keptChoices = listItem.getChoices()
    .map(c => c.getValue())
    .filter(v => v !== '(All dates are filled)')
    .filter(v => {
      const d = parseDateLabel(v);
      return d && d >= today;
    });

  // New dropdown choices come only from the NOT-already-added months,
  // and only from today onward (in case START_DATE lands mid-month),
  // so a duplicate/overlapping run can't reopen an already-claimed
  // or already-past date
  const newDates = newBlocks
    .reduce((cells, block) => cells.concat(block.weeks.flat()), [])
    .filter(cell => cell && cell.status === 'available' &&
      new Date(cell.isoDate + 'T00:00:00') >= today)
    .map(cell => cell.dateLabel);
  const merged = keptChoices.concat(newDates.filter(d => keptChoices.indexOf(d) === -1));
  listItem.setChoiceValues(merged);

  // Append the new calendar block(s) below whatever is already drawn
  const sheet = scheduleSs.getSheetByName('Schedule') || scheduleSs.getActiveSheet();
  const startRow = sheet.getLastRow() > 0 ? sheet.getLastRow() + 2 : 1;
  const newMap = renderSchedule(scheduleSs, newBlocks, startRow);

  // Merge the new date -> cell mapping into this person's existing
  // one (keys are full dates, so old and new months never collide)
  const mapJson = getProp(props, personKey, 'SCHEDULE_MAP');
  const dateMap = mapJson ? JSON.parse(mapJson) : {};
  Object.assign(dateMap, newMap);
  setProp(props, personKey, 'SCHEDULE_MAP', JSON.stringify(dateMap));

  // Grey out any square that's now in the past with nobody signed up
  // for it, across this person's WHOLE schedule (not just the new
  // block) — this is the natural moment to sweep, since it's when
  // we're already touching the sheet and re-checking "today"
  greyOutPastDates(sheet, dateMap, today);

  // Remember these months as added so a future run can't duplicate them
  setProp(props, personKey, 'ADDED_MONTHS',
    JSON.stringify(addedMonths.concat(newBlocks.map(b => b.key))));

  Logger.log('Added for ' + PERSON_NAME + ': ' + newBlocks.map(b => b.label).join(', '));
  Logger.log('SIGN-UP link (unchanged):\n' + form.getPublishedUrl());
  Logger.log('SCHEDULE link (unchanged):\n' + scheduleSs.getUrl());
}

/**
 * Greys out any square in dateMap whose date has passed and that
 * nobody signed up for (still showing the white "— available —"
 * styling from renderSchedule). Squares someone already claimed
 * (green background, from onSignup) are left untouched.
 */
function greyOutPastDates(sheet, dateMap, today) {
  Object.keys(dateMap).forEach(label => {
    const ref = dateMap[label];
    if (new Date(ref.iso + 'T00:00:00') >= today) return;

    const cell = sheet.getRange(ref.row, ref.col);
    if (cell.getBackground() === '#93c47d') return; // already claimed

    const dayNumber = cell.getValue().toString().split('\n')[0];
    cell.setValue(dayNumber + '\n(past)')
      .setBackground('#efefef')
      .setFontColor('#999999');
  });
}

/**
 * Reopens a single date that someone had to back out of, for
 * PERSON_NAME as set above: set CANCEL_DATE above to the date
 * (yyyy-mm-dd) and run this. (For most cancellations, typing the date
 * into the "Quick Cancel" tab on that person's private responses
 * spreadsheet is easier — this is the script-editor equivalent.)
 */
function cancelSignup() {
  if (!CANCEL_DATE) {
    throw new Error('Set CANCEL_DATE above to the date you want to reopen (yyyy-mm-dd), then run cancelSignup() again.');
  }

  const personKey = sanitizePersonKey(PERSON_NAME);
  const props = PropertiesService.getScriptProperties();
  const formId = getProp(props, personKey, 'FORM_ID');
  if (!formId) {
    throw new Error('No existing form found for "' + PERSON_NAME + '" — run createSignupForm() first.');
  }

  const label = findDateLabel(props, personKey, CANCEL_DATE);
  if (!label) {
    throw new Error('Could not find ' + CANCEL_DATE +
      ' on ' + PERSON_NAME + '\'s schedule. Check CANCEL_DATE is in yyyy-mm-dd format and falls in a month that has already been added.');
  }

  const form = FormApp.openById(formId);
  const result = releaseDate(props, personKey, form, label);
  Logger.log(result || (label + ' is available again — back on the form for someone else to sign up.'));
}

/**
 * Releases dateLabel back to "available" for the given person: removes
 * their row from the "Form Responses" roster, clears the schedule
 * square, and — if the date hasn't already passed — puts it back on
 * the form's dropdown (reopening the form if it had auto-closed).
 * Shared by cancelSignup() (script-driven) and handleQuickCancel()
 * (the "Quick Cancel" spreadsheet tab). Returns null on a normal
 * reopen, or a message describing what happened otherwise — an
 * error, or a note that a past date was only cleared, not reopened.
 */
function releaseDate(props, personKey, form, dateLabel) {
  const scheduleId = getProp(props, personKey, 'SCHEDULE_ID');
  const mapJson = getProp(props, personKey, 'SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    return 'SCHEDULE_ID/SCHEDULE_MAP not set for this person — re-run createSignupForm() first.';
  }
  const dateMap = JSON.parse(mapJson);
  const cellRef = dateMap[dateLabel];
  if (!cellRef) {
    return 'Could not find "' + dateLabel + '" in the schedule calendar.';
  }

  // Remove their row from the "Form Responses" roster, since they're
  // no longer signed up for this date
  const responsesId = getProp(props, personKey, 'RESPONSES_ID');
  if (responsesId) removeResponseRows(SpreadsheetApp.openById(responsesId), dateLabel);

  const sheet = SpreadsheetApp.openById(scheduleId).getSheetByName('Schedule');
  const cell = sheet.getRange(cellRef.row, cellRef.col);
  const dayNumber = cell.getValue().toString().split('\n')[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = new Date(cellRef.iso + 'T00:00:00') < today;

  if (isPast) {
    cell.setValue(dayNumber + '\n(past)')
      .setBackground('#efefef')
      .setFontColor('#999999');
    return 'Cleared, but not reopened — ' + dateLabel + ' has already passed.';
  }

  cell.setValue(dayNumber + '\n— available —')
    .setBackground('#ffffff')
    .setFontColor('#000000');

  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const choices = listItem.getChoices()
    .map(c => c.getValue())
    .filter(v => v !== '(All dates are filled)');
  if (choices.indexOf(dateLabel) === -1) choices.push(dateLabel);

  // Keep the dropdown in chronological order
  choices.sort((a, b) => {
    const ia = dateMap[a] ? dateMap[a].iso : '';
    const ib = dateMap[b] ? dateMap[b].iso : '';
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  listItem.setChoiceValues(choices);

  if (!form.isAcceptingResponses()) {
    form.setAcceptingResponses(true);
  }

  return null;
}

/** Parses a dateLabel in 'EEEE, MMMM d, yyyy' format (as produced by buildDateList) back into a Date. */
function parseDateLabel(label) {
  const parts = label.split(', ');
  if (parts.length !== 3) return null;
  const d = new Date(parts[1] + ' ' + parts[2]);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Turns PERSON_NAME into a stable, filesystem/property-safe key
 * (lowercase, alphanumeric + hyphens) used to namespace every script
 * property for that person, so two different people never collide on
 * the same key even if names overlap in spacing/punctuation.
 */
function sanitizePersonKey(name) {
  const key = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!key) throw new Error('PERSON_NAME must contain at least one letter or number.');
  return key;
}

/** Reads a script property scoped to one person (namespaced so no two people's data can collide). */
function getProp(props, personKey, base) {
  return props.getProperty('p:' + personKey + ':' + base);
}

/** Writes a script property scoped to one person (namespaced so no two people's data can collide). */
function setProp(props, personKey, base, value) {
  props.setProperty('p:' + personKey + ':' + base, value);
}

/** Adds personKey/displayName to the running list of everyone set up in this script, if not already there. */
function registerPerson(props, personKey, displayName) {
  const list = JSON.parse(props.getProperty('PEOPLE') || '[]');
  if (!list.some(p => p.key === personKey)) {
    list.push({ key: personKey, name: displayName });
    props.setProperty('PEOPLE', JSON.stringify(list));
  }
}

/**
 * Logs every person currently set up in this script (from any prior
 * createSignupForm() run) with their sign-up and schedule links, so
 * you don't have to hunt through Drive to find them all.
 */
function listPeople() {
  const props = PropertiesService.getScriptProperties();
  const list = JSON.parse(props.getProperty('PEOPLE') || '[]');
  if (list.length === 0) {
    Logger.log('No one has been set up yet — set PERSON_NAME and run createSignupForm().');
    return;
  }
  // openById() throws for a file deleted from Drive; one person's
  // deleted folder must not stop everyone else's links being listed.
  const urlOf = (id, open) => {
    if (!id) return '(missing)';
    try {
      return open(id);
    } catch (err) {
      return '(deleted from Drive)';
    }
  };
  list.forEach(p => {
    const formUrl = urlOf(getProp(props, p.key, 'FORM_ID'), id => FormApp.openById(id).getPublishedUrl());
    const scheduleUrl = urlOf(getProp(props, p.key, 'SCHEDULE_ID'), id => SpreadsheetApp.openById(id).getUrl());
    Logger.log(p.name + '\n  Sign-up:  ' + formUrl + '\n  Schedule: ' + scheduleUrl);
  });
}

/**
 * Forgets a person's script properties WITHOUT touching their Drive
 * files (form/spreadsheets/folder). You normally DON'T need this just
 * to reuse a name after deleting someone's files — createSignupForCore()
 * already detects a deleted (or Trashed) form and clears the stale
 * record on its own. Use this instead when you want a clean slate
 * WITHOUT deleting their Drive files yet (e.g. to stop the script
 * tracking them while you archive their folder manually later), and
 * when their meals are over — it removes their two triggers, which
 * frees room for more people under Apps Script's 20-trigger limit.
 * Their form stops updating itself after this, so only run it once
 * nobody needs their sign-up anymore. Set PERSON_NAME above to match,
 * then run this. Does nothing to any other person's data.
 */
function forgetPerson() {
  const personKey = sanitizePersonKey(PERSON_NAME);
  const props = PropertiesService.getScriptProperties();
  if (!getProp(props, personKey, 'FORM_ID')) {
    Logger.log('No one called "' + PERSON_NAME + '" is set up — nothing to forget. Run listPeople() to see the exact names.');
    return;
  }
  clearPersonProps(props, personKey);
  Logger.log('Forgot "' + PERSON_NAME + '" — this script no longer tracks a form/schedule for them, ' +
    'and their sign-up form no longer updates itself. ' +
    'Their Drive files (if any remain) were not touched.');
}

/**
 * Deletes every script property scoped to personKey (form/schedule/
 * responses IDs, the date map, added-months, the formId:/ssId:
 * lookup entries, and their entry in the PEOPLE list) WITHOUT
 * touching any Drive file. Shared by forgetPerson() (explicit,
 * user-requested) and createSignupForm()'s stale-record recovery
 * (automatic, only once the referenced form has been confirmed gone).
 *
 * Also deletes that person's two triggers (onSignup on their form,
 * onResponsesEdit on their responses sheet), matched by source file ID
 * so nobody else's are touched. Apps Script allows only 20 triggers
 * per project, and each person adds two, so without this a project
 * stops being able to set anyone up after about ten people.
 */
function clearPersonProps(props, personKey) {
  const formId = getProp(props, personKey, 'FORM_ID');
  const ssId = getProp(props, personKey, 'RESPONSES_ID');

  const sourceIds = [formId, ssId].filter(id => id);
  ScriptApp.getProjectTriggers()
    .filter(t => sourceIds.indexOf(t.getTriggerSourceId()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ['DISPLAY_NAME', 'FORM_TITLE', 'FOLDER_ID', 'SCHEDULE_ID', 'FORM_ID', 'RESPONSES_ID', 'SCHEDULE_MAP', 'ADDED_MONTHS']
    .forEach(base => props.deleteProperty('p:' + personKey + ':' + base));
  if (formId) props.deleteProperty('formId:' + formId);
  if (ssId) props.deleteProperty('ssId:' + ssId);

  const list = JSON.parse(props.getProperty('PEOPLE') || '[]').filter(p => p.key !== personKey);
  props.setProperty('PEOPLE', JSON.stringify(list));
}

/** Find the folder if this script already made it, otherwise create it. */
function getOrCreateFolder(name) {
  const existing = DriveApp.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : DriveApp.createFolder(name);
}

/** Find a child folder by name directly under parentFolder, otherwise create it. */
function getOrCreateChildFolder(parentFolder, name) {
  const existing = parentFolder.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parentFolder.createFolder(name);
}

/** Every date from startDateStr to endDateStr ('yyyy-mm-dd', inclusive), skipping anything before today or listed in excludeDates. No day-of-week is excluded by default. */
function buildDateList(startDateStr, endDateStr, excludeDates) {
  const tz = Session.getScriptTimeZone();
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const excluded = buildExcludedDateSet(excludeDates);
  const dates = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (d >= today && !excluded.has(iso)) {
      dates.push(Utilities.formatDate(d, tz, 'EEEE, MMMM d, yyyy'));
    }
  }
  return dates;
}

/** Expands an EXCLUDE_DATES-shaped array (single dates and/or [start, end] range pairs) into a Set of 'yyyy-mm-dd' strings. */
function buildExcludedDateSet(excludeDates) {
  const tz = Session.getScriptTimeZone();
  const set = new Set();
  (excludeDates || []).forEach(entry => {
    if (Array.isArray(entry)) {
      const [startStr, endStr] = entry;
      const d = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        set.add(Utilities.formatDate(d, tz, 'yyyy-MM-dd'));
      }
    } else {
      set.add(entry);
    }
  });
  return set;
}

/**
 * Groups the START_DATE..END_DATE range into one block per calendar
 * month (usually just one), each broken into weeks of 7 days
 * (Sun-Sat). Every day in range is available — there's no
 * day-of-week restriction — so a range can be as short as a single
 * day or as long as needed, except for anything listed in
 * excludeDates. Days outside the sign-up range (or excluded) are
 * marked so they render differently but still show up as real
 * calendar squares (for a clean grid).
 */
function buildCalendarBlocks(startDate, endDate, excludeDates) {
  const tz = Session.getScriptTimeZone();
  const excluded = buildExcludedDateSet(excludeDates);
  const blocks = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= lastMonth) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks = [];
    let week = new Array(7).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const col = d.getDay(); // 0 = Sun ... 6 = Sat
      const iso = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      const inRange = d >= startDate && d <= endDate;
      let status;
      if (!inRange) status = 'n/a';
      else if (excluded.has(iso)) status = 'excluded';
      else status = 'available';

      week[col] = {
        day: day,
        // Must exactly match the labels used in buildDateList() /
        // the form's choice values, since this is the lookup key.
        dateLabel: status === 'available'
          ? Utilities.formatDate(d, tz, 'EEEE, MMMM d, yyyy')
          : null,
        isoDate: status === 'available'
          ? Utilities.formatDate(d, tz, 'yyyy-MM-dd')
          : null,
        status: status
      };

      if (col === 6 || day === daysInMonth) {
        weeks.push(week);
        week = new Array(7).fill(null);
      }
    }

    blocks.push({
      key: Utilities.formatDate(cursor, tz, 'yyyy-MM'),
      label: Utilities.formatDate(cursor, tz, 'MMMM yyyy'),
      weeks: weeks
    });
    cursor = new Date(year, month + 1, 1);
  }

  return blocks;
}

/**
 * Draws the calendar block(s) onto the schedule spreadsheet: a
 * merged month/year title row, a weekday header row, then one row
 * per week with one column per day. Returns a map of
 * dateLabel -> {row, col} for every "available" day, so onSignup()
 * can write a name straight into the right box.
 *
 * startRow (default 1) lets extendSignupForm() append new month
 * block(s) below whatever is already on the sheet instead of
 * overwriting it.
 */
function renderSchedule(scheduleSs, blocks, startRow) {
  const sheet = scheduleSs.getActiveSheet();
  if (sheet.getName() !== 'Schedule') sheet.setName('Schedule');
  const HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateMap = {};
  let row = startRow || 1;

  blocks.forEach(block => {
    // Month + year title, merged across all 7 day columns
    sheet.getRange(row, 1, 1, 7).merge()
      .setValue(block.label)
      .setFontWeight('bold')
      .setFontSize(14)
      .setHorizontalAlignment('center')
      .setBackground('#4a86e8')
      .setFontColor('#ffffff');
    sheet.setRowHeight(row, 30);
    row++;

    // Weekday header row
    sheet.getRange(row, 1, 1, 7).setValues([HEADERS])
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#cfe2f3');
    row++;

    // One row per week
    block.weeks.forEach(week => {
      const rowValues = [];
      for (let c = 0; c < 7; c++) {
        const cell = week[c];
        if (!cell) {
          rowValues.push('');
        } else if (cell.status === 'available') {
          rowValues.push(cell.day + '\n— available —');
        } else if (cell.status === 'excluded') {
          rowValues.push(cell.day + '\n(not needed)');
        } else {
          rowValues.push(String(cell.day));
        }
      }
      sheet.getRange(row, 1, 1, 7).setValues([rowValues])
        .setWrap(true)
        .setVerticalAlignment('top')
        .setBorder(true, true, true, true, true, true);
      sheet.setRowHeight(row, 50);

      for (let c = 0; c < 7; c++) {
        const cell = week[c];
        const cellRange = sheet.getRange(row, c + 1);
        if (!cell) {
          cellRange.setBackground('#f3f3f3');
          continue;
        }
        if (cell.status === 'n/a') {
          cellRange.setBackground('#f3f3f3').setFontColor('#cccccc');
        } else if (cell.status === 'excluded') {
          cellRange.setBackground('#efefef').setFontColor('#999999');
        } else {
          cellRange.setBackground('#ffffff').setFontColor('#000000');
          dateMap[cell.dateLabel] = { row: row, col: c + 1, iso: cell.isoDate };
        }
      }
      row++;
    });

    row++; // blank separator row before the next month's block
  });

  sheet.setColumnWidths(1, 7, 130);
  return dateMap;
}

/**
 * Runs automatically on each form submission. Shared code for every
 * person's form — looks up which person this particular form belongs
 * to via the formId -> personKey mapping set in createSignupForm(),
 * so it only ever touches that one person's data.
 */
function onSignup(e) {
  const form = e.source;
  const props = PropertiesService.getScriptProperties();
  const personKey = props.getProperty('formId:' + form.getId());
  if (!personKey) {
    console.error('onSignup fired for a form this script does not recognize: ' + form.getId());
    return;
  }

  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const responses = e.response.getItemResponses();

  const chosenDate = responses
    .find(r => r.getItem().getId() === listItem.getId())
    .getResponse();
  const name = findResponse(responses, Q_NAME);
  const email = findResponse(responses, Q_EMAIL);

  const error = claimDate(props, personKey, form, chosenDate, name, email);
  if (error) console.error(error);
}

/**
 * Runs on every edit to any person's private responses spreadsheet.
 * Looks up which person this spreadsheet belongs to via the
 * ssId -> personKey mapping, then dispatches to the handler for
 * whichever "Quick ..." tab was touched; ignores edits everywhere
 * else (e.g. the form's own "Form Responses" tab) or on a spreadsheet
 * this script doesn't recognize.
 */
function onResponsesEdit(e) {
  const sheetName = e.range.getSheet().getName();
  if (sheetName !== 'Quick Add' && sheetName !== 'Quick Cancel') return;

  const props = PropertiesService.getScriptProperties();
  const ss = e.range.getSheet().getParent();
  const personKey = props.getProperty('ssId:' + ss.getId());
  if (!personKey) {
    console.error('onResponsesEdit fired for a spreadsheet this script does not recognize: ' + ss.getId());
    return;
  }

  if (sheetName === 'Quick Add') handleQuickAdd(e, props, personKey);
  else handleQuickCancel(e, props, personKey);
}

/**
 * Watches the "Quick Add" tab for phone/in-person signups typed in
 * directly (Name + Date filled in on a row not already marked
 * "Done"), and processes each one exactly like a real form submission.
 */
function handleQuickAdd(e, props, personKey) {
  const sheet = e.range.getSheet();
  const firstRow = Math.max(e.range.getRow(), 2); // skip the header row
  const lastRow = e.range.getLastRow();
  if (lastRow < 2) return;

  const formId = getProp(props, personKey, 'FORM_ID');
  if (!formId) return; // createSignupForm() hasn't run yet for this person

  const form = FormApp.openById(formId);
  const responsesSs = sheet.getParent();

  for (let row = firstRow; row <= lastRow; row++) {
    const [name, phone, email, dateVal, status] = sheet.getRange(row, 1, 1, 5).getValues()[0];
    if (status === 'Done' || !name || !dateVal) continue; // incomplete or already handled

    const label = findDateLabel(props, personKey, String(dateVal).trim());
    const statusCell = sheet.getRange(row, 5);
    if (!label) {
      statusCell.setValue('Could not match "' + dateVal + '" — use yyyy-mm-dd and make sure that month has been added.');
      continue;
    }

    const error = claimDate(props, personKey, form, label, name, email);
    if (!error) appendResponseRow(responsesSs, name, phone, email, label);
    statusCell.setValue(error || 'Done');
  }
}

/**
 * Adds a row to the form's own "Form Responses" tab for a signup that
 * didn't come through the form itself (Quick Add), so that tab stays
 * a complete roster of everyone signed up, not just real submissions.
 * Column order matches the form's questions: Timestamp, Name, Phone,
 * Email, Date.
 */
function appendResponseRow(responsesSs, name, phone, email, dateLabel) {
  const sheet = getFormResponsesSheet(responsesSs);
  if (!sheet) return;
  sheet.appendRow([new Date(), sanitizeCell(name), sanitizeCell(phone), sanitizeCell(email), dateLabel]);
}

/**
 * Neutralizes spreadsheet formula injection: Sheets treats any cell
 * value starting with =, +, -, or @ as a formula, even when written
 * via appendRow()/setValues(). Since Quick Add's Name/Phone/Email
 * columns come from free-text typed by whoever is doing the sign-up
 * (which could itself echo a value someone else typed into the
 * public form), prefix a leading '\'' to force such values to render
 * as plain text instead of being evaluated.
 */
function sanitizeCell(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

/**
 * Deletes every row on the "Form Responses" tab whose Date column
 * (5th column: Timestamp, Name, Phone, Email, Date) matches dateLabel,
 * since releaseDate() calls this whenever a signup for that date is
 * cancelled — that roster should only ever show who's currently
 * signed up, not people who backed out.
 */
function removeResponseRows(responsesSs, dateLabel) {
  const sheet = getFormResponsesSheet(responsesSs);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const dateCol = 5;
  const values = sheet.getRange(2, dateCol, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) { // bottom-up so row numbers don't shift mid-loop
    if (values[i][0] === dateLabel) sheet.deleteRow(i + 2);
  }
}

/** Finds the form's own "Form Responses" tab on the private spreadsheet (the one sheet that isn't "Quick Add"/"Quick Cancel"). */
function getFormResponsesSheet(responsesSs) {
  return responsesSs.getSheets()
    .find(s => s.getName() !== 'Quick Add' && s.getName() !== 'Quick Cancel');
}

/**
 * Watches the "Quick Cancel" tab for dates typed in directly (a Date
 * filled in on a row not already marked "Reopened"), and releases
 * each one back to available exactly like cancelSignup() does.
 */
function handleQuickCancel(e, props, personKey) {
  const sheet = e.range.getSheet();
  const firstRow = Math.max(e.range.getRow(), 2); // skip the header row
  const lastRow = e.range.getLastRow();
  if (lastRow < 2) return;

  const formId = getProp(props, personKey, 'FORM_ID');
  if (!formId) return; // createSignupForm() hasn't run yet for this person

  const form = FormApp.openById(formId);

  for (let row = firstRow; row <= lastRow; row++) {
    const [dateVal, status] = sheet.getRange(row, 1, 1, 2).getValues()[0];
    if (status === 'Reopened' || !dateVal) continue; // empty or already handled

    const label = findDateLabel(props, personKey, String(dateVal).trim());
    const statusCell = sheet.getRange(row, 2);
    if (!label) {
      statusCell.setValue('Could not match "' + dateVal + '" — use yyyy-mm-dd and make sure that month has been added.');
      continue;
    }

    const result = releaseDate(props, personKey, form, label);
    statusCell.setValue(result || 'Reopened');
  }
}

/**
 * Claims dateLabel on the given person's form for name/email: removes
 * it from the dropdown (closing the form if that was the last one),
 * marks their schedule square, and emails a confirmation if an email
 * was given. Shared by onSignup() (real form submissions) and
 * handleQuickAdd() (phone/in-person signups typed into "Quick Add").
 * Returns an error message string on failure, or null on success —
 * callers decide how to surface that (log it, write it to a cell...).
 */
function claimDate(props, personKey, form, dateLabel, name, email) {
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const choices = listItem.getChoices().map(c => c.getValue());
  if (choices.indexOf(dateLabel) === -1) {
    return '"' + dateLabel + '" is not an open date on the form (already taken, or not a valid date).';
  }

  const scheduleId = getProp(props, personKey, 'SCHEDULE_ID');
  const mapJson = getProp(props, personKey, 'SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    return 'SCHEDULE_ID/SCHEDULE_MAP not set for this person — re-run createSignupForm() to create the schedule sheet.';
  }
  const dateMap = JSON.parse(mapJson);
  const cellRef = dateMap[dateLabel.trim()];
  if (!cellRef) {
    return 'Could not find "' + dateLabel + '" in the schedule calendar.';
  }

  // 1) Remove the taken date from the form
  const remaining = choices.filter(v => v !== dateLabel);
  if (remaining.length > 0) {
    listItem.setChoiceValues(remaining);
  } else {
    listItem.setChoiceValues(['(All dates are filled)']);
    form.setAcceptingResponses(false);
    // Best-effort only, wrapped so a failure here (e.g. Forms
    // rejecting this text for some reason) can NEVER stop the rest of
    // claimDate() from running — step 2 below (marking the calendar)
    // and step 3 (the confirmation email) are the actual point of
    // this function and must always complete regardless of whether
    // this cosmetic message succeeds.
    try {
      // Same auto-linkify behavior the form description already
      // relies on for its calendar link — Forms turns a plain URL in
      // this message into a clickable link on the "not accepting
      // responses" page. Kept to one line/no emoji here (unlike the
      // description) since a multi-line version of this specific call
      // is what threw "Invalid data updating form" in testing.
      form.setCustomClosedFormMessage(
        'All dates are filled — thank you so much! You can still view the calendar here: ' +
        SpreadsheetApp.openById(scheduleId).getUrl());
    } catch (err) {
      console.error('Could not set the closed-form message for "' + personKey + '": ' + err);
    }
  }

  // 2) Write the name into the right day-square on the public calendar
  const sheet = SpreadsheetApp.openById(scheduleId).getSheetByName('Schedule');
  const cell = sheet.getRange(cellRef.row, cellRef.col);
  // Cell text is "day number\nstatus" — keep the day number, replace
  // only the status/name line so the square still looks right.
  const dayNumber = cell.getValue().toString().split('\n')[0];
  // Never write a blank name: the date has already left the dropdown
  // above, and an empty name line makes setTextStyle() below throw, so
  // the day would vanish from both the form and the schedule. That
  // happens when the name question gets renamed in the Forms editor.
  const shownName = String(name || '').trim() || '(signed up)';
  const cellText = dayNumber + '\n' + shownName;

  // Bold just the name line, then mark the square green so filled
  // days stand out on the calendar at a glance.
  const richText = SpreadsheetApp.newRichTextValue()
    .setText(cellText)
    .setTextStyle(dayNumber.length + 1, cellText.length,
      SpreadsheetApp.newTextStyle().setBold(true).build())
    .build();
  cell.setRichTextValue(richText);
  cell.setBackground('#93c47d');

  // 3) Email the signer a confirmation + calendar invite, if given one
  // (a Quick Add row's Email cell can hold just a stray space)
  const address = String(email || '').trim();
  if (address) sendConfirmationEmail(props, personKey, address, shownName, dateLabel, cellRef.iso);

  return null;
}

/** Looks up the dateLabel (e.g. 'Tuesday, September 1, 2026') whose iso date matches isoDate, for this person, or null if none does. */
function findDateLabel(props, personKey, isoDate) {
  const mapJson = getProp(props, personKey, 'SCHEDULE_MAP');
  const dateMap = mapJson ? JSON.parse(mapJson) : {};
  return Object.keys(dateMap).find(label => dateMap[label].iso === isoDate) || null;
}

/** Creates the "Quick Add" tab on the private responses spreadsheet, for phone/in-person signups. */
function setupQuickAddSheet(responsesSs) {
  const sheet = responsesSs.insertSheet('Quick Add');
  sheet.getRange(1, 1, 1, 5)
    .setValues([['Name', 'Phone', 'Email (optional)', 'Date (yyyy-mm-dd)', 'Status']])
    .setFontWeight('bold')
    .setBackground('#4a86e8')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 5, 160);
  // Keep the date column as plain text so typed dates aren't silently
  // reformatted into a Date serial, which findDateLabel() wouldn't match.
  sheet.getRange(2, 4, 500, 1).setNumberFormat('@');
  sheet.getRange('A1').setNote(
    'For phone/in-person signups: fill in Name and Date (yyyy-mm-dd) on a ' +
    'new row (Phone/Email optional). It\'ll be claimed on the form and ' +
    'calendar automatically, and added as a row on the "Form Responses" ' +
    'tab too, so that stays a complete roster. Status will fill in with ' +
    '"Done" or an error message. Leave Status blank — do not edit it yourself.');
}

/** Creates the "Quick Cancel" tab on the private responses spreadsheet, for reopening a date someone had to back out of. */
function setupQuickCancelSheet(responsesSs) {
  const sheet = responsesSs.insertSheet('Quick Cancel');
  sheet.getRange(1, 1, 1, 2)
    .setValues([['Date (yyyy-mm-dd)', 'Status']])
    .setFontWeight('bold')
    .setBackground('#4a86e8')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 2, 220);
  // Keep the date column as plain text so typed dates aren't silently
  // reformatted into a Date serial, which findDateLabel() wouldn't match.
  sheet.getRange(2, 1, 500, 1).setNumberFormat('@');
  sheet.getRange('A1').setNote(
    'To reopen a date someone had to cancel: type the date (yyyy-mm-dd) ' +
    'on a new row. It clears the calendar square and puts that date back ' +
    'on the form automatically, and Status will fill in with "Reopened" ' +
    'or a message. Leave Status blank — do not edit it yourself.');
}

/** Finds one item response by its question title. */
function findResponse(responses, title) {
  const match = responses.find(r => r.getItem().getTitle() === title);
  return match ? match.getResponse() : '';
}

/** Emails the signer a confirmation with a .ics calendar invite attached. */
function sendConfirmationEmail(props, personKey, email, name, chosenDate, isoDate) {
  const displayName = getProp(props, personKey, 'DISPLAY_NAME') || 'them';
  // Fall back to the auto-generated pattern for anyone created before
  // FORM_TITLE started being stored (or a custom title was blank).
  const formTitle = getProp(props, personKey, 'FORM_TITLE') || (WARD_NAME + ' Meal Sign-Up for ' + displayName);
  const subject = 'You\'re signed up to bring a meal for ' + displayName + ' — ' + chosenDate;
  const body =
    'Hi ' + name + ',\n\n' +
    'You\'re confirmed to bring a meal for ' + displayName + ' on ' + chosenDate + '.\n\n' +
    'A calendar invite is attached — open it to add the date to your calendar.\n\n' +
    'Thank you!';

  const ics = buildIcsInvite('Meal for ' + displayName, body, isoDate);
  const icsBlob = Utilities.newBlob(ics, 'application/ics', 'meal-invite.ics');

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      attachments: [icsBlob],
      name: formTitle
    });
  } catch (err) {
    console.error('Failed to email ' + email + ': ' + err);
  }
}

/** Builds a .ics calendar invite for the given date, using MEAL_TIME/MEAL_DURATION_MINUTES. */
function buildIcsInvite(summary, description, isoDate) {
  const start = new Date(isoDate + 'T' + MEAL_TIME + ':00');
  const end = new Date(start.getTime() + MEAL_DURATION_MINUTES * 60000);
  const fmtUtc = d => Utilities.formatDate(d, 'Etc/UTC', "yyyyMMdd'T'HHmmss'Z'");

  // No ORGANIZER/ATTENDEE/METHOD:REQUEST — this is a one-way "here's
  // an event, add it if you want" invite, not an RSVP-tracked one, so
  // it doesn't depend on resolving the script owner's email.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relief Society Meals//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + Utilities.getUuid() + '@reliefsociety-meals',
    'DTSTAMP:' + fmtUtc(new Date()),
    'DTSTART:' + fmtUtc(start),
    'DTEND:' + fmtUtc(end),
    'SUMMARY:' + escapeIcsText(summary),
    'DESCRIPTION:' + escapeIcsText(description)
  ];
  if (MEAL_LOCATION) lines.push('LOCATION:' + escapeIcsText(MEAL_LOCATION));
  lines.push('STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

/** Escapes text for use in an .ics field per RFC 5545. */
function escapeIcsText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
