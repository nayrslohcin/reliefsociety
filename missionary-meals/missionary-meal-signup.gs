/**
 * MISSIONARY MEAL SIGN-UP — Google Apps Script
 *
 * What it does:
 *  - Creates a Google Form with one dropdown of available dates
 *    (every day between START_DATE and END_DATE except Mondays)
 *  - One person per day: when someone signs up, their date is
 *    removed from the form automatically
 *  - Responses (with phone numbers) go to a PRIVATE spreadsheet
 *    only you can see
 *  - A separate PUBLIC read-only "schedule" spreadsheet shows a real
 *    monthly calendar grid (month + year at top, weekday header row,
 *    one row per week, one column per day) with who signed up for
 *    each day (names only, no phone numbers), updated automatically
 *    on every signup — share that link with everyone
 *  - The person who just signed up gets a confirmation email with a
 *    .ics calendar invite attached, so they can add the meal date to
 *    their own calendar in one tap — the email question is optional,
 *    so anyone who'd rather not leave one just doesn't get that
 *  - The form closes itself for all of Sunday and reopens Sunday
 *    evening, so online sign-ups can't double-book a date someone
 *    already took on the paper sheet at church
 *  - Dates that have gone by are cleared off the form and marked
 *    "(past)" on the calendar automatically each night
 *  - When every date is taken, the form closes itself
 *
 * SETUP (one time, ~3 minutes):
 *  1. Go to https://script.google.com and click "New project"
 *  2. Delete the sample code and paste this entire file in
 *  3. Change START_DATE, END_DATE, and WARD_NAME below to your months
 *     and ward
 *  4. Click the "Save" icon, then select "createSignupForm" in the
 *     function dropdown at the top and click "Run"
 *  5. Approve the permissions prompt (it's your own script — Google
 *     shows a warning because it isn't a published app; click
 *     Advanced > Go to project)
 *  6. Open the "Execution log" — it prints three links:
 *       - the SIGN-UP form link to send to your congregation
 *       - the SCHEDULE link (read-only) so anyone can see who has
 *         signed up for which day
 *       - your private responses spreadsheet (includes phone numbers)
 *
 * The email question is optional. A form created before it became
 * optional keeps whatever it was set to until you run
 * makeEmailOptional() (extendSignupForm() runs it for you).
 *
 * THE SUNDAY PAUSE:
 * The form closes at midnight Saturday night, stays closed all of
 * Sunday showing PAUSED_MESSAGE, and reopens Sunday at 7 PM
 * (REOPEN_HOUR) — so nobody signs up online for a date that was just
 * claimed on the paper sheet at church. It runs on a trigger that
 * checks every 5 minutes, so each switch is accurate to within about
 * five minutes, and it puts the form back if something reopens it
 * mid-Sunday.
 *  - createSignupForm() turns it on by itself. On a form that
 *    ALREADY EXISTS, run setupSundayTrigger() once by hand.
 *  - Set the project's TIME ZONE first: Project Settings (the gear
 *    icon) > Time zone > Central Time – Chicago. If it's wrong, the
 *    form closes and reopens at the wrong hour. Run
 *    previewSundaySchedule() to check — it prints the time zone and
 *    what the script thinks today is, and changes nothing.
 *  - This only prevents double-booking if the paper names are typed
 *    into the "Quick Add" tab before 7 PM Sunday. Raise REOPEN_HOUR
 *    (21 = 9 PM) to allow more time for that.
 *  - If every date is taken, the form stays closed past 7 PM and goes
 *    back to saying so — it won't reopen onto an empty dropdown.
 *  - To turn it off: set SUNDAY_PAUSE = false, or delete the
 *    checkSundaySchedule trigger under the clock icon. While it's on,
 *    it owns whether the form is open, so closing the form by hand
 *    for some other reason won't stick — it reopens within 5 minutes
 *    as long as a date is still available.
 *
 * CLEARING OUT DATES THAT HAVE GONE BY:
 * Nothing removes a date from the sign-up dropdown just because it
 * has passed — without this, someone could still pick last Thursday.
 * pruneOldDates() takes past dates off the dropdown and marks their
 * calendar squares "(past)", leaving days someone actually signed up
 * for exactly as they are. It runs nightly between 1 and 2 AM.
 *  - createSignupForm() turns it on by itself. On a form that
 *    ALREADY EXISTS, run setupPruneTrigger() once by hand.
 *  - previewOldDates() is a DRY RUN: it lists what would be removed
 *    and kept, and changes nothing. Run it first.
 *  - If pruning leaves no open dates at all, the form closes with the
 *    same "all dates are filled" message it uses when the month fills
 *    up. Run extendSignupForm() with a new month to reopen it.
 *
 * To open up a new month, update START_DATE/END_DATE and run
 * extendSignupForm() instead — it adds the new dates to the SAME
 * form and schedule sheet, so the links you already shared keep
 * working. createSignupForm() refuses to run again as long as a form
 * already exists in the "Missionary Meals" folder (it just logs a
 * message and stops), so it's safe to click Run on the wrong function
 * by accident — nothing gets overwritten. To start completely over,
 * move or delete the files in that folder yourself first.
 *
 * For signups and cancellations that don't happen through the form
 * itself (phone calls, in-person), open the private responses
 * spreadsheet:
 *  - "Quick Add" tab: type in a Name + Date (yyyy-mm-dd) to claim a
 *    date — updates the calendar and dropdown, and adds a row to the
 *    "Form Responses" tab too, same as a real form submission would
 *  - "Quick Cancel" tab: type in a Date (yyyy-mm-dd) to reopen it for
 *    someone else, same as cancelSignup() below
 * Either way, a Status column fills in automatically once it's
 * processed ("Done"/"Reopened", or an error message).
 *
 * (The script-editor equivalent of "Quick Cancel": set CANCEL_DATE
 * below to a date and run cancelSignup().)
 *
 * TO TAKE AN OLD MONTH OFF THE SCHEDULE once it's finished and you
 * don't want it on the sheet any more: set REMOVE_MONTHS below to
 * that month (yyyy-mm) and run removeOldMonths(). Do NOT just delete
 * the rows yourself — the script remembers each date's row number on
 * the sheet, so deleting rows by hand shifts the months below it and
 * later signups land in the wrong squares. removeOldMonths() deletes
 * the rows and fixes those saved row numbers together.
 *
 * ALL FILES are placed in a Drive folder named "Missionary Meals"
 * (created automatically, reused on later runs). Do NOT share that
 * folder publicly — it contains the private responses sheet with
 * phone numbers. Only the schedule sheet is shared, read-only.
 *
 * OPTIONAL — TRIM THE SCRIPT'S PERMISSION LIST:
 * By default Apps Script's auto-detected scopes include some it
 * doesn't need (like showing sidebars/dialogs). You can pin the
 * scopes down to just what's actually used:
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
 *     "https://www.googleapis.com/auth/drive",
 *     "https://www.googleapis.com/auth/script.scriptapp",
 *     "https://www.googleapis.com/auth/script.send_mail"
 *   ]
 * }
 *
 *  3. Set "timeZone" to your time zone, save, and run again
 *     (you'll be asked to re-approve with this narrower list).
 * NOTE: this must be the full "drive" scope, not "drive.file" — the
 * script moves and shares files that were created by FormApp and
 * SpreadsheetApp (not by DriveApp itself), and it searches Drive by
 * folder name to reuse the "Missionary Meals" folder across runs.
 * drive.file only covers files an app created via the Drive API/UI
 * directly, so DriveApp.getFileById()/moveTo()/setSharing() on
 * these files fails with a permissions error under that scope.
 * script.send_mail is required for the confirmation email/calendar
 * invite sent to each person who leaves an email address when they
 * sign up.
 */

