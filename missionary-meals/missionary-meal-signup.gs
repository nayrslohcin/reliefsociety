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
 *  - A separate PUBLIC read-only "schedule" spreadsheet shows each
 *    date and who signed up (names only, no phone numbers), updated
 *    automatically on every signup — share that link with everyone
 *  - When every date is taken, the form closes itself
 *
 * SETUP (one time, ~3 minutes):
 *  1. Go to https://script.google.com and click "New project"
 *  2. Delete the sample code and paste this entire file in
 *  3. Change START_DATE and END_DATE below to your months
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
 * To run it again for a new month, just update the dates and
 * run createSignupForm again — it makes a fresh form each time.
 *
 * ALL FILES are placed in a Drive folder named "Missionary Meals"
 * (created automatically, reused on later runs). Do NOT share that
 * folder publicly — it contains the private responses sheet with
 * phone numbers. Only the schedule sheet is shared, read-only.
 *
 * OPTIONAL — LIMIT THE SCRIPT'S DRIVE ACCESS:
 * By default Apps Script asks for full Drive access. To restrict it
 * to ONLY files this script creates:
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
 *     "https://www.googleapis.com/auth/script.scriptapp"
 *   ]
 * }
 *
 *  3. Set "timeZone" to your time zone, save, and run again
 *     (you'll be asked to re-approve with the narrower permissions).
 * With drive.file, the script cannot see or modify anything in your
 * Drive except the files and folder it created itself.
 */

// ======== EDIT THESE ========
const START_DATE = '2026-09-01';   // yyyy-mm-dd
const END_DATE   = '2026-09-30';   // yyyy-mm-dd
const FORM_TITLE = 'Missionary Meal Sign-Up';
const FOLDER_NAME = 'Missionary Meals';
const DESCRIPTION =
  'Thank you for signing up to feed the missionaries! ' +
  'Choose an available date below. Each date can only be taken once — ' +
  'dates disappear from the list as they are claimed.';
// ============================

function createSignupForm() {
  const form = FormApp.create(FORM_TITLE);
  form.setDescription(DESCRIPTION);
  form.setLimitOneResponsePerUser(false); // set true to limit 1 signup per Google account

  form.addTextItem().setTitle('Your name').setRequired(true);
  form.addTextItem().setTitle('Phone number (in case plans change)').setRequired(true);

  const dates = buildDateList();
  const dateItem = form.addListItem()
    .setTitle('Choose a date')
    .setRequired(true);
  dateItem.setChoiceValues(dates);

  // Private spreadsheet for full responses (includes phone numbers)
  const responsesSs = SpreadsheetApp.create(FORM_TITLE + ' — Responses (private)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSs.getId());

  // Public read-only schedule spreadsheet (names only)
  const scheduleSs = SpreadsheetApp.create(FORM_TITLE + ' — Schedule');
  const sheet = scheduleSs.getActiveSheet();
  sheet.setName('Schedule');
  sheet.getRange('A1:B1').setValues([['Date', 'Who\'s bringing dinner']])
       .setFontWeight('bold');
  // Force plain text so Sheets doesn't convert dates into date cells
  // (that conversion is what breaks the lookup when updating names)
  sheet.getRange(2, 1, dates.length, 2).setNumberFormat('@');
  sheet.getRange(2, 1, dates.length, 2)
       .setValues(dates.map(d => [d, '— available —']));
  sheet.setColumnWidth(1, 220).setColumnWidth(2, 220);
  sheet.setFrozenRows(1);

  // Make the schedule viewable by anyone with the link (read-only)
  DriveApp.getFileById(scheduleSs.getId())
    .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Move everything into the "Missionary Meals" folder.
  // NOTE: the folder itself stays private — only the schedule file
  // above is shared.
  const folder = getOrCreateFolder(FOLDER_NAME);
  [form.getId(), responsesSs.getId(), scheduleSs.getId()].forEach(id =>
    DriveApp.getFileById(id).moveTo(folder));

  // Remember the schedule sheet so the trigger can update it
  PropertiesService.getScriptProperties()
    .setProperty('SCHEDULE_ID', scheduleSs.getId());

  // Remove any triggers left over from previous runs, then create ours
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Trigger: after each signup, remove the date + update the schedule
  ScriptApp.newTrigger('onSignup')
    .forForm(form)
    .onFormSubmit()
    .create();

  // Optional: add the schedule link to the form description
  form.setDescription(DESCRIPTION +
    '\n\nSee who has already signed up: ' + scheduleSs.getUrl());

  Logger.log('SIGN-UP link (share with congregation):\n' + form.getPublishedUrl());
  Logger.log('SCHEDULE link (read-only, share with congregation):\n' + scheduleSs.getUrl());
  Logger.log('Private responses spreadsheet (for you only):\n' + responsesSs.getUrl());
  Logger.log('Form EDIT link (for you):\n' + form.getEditUrl());
}

/** Find the folder if this script already made it, otherwise create it. */
function getOrCreateFolder(name) {
  const existing = DriveApp.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : DriveApp.createFolder(name);
}

/** Every date from START_DATE to END_DATE, skipping Mondays. */
function buildDateList() {
  const tz = Session.getScriptTimeZone();
  const start = new Date(START_DATE + 'T00:00:00');
  const end = new Date(END_DATE + 'T00:00:00');
  const dates = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 1) { // 1 = Monday
      dates.push(Utilities.formatDate(d, tz, 'EEEE, MMMM d, yyyy'));
    }
  }
  return dates;
}

/** Runs automatically on each submission. */
function onSignup(e) {
  const form = e.source;
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const responses = e.response.getItemResponses();

  const chosenDate = responses
    .find(r => r.getItem().getId() === listItem.getId())
    .getResponse();
  const name = responses[0].getResponse(); // first question = name

  // 1) Remove the taken date from the form
  const remaining = listItem.getChoices()
    .map(c => c.getValue())
    .filter(v => v !== chosenDate);

  if (remaining.length > 0) {
    listItem.setChoiceValues(remaining);
  } else {
    listItem.setChoiceValues(['(All dates are filled)']);
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('All dates are filled — thank you so much!');
  }

  // 2) Write the name into the public schedule
  const scheduleId = PropertiesService.getScriptProperties()
    .getProperty('SCHEDULE_ID');
  if (!scheduleId) {
    console.error('SCHEDULE_ID not set — re-run createSignupForm to create the schedule sheet.');
    return;
  }
  const sheet = SpreadsheetApp.openById(scheduleId).getSheetByName('Schedule');
  // Use display values so we compare text-to-text even if Sheets
  // converted a cell to a date behind the scenes
  const dateCol = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  let found = false;
  for (let i = 0; i < dateCol.length; i++) {
    if (dateCol[i][0].trim() === chosenDate.trim()) {
      sheet.getRange(i + 2, 2).setValue(name);
      found = true;
      break;
    }
  }
  if (!found) {
    console.error('Could not find "' + chosenDate + '" in the schedule sheet.');
  }
}