// Bump this on every deploy, then run healthCheck() in both projects
// to confirm they are running the same code. With copy/paste there is
// nothing that can enforce that, so this is the next best thing.
const SCRIPT_VERSION = '2026-09-22.1';

// ======== EDIT THESE ========
const START_DATE = '2026-08-01';   // yyyy-mm-dd
const END_DATE   = '2026-08-31';   // yyyy-mm-dd
const WARD_NAME = 'Plano 4th Ward';
const FORM_TITLE = WARD_NAME + ' Missionary Meal Sign-Up';
const FOLDER_NAME = 'Missionary Meals';
const DESCRIPTION =
  'Thank you for signing up to feed the missionaries! Each family has been ' +
  'asked to sign-up once every 4-6 weeks. When you choose a date below, ' +
  'it will disappear from the available list.';

// Calendar invite settings — used only for the .ics file emailed to
// whoever signs up, not shown anywhere else.
const MEAL_TIME = '17:00';        // 24-hour HH:mm, meal start time
const MEAL_DURATION_MINUTES = 60;
const MEAL_LOCATION = '';         // e.g. missionary apartment address; leave '' to omit

// Only used by cancelSignup() — set this to a date (yyyy-mm-dd) that
// someone had to cancel, then run cancelSignup(), so it reopens on
// the form for someone else to grab.
const CANCEL_DATE = '';           // yyyy-mm-dd, leave '' when not in use

// Only used by removeOldMonths() — set this to the finished month(s)
// you want taken off the schedule sheet, then run removeOldMonths().
// Do NOT delete those rows by hand (see that function's notes).
const REMOVE_MONTHS = '';         // e.g. '2026-08' or '2026-08,2026-09'
// Safety catch: removeOldMonths() refuses to remove the current month
// or a future one unless you flip this to true.
const REMOVE_MONTHS_FORCE = false;

// Sunday pause — the form closes for all of Sunday so online sign-ups
// can't double-book a date someone already claimed on the paper sheet
// being passed around at church, then reopens Sunday evening. Run
// setupSundayTrigger() once to start it (see the notes up top).
const SUNDAY_PAUSE = true;        // set false to stop pausing
const PAUSE_DAY = 0;              // 0 = Sun, 1 = Mon ... 6 = Sat
const REOPEN_HOUR = 19;           // 7 PM, 24-hour — when it reopens
const PAUSED_MESSAGE =
  'Online sign-ups are paused on Sundays while the paper sign-up sheet is ' +
  'passed around at church. The form reopens tonight at ' + formatHour(REOPEN_HOUR) +
  '. Thank you for feeding the missionaries!';
// ============================

const Q_NAME = 'Your name';
const Q_PHONE = 'Phone number';
const Q_EMAIL = 'Email address (optional — for your confirmation + calendar invite)';

// The single placeholder choice left on the dropdown when every date
// is taken, and the message shown on the closed form when that
// happens. Constants because the sign-up, month-removal, and Sunday
// pause paths all have to agree on them exactly.
const ALL_FILLED_CHOICE = '(All dates are filled)';
const FULL_MESSAGE = 'All dates are filled — thank you so much!';

function createSignupForm() {
  // Refuse to create a second form if one already exists in the
  // "Missionary Meals" folder — prevents accidentally overwriting an
  // existing form/schedule and orphaning their properties. To start
  // completely fresh, move or delete the existing files in that
  // folder yourself first, then run this again.
  const folder = getOrCreateFolder(FOLDER_NAME);
  const existingForm = findExistingFormFile(folder);
  if (existingForm) {
    Logger.log('A sign-up form already exists in the "' + FOLDER_NAME + '" folder — not creating a new one.');
    Logger.log('Existing form: ' + existingForm.getName() + '\n' + existingForm.getUrl());
    Logger.log('To open up a new month on it, update START_DATE/END_DATE and run extendSignupForm() instead.');
    Logger.log('To start over, move or delete the files in the "' + FOLDER_NAME + '" folder, then run createSignupForm() again.');
    return;
  }

  // Bail out before creating anything if the date range has no
  // sign-up-able days left — e.g. START_DATE/END_DATE were left on a
  // month that has already passed, since buildDateList() only keeps
  // today onward. Checked here, not after FormApp.create(), so a bad
  // range doesn't leave a half-made form behind in Drive.
  const dates = buildDateList();
  if (dates.length === 0) {
    throw new Error('No available dates between ' + START_DATE + ' and ' + END_DATE +
      ' — that range is entirely in the past, or every day in it is a Monday. ' +
      'Update START_DATE/END_DATE above to a current or upcoming month, then run createSignupForm() again.');
  }

  const form = FormApp.create(FORM_TITLE);
  form.setDescription(DESCRIPTION);
  form.setLimitOneResponsePerUser(false); // set true to limit 1 signup per Google account

  form.addTextItem().setTitle(Q_NAME).setRequired(true);
  form.addTextItem().setTitle(Q_PHONE).setRequired(true);
  // Optional: no email just means no confirmation/calendar invite.
  // The validation only kicks in when the box isn't left empty.
  form.addTextItem().setTitle(Q_EMAIL).setRequired(false)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  const dateItem = form.addListItem()
    .setTitle('Choose a date')
    .setRequired(true);
  dateItem.setChoiceValues(dates);

  // Private spreadsheet for full responses (includes phone numbers)
  const responsesSs = SpreadsheetApp.create(FORM_TITLE + ' — Responses (private)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSs.getId());
  setupQuickAddSheet(responsesSs);
  setupQuickCancelSheet(responsesSs);

  // Public read-only schedule spreadsheet, laid out as a real calendar
  // (month/year header, weekday columns, one row per week)
  const scheduleSs = SpreadsheetApp.create(FORM_TITLE + ' — Schedule');
  const startDate = new Date(START_DATE + 'T00:00:00');
  const endDate = new Date(END_DATE + 'T00:00:00');
  const blocks = buildCalendarBlocks(startDate, endDate);
  const dateMap = renderSchedule(scheduleSs, blocks);

  // Grey out any square that's already in the past (e.g. START_DATE
  // was set to earlier this month) — those never went in the dropdown
  // either, since buildDateList() only includes today onward
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  greyOutPastDates(scheduleSs.getSheetByName('Schedule'), dateMap, today);

  // Remember date -> cell mapping so onSignup can find the right box
  PropertiesService.getScriptProperties()
    .setProperty('SCHEDULE_MAP', JSON.stringify(dateMap));

  // Make the schedule viewable by anyone with the link (read-only)
  DriveApp.getFileById(scheduleSs.getId())
    .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Move everything into the "Missionary Meals" folder.
  // NOTE: the folder itself stays private — only the schedule file
  // above is shared.
  [form.getId(), responsesSs.getId(), scheduleSs.getId()].forEach(id =>
    DriveApp.getFileById(id).moveTo(folder));

  // Remember the form + schedule sheet so extendSignupForm() (and the
  // trigger) can find them again later, plus which calendar months
  // are already on the schedule so extendSignupForm() can't add the
  // same month twice
  PropertiesService.getScriptProperties()
    .setProperty('SCHEDULE_ID', scheduleSs.getId());
  PropertiesService.getScriptProperties()
    .setProperty('FORM_ID', form.getId());
  PropertiesService.getScriptProperties()
    .setProperty('RESPONSES_ID', responsesSs.getId());
  PropertiesService.getScriptProperties()
    .setProperty('ADDED_MONTHS', JSON.stringify(blocks.map(b => b.key)));

  // Remove any triggers left over from previous runs, then create ours
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Trigger: after each signup, remove the date + update the schedule
  ScriptApp.newTrigger('onSignup')
    .forForm(form)
    .onFormSubmit()
    .create();

  // Trigger: watches the "Quick Add" / "Quick Cancel" tabs on the
  // private responses spreadsheet for phone/in-person signups and
  // cancellations typed in directly, instead of through the form
  ScriptApp.newTrigger('onResponsesEdit')
    .forSpreadsheet(responsesSs)
    .onEdit()
    .create();

  // Trigger: closes the form for Sunday and reopens it that evening
  if (SUNDAY_PAUSE) setupSundayTrigger();

  // Trigger: nightly clear-out of dates that have gone by
  setupPruneTrigger();

  // Optional: add the schedule link to the form description
  form.setDescription(DESCRIPTION +
    '\n\n📅 You can view the current meal calendar by month here:\n' + scheduleSs.getUrl());

  Logger.log('SIGN-UP link (share with congregation):\n' + form.getPublishedUrl());
  Logger.log('SCHEDULE link (read-only, share with congregation):\n' + scheduleSs.getUrl());
  Logger.log('Private responses spreadsheet (for you only):\n' + responsesSs.getUrl());
  Logger.log('To sign someone up by phone/in person, use the "Quick Add" tab in that spreadsheet.');
  Logger.log('To reopen a date someone had to cancel, use the "Quick Cancel" tab in that same spreadsheet.');
  Logger.log('Form EDIT link (for you):\n' + form.getEditUrl());
}

/**
 * Extends the EXISTING form + schedule sheet created by
 * createSignupForm() with a new date range, instead of making a
 * fresh form. The sign-up link and schedule link stay exactly the
 * same — just update START_DATE/END_DATE above and run this.
 *
 * - Adds the new range's dates to the form's dropdown, keeping any
 *   still-open dates from before (minus ones now in the past)
 * - Re-opens the form if a previous batch of dates had filled it up
 * - Appends a new calendar block to the schedule sheet below the
 *   existing one(s) — past months are left in place as a record
 * - Refuses to add a calendar month that's already been added before
 *   (tracked in the ADDED_MONTHS script property), so re-running it
 *   with the same/overlapping START_DATE/END_DATE is a harmless no-op
 *   instead of creating a duplicate block or re-opening claimed dates
 *
 * Run createSignupForm() once first; after that, just run this each
 * time you want to open up a new month.
 */
function extendSignupForm() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty('FORM_ID');
  const scheduleId = props.getProperty('SCHEDULE_ID');
  if (!formId || !scheduleId) {
    throw new Error('No existing form found — run createSignupForm() first.');
  }

  const startDate = new Date(START_DATE + 'T00:00:00');
  const endDate = new Date(END_DATE + 'T00:00:00');
  const allBlocks = buildCalendarBlocks(startDate, endDate);

  // Drop any calendar month already added on a previous run, so this
  // function is safe to re-run with the same or overlapping dates
  const addedMonths = JSON.parse(props.getProperty('ADDED_MONTHS') || '[]');
  const skippedBlocks = allBlocks.filter(b => addedMonths.indexOf(b.key) !== -1);
  const newBlocks = allBlocks.filter(b => addedMonths.indexOf(b.key) === -1);

  if (skippedBlocks.length > 0) {
    Logger.log('Already added, skipping: ' + skippedBlocks.map(b => b.label).join(', '));
  }
  if (newBlocks.length === 0) {
    Logger.log('Nothing to do — every month in ' + START_DATE + ' to ' + END_DATE +
      ' has already been added. Change START_DATE/END_DATE to a new range.');
    return;
  }

  const form = FormApp.openById(formId);
  const scheduleSs = SpreadsheetApp.openById(scheduleId);

  // Bring a form made before the email question became optional up to
  // date while we're already touching it
  makeEmailOptional();

  // Keep still-open, still-future choices from before; drop the
  // "all filled" placeholder and anything now in the past
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keptChoices = openFutureChoices(listItem, today);

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
  if (merged.length === 0) {
    throw new Error('No available dates between ' + START_DATE + ' and ' + END_DATE +
      ' — that range is entirely in the past, or every day in it is a Monday. ' +
      'Update START_DATE/END_DATE above to a current or upcoming month, then run extendSignupForm() again.');
  }
  listItem.setChoiceValues(merged);

  // Re-open in case the last batch of dates filled up and the form
  // auto-closed itself. Done after the merged-choices check above, so
  // an empty range can't reopen a filled form onto a placeholder.
  form.setAcceptingResponses(true);
  if (inSundayPause(new Date())) {
    Logger.log('NOTE: the Sunday pause is on right now, so the form will close itself again ' +
      'within 5 minutes and reopen at ' + formatHour(REOPEN_HOUR) + ' tonight. The new dates are added either way.');
  }

  // Append the new calendar block(s) below whatever is already drawn
  const sheet = scheduleSs.getSheetByName('Schedule') || scheduleSs.getActiveSheet();
  const startRow = sheet.getLastRow() > 0 ? sheet.getLastRow() + 2 : 1;
  const newMap = renderSchedule(scheduleSs, newBlocks, startRow);

  // Merge the new date -> cell mapping into the existing one (keys
  // are full dates, so old and new months never collide)
  const mapJson = props.getProperty('SCHEDULE_MAP');
  const dateMap = mapJson ? JSON.parse(mapJson) : {};
  Object.assign(dateMap, newMap);
  props.setProperty('SCHEDULE_MAP', JSON.stringify(dateMap));

  // Grey out any square that's now in the past with nobody signed up
  // for it, across the WHOLE schedule (not just the new block) — this
  // is the natural moment to sweep, since it's when we're already
  // touching the sheet and re-checking "today"
  greyOutPastDates(sheet, dateMap, today);

  // Remember these months as added so a future run can't duplicate them
  props.setProperty('ADDED_MONTHS',
    JSON.stringify(addedMonths.concat(newBlocks.map(b => b.key))));

  Logger.log('Added: ' + newBlocks.map(b => b.label).join(', '));
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

/** True if a dropdown choice is a real date that has already gone by. */
function isPastChoice(value, today) {
  if (value === ALL_FILLED_CHOICE) return false;
  const d = parseDateLabel(value);
  return !!d && d < today;
}

/**
 * The dropdown choices someone could still actually sign up for:
 * everything except the "all filled" placeholder and dates already
 * past. Anything that doesn't parse as a date is KEPT — better to
 * leave a choice we don't understand than to quietly delete it.
 */
function openFutureChoices(listItem, today) {
  return listItem.getChoices()
    .map(c => c.getValue())
    .filter(v => v !== ALL_FILLED_CHOICE && !isPastChoice(v, today));
}

/**
 * Works out what has gone stale: dates that have passed but are
 * still sitting on the sign-up dropdown, and past calendar squares
 * nobody claimed. Shared by pruneOldDates() and previewOldDates() so
 * the dry run can't drift out of step with what actually happens.
 */
function findOldDates() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty('FORM_ID');
  const scheduleId = props.getProperty('SCHEDULE_ID');
  const mapJson = props.getProperty('SCHEDULE_MAP');
  if (!formId || !scheduleId || !mapJson) {
    throw new Error('No existing form/schedule found — run createSignupForm() first.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const form = FormApp.openById(formId);
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const choices = listItem.getChoices().map(c => c.getValue());
  const stale = choices.filter(v => isPastChoice(v, today));
  const keep = openFutureChoices(listItem, today);

  // Which past squares on the calendar are still showing "— available —"
  // vs. already have a name on them (green) that must be left alone
  const dateMap = JSON.parse(mapJson);
  const sheet = SpreadsheetApp.openById(scheduleId).getSheetByName('Schedule');
  const pastLabels = Object.keys(dateMap)
    .filter(label => new Date(dateMap[label].iso + 'T00:00:00') < today);
  const claimed = pastLabels.filter(label =>
    sheet.getRange(dateMap[label].row, dateMap[label].col).getBackground() === '#93c47d');

  return {
    form: form, listItem: listItem, sheet: sheet, dateMap: dateMap, today: today,
    stale: stale, keep: keep, pastLabels: pastLabels, claimed: claimed
  };
}

/**
 * Clears out dates that have gone by: takes them off the sign-up
 * dropdown so nobody can still pick last week, and marks their
 * calendar squares "(past)". Runs nightly on its own once
 * setupPruneTrigger() has been run — nothing else in this script
 * prunes the dropdown between months, so without it a date stays
 * sign-up-able forever.
 *
 * Squares someone actually signed up for are left exactly as they
 * are (greyOutPastDates skips them), so the calendar keeps its
 * record of who fed the missionaries when.
 *
 * Run previewOldDates() first to see what it would change.
 */
function pruneOldDates() {
  const state = findOldDates();

  if (state.stale.length === 0) {
    Logger.log('No past dates on the sign-up dropdown — nothing to remove.');
  } else if (state.keep.length > 0) {
    state.listItem.setChoiceValues(state.keep);
    Logger.log('Removed ' + state.stale.length + ' past date(s) from the sign-up dropdown:\n  ' +
      state.stale.join('\n  '));
    Logger.log('Still open for sign-up: ' + state.keep.length + ' date(s).');
  } else {
    // Nothing left to sign up for. Close it the same way claimDate()
    // does — same placeholder, same message — because
    // checkSundaySchedule() restores FULL_MESSAGE whenever the
    // dropdown is empty, and a different message here would just get
    // overwritten on its next run.
    state.listItem.setChoiceValues([ALL_FILLED_CHOICE]);
    state.form.setAcceptingResponses(false);
    state.form.setCustomClosedFormMessage(FULL_MESSAGE);
    Logger.log('Removed the last ' + state.stale.length + ' past date(s) — no open dates are left, ' +
      'so the form is closed for now. Run extendSignupForm() with a new month to reopen it.');
  }

  greyOutPastDates(state.sheet, state.dateMap, state.today);
  Logger.log('Past days on the calendar are marked "(past)"; days someone signed up for are untouched.');
}

/**
 * DRY RUN for pruneOldDates() — logs exactly what it would remove
 * and keep, and changes nothing. Safe to run any time.
 */
function previewOldDates() {
  const state = findOldDates();
  const tz = Session.getScriptTimeZone();

  Logger.log('DRY RUN — nothing is being changed.');
  Logger.log('Today is ' + Utilities.formatDate(state.today, tz, 'EEEE, MMMM d, yyyy') + '.');

  if (state.stale.length === 0) {
    Logger.log('SIGN-UP DROPDOWN: nothing to remove — no past dates are on it.');
  } else {
    Logger.log('SIGN-UP DROPDOWN: would REMOVE these ' + state.stale.length + ' past date(s):\n  ' +
      state.stale.join('\n  '));
  }
  Logger.log(state.keep.length > 0
    ? 'SIGN-UP DROPDOWN: would KEEP these ' + state.keep.length + ' date(s):\n  ' + state.keep.join('\n  ')
    : 'SIGN-UP DROPDOWN: nothing would be left, so the form would close until you add a new month.');

  const toGrey = state.pastLabels.length - state.claimed.length;
  Logger.log('CALENDAR: would mark ' + toGrey + ' past day(s) as "(past)". ' +
    state.claimed.length + ' past day(s) have someone signed up and would be left alone.');

  Logger.log('Run pruneOldDates() to actually apply this.');
}

/**
 * Prints what this project is wired up to, and changes nothing.
 *
 * Run it straight after pasting new code, in BOTH the TEST and the
 * live project. It answers the two questions that matter before you
 * trust a deploy: am I looking at the project I think I am (the file
 * names say TEST or they don't), and is everything still connected
 * (four triggers, a sensible number of open dates). See DEPLOY.md.
 */
function healthCheck() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('--- HEALTH CHECK ---');
  Logger.log('Script version: ' + SCRIPT_VERSION);
  Logger.log('Time zone: ' + Session.getScriptTimeZone() + '  (Sunday pause and nightly ' +
    'pruning both depend on this being right)');
  Logger.log('Configured range: ' + START_DATE + ' to ' + END_DATE + ' for ' + WARD_NAME);

  const formId = props.getProperty('FORM_ID');
  if (!formId) {
    Logger.log('NO FORM YET — createSignupForm() has not been run in this project.');
    return;
  }

  // Names, not just IDs: this is what tells you TEST from live at a glance
  Logger.log('Form:     ' + describeFile(formId));
  Logger.log('Schedule: ' + describeFile(props.getProperty('SCHEDULE_ID')));
  Logger.log('Responses:' + describeFile(props.getProperty('RESPONSES_ID')));

  const form = FormApp.openById(formId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const open = openFutureChoices(listItem, today);
  const stale = listItem.getChoices()
    .map(c => c.getValue())
    .filter(v => isPastChoice(v, today));

  Logger.log('Form is ' + (form.isAcceptingResponses() ? 'OPEN' : 'CLOSED') +
    (form.isAcceptingResponses() ? '' : ' — message: "' + form.getCustomClosedFormMessage() + '"'));
  Logger.log('Open dates: ' + open.length + (open.length ? '  (next: ' + open[0] + ')' : ''));
  if (stale.length > 0) {
    Logger.log('Past dates still on the dropdown: ' + stale.length + ' — run pruneOldDates().');
  }
  Logger.log('Months on the schedule: ' + (props.getProperty('ADDED_MONTHS') || '[]'));

  const handlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).sort();
  Logger.log('Triggers (' + handlers.length + '): ' + (handlers.join(', ') || 'NONE'));
  ['onSignup', 'onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates'].forEach(name => {
    if (handlers.indexOf(name) === -1) {
      Logger.log('  MISSING: ' + name + ' — sign-ups or the automatic jobs will not work.');
    }
  });

  Logger.log('Right now the Sunday pause says the form should be ' +
    (inSundayPause(new Date()) ? 'CLOSED.' : 'OPEN (unless every date is taken).'));
}

/** 'name (id)' for a Drive file, or a note if it can't be opened. */
function describeFile(id) {
  if (!id) return '(not set)';
  try {
    return DriveApp.getFileById(id).getName() + '  [' + id + ']';
  } catch (err) {
    return '(could not open ' + id + ': ' + err + ')';
  }
}

/**
 * Dumps every script property as JSON, and changes nothing.
 *
 * Run this in the live project and keep the output BEFORE any change
 * that touches the schedule — especially removeOldMonths(). The
 * SCHEDULE_MAP it prints is the only record of which calendar square
 * belongs to which date; it cannot be rebuilt from the sheet alone, and
 * if it goes wrong the script carries on writing names into the wrong
 * squares without any error.
 *
 * To restore: Project Settings > Script Properties, and paste a saved
 * value back into the property it came from.
 */
function exportScriptProperties() {
  const all = PropertiesService.getScriptProperties().getProperties();
  Logger.log('--- SCRIPT PROPERTIES BACKUP ---');
  Logger.log('Taken ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
    'EEEE, MMMM d, yyyy') + ', script version ' + SCRIPT_VERSION);
  Logger.log('Save this somewhere before changing anything to do with the schedule.');
  Object.keys(all).sort().forEach(key => Logger.log(key + ' = ' + all[key]));
}

/**
 * Starts (or restarts) the nightly clear-out of past dates. Run this
 * once by hand on a form that already exists — createSignupForm()
 * sets it up itself for a brand new one. Safe to re-run.
 *
 * It does NOT prune right now, so you can still run previewOldDates()
 * first; the trigger fires overnight.
 */
function setupPruneTrigger() {
  // Delete only OUR trigger, by name — never a blanket wipe, which
  // would take out onSignup/onResponsesEdit/checkSundaySchedule too
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'pruneOldDates')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pruneOldDates').timeBased().atHour(1).everyDays(1).create();
  Logger.log('Past dates will now be cleared off the form and calendar automatically, ' +
    'some time between 1 and 2 AM each night.');
  Logger.log('Nothing has been pruned yet — run previewOldDates() to see what is stale, then pruneOldDates().');
}

/**
 * Reopens a single date that someone had to back out of, by editing
 * the script: set CANCEL_DATE above to the date (yyyy-mm-dd) and run
 * this. (For most cancellations, typing the date into the "Quick
 * Cancel" tab on the private responses spreadsheet is easier — this
 * is the script-editor equivalent of that.)
 */
function cancelSignup() {
  if (!CANCEL_DATE) {
    throw new Error('Set CANCEL_DATE above to the date you want to reopen (yyyy-mm-dd), then run cancelSignup() again.');
  }

  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) {
    throw new Error('No existing form found — run createSignupForm() first.');
  }

  const label = findDateLabel(CANCEL_DATE);
  if (!label) {
    throw new Error('Could not find ' + CANCEL_DATE +
      ' on the schedule. Check CANCEL_DATE is in yyyy-mm-dd format and falls in a month that has already been added.');
  }

  const form = FormApp.openById(formId);
  const result = releaseDate(form, label);
  Logger.log(result || (label + ' is available again — back on the form for someone else to sign up.'));
}

/**
 * 19 -> '7 PM', 9 -> '9 AM'. Used so PAUSED_MESSAGE and the log lines
 * follow REOPEN_HOUR automatically instead of saying "7 PM" after you
 * change it. (Safe to call from a const up top — function
 * declarations are hoisted above them.)
 */
function formatHour(hour24) {
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  return (hour24 % 12 === 0 ? 12 : hour24 % 12) + ' ' + suffix;
}

/** True while the form should be paused for the paper sign-up sheet (Sunday before REOPEN_HOUR). */
function inSundayPause(now) {
  // getDay()/getHours() resolve against the Apps Script project's time
  // zone (Project Settings > gear icon), same as buildDateList() below
  // relies on — so that setting has to be right or this closes at the
  // wrong hour.
  return SUNDAY_PAUSE && now.getDay() === PAUSE_DAY && now.getHours() < REOPEN_HOUR;
}

/**
 * Runs every 5 minutes (see setupSundayTrigger) and keeps the form's
 * open/closed state matching the Sunday pause window.
 *
 * During the window: closed, showing PAUSED_MESSAGE — whatever else
 * had closed it, since "we're closed today for the paper sheet" is
 * the more useful thing to say on a Sunday.
 *
 * Outside it: open again, BUT only if the dropdown still has a real
 * date on it. If every date is taken, claimDate() closed the form on
 * purpose and it stays closed — reopening it would leave people able
 * to submit the ALL_FILLED_CHOICE placeholder, which onSignup() then
 * rejects to a log nobody reads, so they'd think they were signed up
 * when they weren't.
 */
function checkSundaySchedule() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) return; // createSignupForm() hasn't run yet
  const form = FormApp.openById(formId);

  if (inSundayPause(new Date())) {
    // Only write when it actually differs — this runs 288 times a day
    if (form.getCustomClosedFormMessage() !== PAUSED_MESSAGE) {
      form.setCustomClosedFormMessage(PAUSED_MESSAGE);
    }
    if (form.isAcceptingResponses()) form.setAcceptingResponses(false);
    return;
  }

  // Outside the window the sign-up logic owns the form's state again.
  // Past dates don't count as open — a dropdown holding only stale
  // dates would otherwise keep the form open with nothing to pick.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const openDates = openFutureChoices(listItem, today);

  if (openDates.length > 0) {
    if (!form.isAcceptingResponses()) form.setAcceptingResponses(true);
    return;
  }

  // Every date is taken: stay closed, and put back the message the
  // pause overwrote on Sunday
  if (form.getCustomClosedFormMessage() !== FULL_MESSAGE) {
    form.setCustomClosedFormMessage(FULL_MESSAGE);
  }
  if (form.isAcceptingResponses()) form.setAcceptingResponses(false);
}

/**
 * Starts (or restarts) the Sunday pause. Run this once by hand on a
 * form that already exists — createSignupForm() sets it up itself for
 * a brand new one. Safe to re-run.
 */
function setupSundayTrigger() {
  // Delete only OUR trigger, by name — a blanket
  // getProjectTriggers().forEach(deleteTrigger) here would also take
  // out onSignup and onResponsesEdit, leaving a form that accepts
  // sign-ups while nothing updates the calendar or the dropdown.
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkSundaySchedule')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkSundaySchedule').timeBased().everyMinutes(5).create();
  Logger.log('Sunday pause is on: the form closes at midnight Saturday night and reopens Sunday at ' +
    formatHour(REOPEN_HOUR) + '.');
  checkSundaySchedule(); // don't wait up to 5 minutes for the first run
}

/**
 * Prints what checkSundaySchedule() would do right now, without
 * touching the form — use it to confirm the project's time zone and
 * day/hour are what you expect. To test the close itself without
 * waiting for Sunday, set PAUSE_DAY above to today's number, run
 * checkSundaySchedule(), look at the live form, then set PAUSE_DAY
 * back to 0 and run it again.
 */
function previewSundaySchedule() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  Logger.log('Script time zone: ' + Session.getScriptTimeZone() +
    ' (set this under Project Settings — the gear icon)');
  Logger.log('The script thinks it is now: ' + days[now.getDay()] + ', ' + now.getHours() + ':00');
  Logger.log('Pausing on: ' + days[PAUSE_DAY] + ' until ' + formatHour(REOPEN_HOUR) +
    (SUNDAY_PAUSE ? '' : ' — but SUNDAY_PAUSE is false, so the pause is off'));
  Logger.log(inSundayPause(now)
    ? 'Right now: the form should be CLOSED for the paper sign-up sheet.'
    : 'Right now: the form should be OPEN (unless every date is already taken).');
}

/**
 * Removes one or more finished month blocks from the schedule sheet,
 * so it doesn't grow forever. Set REMOVE_MONTHS above to the month(s)
 * you want gone (yyyy-mm, comma-separated) and run this.
 *
 * DO NOT delete those rows by hand. The script remembers each date's
 * exact row/column on the sheet (the SCHEDULE_MAP script property),
 * so deleting rows above a month shifts every later month up and the
 * script would then write names into the wrong squares — silently.
 * This function deletes the rows AND repairs that saved map in the
 * same step, which is the part a manual delete can't do.
 *
 * What it does:
 *  - Deletes the whole block for each month named (title row, weekday
 *    header, week rows, and the blank separator row after it)
 *  - Shifts the saved row numbers of every month BELOW it back up to
 *    match, and drops the removed months' dates from the map
 *  - Removes any of those dates that were still on the form's dropdown
 *  - Forgets those months in ADDED_MONTHS, so extendSignupForm() could
 *    add them again later if you ever wanted them back
 *
 * The sign-up link and schedule link don't change, and the months you
 * keep — including who is signed up on them — are left exactly as they
 * are. Past signups stay listed on the "Form Responses" tab of the
 * private responses spreadsheet either way; this only touches the
 * public calendar.
 */
function removeOldMonths() {
  const props = PropertiesService.getScriptProperties();
  const scheduleId = props.getProperty('SCHEDULE_ID');
  const mapJson = props.getProperty('SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    throw new Error('No existing schedule found — run createSignupForm() first.');
  }

  const requested = REMOVE_MONTHS.split(',').map(s => s.trim()).filter(s => s);
  if (requested.length === 0) {
    throw new Error('Set REMOVE_MONTHS above to the month(s) you want removed (yyyy-mm, comma-separated), then run removeOldMonths() again.');
  }
  const malformed = requested.filter(k => !/^\d{4}-\d{2}$/.test(k));
  if (malformed.length > 0) {
    throw new Error('REMOVE_MONTHS must be month(s) in yyyy-mm form, e.g. "2026-08" — got: ' + malformed.join(', '));
  }

  // Guard against wiping out the month people are actively signing up
  // for. Flip REMOVE_MONTHS_FORCE to true only if you really mean it.
  const thisMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const notFinished = requested.filter(k => k >= thisMonth);
  if (notFinished.length > 0 && !REMOVE_MONTHS_FORCE) {
    throw new Error('Refusing to remove ' + notFinished.join(', ') +
      ' — that month is the current one or still in the future, and people may be signed up on it. ' +
      'Set REMOVE_MONTHS_FORCE = true above if you really want to remove it.');
  }

  const ss = SpreadsheetApp.openById(scheduleId);
  const sheet = ss.getSheetByName('Schedule') || ss.getActiveSheet();
  const blocks = findMonthBlocks(sheet);

  const targets = blocks.filter(b => requested.indexOf(b.key) !== -1);
  const missing = requested.filter(k => !blocks.some(b => b.key === k));
  if (missing.length > 0) {
    Logger.log('Not on the schedule, skipping: ' + missing.join(', '));
  }
  if (targets.length === 0) {
    Logger.log('Nothing to remove — the schedule sheet has: ' +
      (blocks.map(b => b.label).join(', ') || '(no month blocks found)'));
    return;
  }

  const dateMap = JSON.parse(mapJson);
  const removedKeys = targets.map(b => b.key);
  const removedLabels = Object.keys(dateMap)
    .filter(label => removedKeys.indexOf(dateMap[label].iso.slice(0, 7)) !== -1);

  // Delete bottom block first, so the earlier blocks' row numbers are
  // still correct when we get to them
  targets.slice()
    .sort((a, b) => b.startRow - a.startRow)
    .forEach(b => sheet.deleteRows(b.startRow, b.endRow - b.startRow + 1));

  // Repair the saved date -> cell map: drop the removed months, and
  // move every surviving square up by however many rows were deleted
  // above it, so it still points at its own day box
  const newMap = {};
  Object.keys(dateMap).forEach(label => {
    if (removedLabels.indexOf(label) !== -1) return;
    const ref = dateMap[label];
    const shift = targets.reduce(
      (n, b) => ref.row > b.endRow ? n + (b.endRow - b.startRow + 1) : n, 0);
    newMap[label] = { row: ref.row - shift, col: ref.col, iso: ref.iso };
  });
  props.setProperty('SCHEDULE_MAP', JSON.stringify(newMap));

  // Take the removed months' dates off the dropdown, in case any of
  // them were still open for sign-up
  const formId = props.getProperty('FORM_ID');
  if (formId && removedLabels.length > 0) {
    const form = FormApp.openById(formId);
    const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
    const kept = listItem.getChoices()
      .map(c => c.getValue())
      .filter(v => v !== ALL_FILLED_CHOICE && removedLabels.indexOf(v) === -1);
    if (kept.length > 0) {
      listItem.setChoiceValues(kept);
    } else {
      listItem.setChoiceValues([ALL_FILLED_CHOICE]);
      form.setAcceptingResponses(false);
      form.setCustomClosedFormMessage(FULL_MESSAGE);
      Logger.log('No open dates are left on the form, so it is closed for now — run extendSignupForm() with a new month to reopen it.');
    }
  }

  // Forget them, so extendSignupForm() would be allowed to draw them
  // again if you ever want that month back
  const addedMonths = JSON.parse(props.getProperty('ADDED_MONTHS') || '[]');
  props.setProperty('ADDED_MONTHS',
    JSON.stringify(addedMonths.filter(k => removedKeys.indexOf(k) === -1)));

  Logger.log('Removed from the schedule: ' + targets.map(b => b.label).join(', '));
  Logger.log('Still on the schedule: ' +
    (blocks.filter(b => removedKeys.indexOf(b.key) === -1).map(b => b.label).join(', ') || '(none)'));
  Logger.log('SIGN-UP and SCHEDULE links are unchanged.');
  Logger.log('Signups for the removed months are still on the "Form Responses" tab of the private responses spreadsheet.');
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Finds each month block already drawn on the schedule sheet, by
 * looking for the merged "MMMM yyyy" title rows renderSchedule()
 * writes in column A. Returns [{key, label, startRow, endRow}] in
 * sheet order, where endRow runs to just before the next block's
 * title — so removing a block takes its trailing blank separator row
 * with it and doesn't leave a gap behind.
 */
function findMonthBlocks(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];

  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  const blocks = [];
  colA.forEach((row, i) => {
    const key = monthTitleToKey(row[0]);
    if (key) {
      blocks.push({
        key: key,
        label: MONTH_NAMES[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4),
        startRow: i + 1
      });
    }
  });
  blocks.forEach((b, i) => {
    b.endRow = i + 1 < blocks.length ? blocks[i + 1].startRow - 1 : lastRow;
  });
  return blocks;
}

/**
 * Turns a month title cell into a 'yyyy-MM' key, or null if the cell
 * isn't a month title (a day square, a weekday header, a blank...).
 * Handles the value coming back as a Date, in case Sheets decided to
 * parse "August 2026" as one.
 */
function monthTitleToKey(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  const parts = String(value).trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const monthIndex = MONTH_NAMES.indexOf(parts[0]);
  if (monthIndex === -1 || !/^\d{4}$/.test(parts[1])) return null;
  return parts[1] + '-' + ('0' + (monthIndex + 1)).slice(-2);
}

/**
 * Releases dateLabel back to "available": removes their row from the
 * "Form Responses" roster, clears the schedule square, and — if the
 * date hasn't already passed — puts it back on the form's dropdown
 * (reopening the form if it had auto-closed). Shared by cancelSignup()
 * (script-driven) and handleQuickCancel() (the "Quick Cancel"
 * spreadsheet tab). Returns null on a normal reopen, or a message
 * describing what happened otherwise — an error, or a note that a
 * past date was only cleared, not reopened.
 */
function releaseDate(form, dateLabel) {
  const props = PropertiesService.getScriptProperties();
  const scheduleId = props.getProperty('SCHEDULE_ID');
  const mapJson = props.getProperty('SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    return 'SCHEDULE_ID/SCHEDULE_MAP not set — re-run createSignupForm() first.';
  }
  const dateMap = JSON.parse(mapJson);
  const cellRef = dateMap[dateLabel];
  if (!cellRef) {
    return 'Could not find "' + dateLabel + '" in the schedule calendar.';
  }

  // Remove their row from the "Form Responses" roster, since they're
  // no longer signed up for this date
  const responsesId = props.getProperty('RESPONSES_ID');
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
    .filter(v => v !== ALL_FILLED_CHOICE);
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

/** Find the folder if this script already made it, otherwise create it. */
function getOrCreateFolder(name) {
  const existing = DriveApp.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : DriveApp.createFolder(name);
}

/** Returns the first non-trashed Google Form file directly in the given folder, or null if there isn't one. */
function findExistingFormFile(folder) {
  const files = folder.getFilesByType(MimeType.GOOGLE_FORMS);
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed()) return file;
  }
  return null;
}

/** Every date from START_DATE to END_DATE, skipping Mondays and anything before today. */
function buildDateList() {
  const tz = Session.getScriptTimeZone();
  const start = new Date(START_DATE + 'T00:00:00');
  const end = new Date(END_DATE + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 1 && d >= today) { // 1 = Monday
      dates.push(Utilities.formatDate(d, tz, 'EEEE, MMMM d, yyyy'));
    }
  }
  return dates;
}

/**
 * Groups the START_DATE..END_DATE range into one block per calendar
 * month (usually just one), each broken into weeks of 7 days
 * (Sun-Sat). Days outside the sign-up range, or Mondays (no meal
 * needed), are marked so they render differently but still show up
 * as real calendar squares.
 */
function buildCalendarBlocks(startDate, endDate) {
  const tz = Session.getScriptTimeZone();
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
      const inRange = d >= startDate && d <= endDate;
      const isMonday = col === 1;
      let status;
      if (!inRange) status = 'n/a';
      else if (isMonday) status = 'closed';
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
        } else if (cell.status === 'closed') {
          rowValues.push(cell.day + '\n(no meal needed)');
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
        if (cell.status === 'closed') {
          cellRange.setBackground('#efefef').setFontColor('#999999');
        } else if (cell.status === 'n/a') {
          cellRange.setBackground('#f3f3f3').setFontColor('#cccccc');
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

/** Runs automatically on each form submission. */
function onSignup(e) {
  const form = e.source;
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const responses = e.response.getItemResponses();

  const chosenDate = responses
    .find(r => r.getItem().getId() === listItem.getId())
    .getResponse();
  const name = findResponse(responses, Q_NAME);
  const email = findEmailResponse(responses);

  const error = claimDate(form, chosenDate, name, email);
  if (error) console.error(error);
}

/**
 * Runs on every edit to the private responses spreadsheet. Dispatches
 * to the handler for whichever "Quick ..." tab was touched; ignores
 * edits everywhere else (e.g. the form's own "Form Responses" tab).
 */
function onResponsesEdit(e) {
  const sheetName = e.range.getSheet().getName();
  if (sheetName === 'Quick Add') handleQuickAdd(e);
  else if (sheetName === 'Quick Cancel') handleQuickCancel(e);
}

/**
 * Watches the "Quick Add" tab for phone/in-person signups typed in
 * directly (Name + Date filled in on a row not already marked
 * "Done"), and processes each one exactly like a real form submission.
 */
function handleQuickAdd(e) {
  const sheet = e.range.getSheet();
  const firstRow = Math.max(e.range.getRow(), 2); // skip the header row
  const lastRow = e.range.getLastRow();
  if (lastRow < 2) return;

  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) return; // createSignupForm() hasn't run yet

  const form = FormApp.openById(formId);
  const responsesSs = sheet.getParent();

  for (let row = firstRow; row <= lastRow; row++) {
    const [name, phone, email, dateVal, status] = sheet.getRange(row, 1, 1, 5).getValues()[0];
    if (status === 'Done' || !name || !dateVal) continue; // incomplete or already handled

    const label = findDateLabel(String(dateVal).trim());
    const statusCell = sheet.getRange(row, 5);
    if (!label) {
      statusCell.setValue('Could not match "' + dateVal + '" — use yyyy-mm-dd and make sure that month has been added.');
      continue;
    }

    const error = claimDate(form, label, name, email);
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
  sheet.appendRow([new Date(), name, phone, email, dateLabel]);
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
function handleQuickCancel(e) {
  const sheet = e.range.getSheet();
  const firstRow = Math.max(e.range.getRow(), 2); // skip the header row
  const lastRow = e.range.getLastRow();
  if (lastRow < 2) return;

  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) return; // createSignupForm() hasn't run yet

  const form = FormApp.openById(formId);

  for (let row = firstRow; row <= lastRow; row++) {
    const [dateVal, status] = sheet.getRange(row, 1, 1, 2).getValues()[0];
    if (status === 'Reopened' || !dateVal) continue; // empty or already handled

    const label = findDateLabel(String(dateVal).trim());
    const statusCell = sheet.getRange(row, 2);
    if (!label) {
      statusCell.setValue('Could not match "' + dateVal + '" — use yyyy-mm-dd and make sure that month has been added.');
      continue;
    }

    const result = releaseDate(form, label);
    statusCell.setValue(result || 'Reopened');
  }
}

/**
 * Claims dateLabel on the given form for name/email: removes it from
 * the dropdown (closing the form if that was the last one), marks
 * the schedule square, and emails a confirmation if an email was
 * given. Shared by onSignup() (real form submissions) and
 * handleQuickAdd() (phone/in-person signups typed into "Quick Add").
 * Returns an error message string on failure, or null on success —
 * callers decide how to surface that (log it, write it to a cell...).
 */
function claimDate(form, dateLabel, name, email) {
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const choices = listItem.getChoices().map(c => c.getValue());
  if (choices.indexOf(dateLabel) === -1) {
    return '"' + dateLabel + '" is not an open date on the form (already taken, or not a valid date).';
  }

  const props = PropertiesService.getScriptProperties();
  const scheduleId = props.getProperty('SCHEDULE_ID');
  const mapJson = props.getProperty('SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    return 'SCHEDULE_ID/SCHEDULE_MAP not set — re-run createSignupForm() to create the schedule sheet.';
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
    listItem.setChoiceValues([ALL_FILLED_CHOICE]);
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage(FULL_MESSAGE);
  }

  // 2) Write the name into the right day-square on the public calendar
  const sheet = SpreadsheetApp.openById(scheduleId).getSheetByName('Schedule');
  const cell = sheet.getRange(cellRef.row, cellRef.col);
  // Cell text is "day number\nstatus" — keep the day number, replace
  // only the status/name line so the square still looks right.
  const dayNumber = cell.getValue().toString().split('\n')[0];
  const cellText = dayNumber + '\n' + name;

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
  // — the email question is optional, and "Quick Add" rows often skip it
  const address = String(email || '').trim();
  if (address) sendConfirmationEmail(address, name, dateLabel, cellRef.iso);

  return null;
}

/** Looks up the dateLabel (e.g. 'Tuesday, September 1, 2026') whose iso date matches isoDate, or null if none does. */
function findDateLabel(isoDate) {
  const mapJson = PropertiesService.getScriptProperties().getProperty('SCHEDULE_MAP');
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

/**
 * Pulls the email out of a submission. Matched on any question
 * mentioning "email" rather than on Q_EMAIL exactly, so a form built
 * before that question was reworded still works. Returns '' when the
 * question was left blank — it's optional — which callers treat as
 * "no confirmation email for this one".
 */
function findEmailResponse(responses) {
  const match = responses.find(r => /email/i.test(r.getItem().getTitle()));
  return match ? String(match.getResponse()).trim() : '';
}

/**
 * Makes the email question optional (and reworded to say so) on the
 * form that already exists, for forms created back when it was
 * required. Safe to re-run — it's a no-op once the question is
 * already optional. extendSignupForm() calls this, so opening up a
 * new month brings an older form along too.
 */
function makeEmailOptional() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) {
    throw new Error('No existing form found — run createSignupForm() first.');
  }
  const form = FormApp.openById(formId);
  const item = form.getItems(FormApp.ItemType.TEXT)
    .find(i => /email/i.test(i.getTitle()));
  if (!item) {
    Logger.log('No email question on the form — nothing to change.');
    return;
  }
  const textItem = item.asTextItem();
  if (!textItem.isRequired() && textItem.getTitle() === Q_EMAIL) {
    Logger.log('Email question is already optional.');
    return;
  }
  textItem.setTitle(Q_EMAIL).setRequired(false);
  Logger.log('Email question is now optional.');
}

/** Emails the signer a confirmation with a .ics calendar invite attached. */
function sendConfirmationEmail(email, name, chosenDate, isoDate) {
  const subject = 'You\'re signed up to feed the missionaries — ' + chosenDate;
  const body =
    'Hi ' + name + ',\n\n' +
    'You\'re confirmed to feed the missionaries on ' + chosenDate + '.\n\n' +
    'A calendar invite is attached — open it to add the date to your calendar.\n\n' +
    'Thank you!';

  const ics = buildIcsInvite('Missionary Dinner', body, isoDate);
  const icsBlob = Utilities.newBlob(ics, 'application/ics', 'missionary-meal-invite.ics');

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      attachments: [icsBlob],
      name: FORM_TITLE
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
    'PRODID:-//Missionary Meals//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + Utilities.getUuid() + '@missionary-meals',
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
