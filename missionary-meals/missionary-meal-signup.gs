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
 *    their own calendar in one tap
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
 * To run it again for a new month, just update the dates and
 * run createSignupForm again — it makes a fresh form each time.
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
 * invite sent to each person after they sign up.
 */

// ======== EDIT THESE ========
const START_DATE = '2026-09-01';   // yyyy-mm-dd
const END_DATE   = '2026-09-30';   // yyyy-mm-dd
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
// ============================

const Q_NAME = 'Your name';
const Q_PHONE = 'Phone number (in case plans change)';
const Q_EMAIL = 'Email address (for your confirmation + calendar invite)';

function createSignupForm() {
  const form = FormApp.create(FORM_TITLE);
  form.setDescription(DESCRIPTION);
  form.setLimitOneResponsePerUser(false); // set true to limit 1 signup per Google account

  form.addTextItem().setTitle(Q_NAME).setRequired(true);
  form.addTextItem().setTitle(Q_PHONE).setRequired(true);
  form.addTextItem().setTitle(Q_EMAIL).setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  const dates = buildDateList();
  const dateItem = form.addListItem()
    .setTitle('Choose a date')
    .setRequired(true);
  dateItem.setChoiceValues(dates);

  // Private spreadsheet for full responses (includes phone numbers)
  const responsesSs = SpreadsheetApp.create(FORM_TITLE + ' — Responses (private)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSs.getId());

  // Public read-only schedule spreadsheet, laid out as a real calendar
  // (month/year header, weekday columns, one row per week)
  const scheduleSs = SpreadsheetApp.create(FORM_TITLE + ' — Schedule');
  const startDate = new Date(START_DATE + 'T00:00:00');
  const endDate = new Date(END_DATE + 'T00:00:00');
  const blocks = buildCalendarBlocks(startDate, endDate);
  const dateMap = renderSchedule(scheduleSs, blocks);

  // Remember date -> cell mapping so onSignup can find the right box
  PropertiesService.getScriptProperties()
    .setProperty('SCHEDULE_MAP', JSON.stringify(dateMap));

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
    '\n\n📅 You can view the current meal calendar by month here:\n' + scheduleSs.getUrl());

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
 */
function renderSchedule(scheduleSs, blocks) {
  const sheet = scheduleSs.getActiveSheet();
  sheet.setName('Schedule');
  const HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateMap = {};
  let row = 1;

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

/** Runs automatically on each submission. */
function onSignup(e) {
  const form = e.source;
  const listItem = form.getItems(FormApp.ItemType.LIST)[0].asListItem();
  const responses = e.response.getItemResponses();

  const chosenDate = responses
    .find(r => r.getItem().getId() === listItem.getId())
    .getResponse();
  const name = findResponse(responses, Q_NAME);
  const email = findResponse(responses, Q_EMAIL);

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

  // 2) Write the name into the right day-square on the public calendar
  const props = PropertiesService.getScriptProperties();
  const scheduleId = props.getProperty('SCHEDULE_ID');
  const mapJson = props.getProperty('SCHEDULE_MAP');
  if (!scheduleId || !mapJson) {
    console.error('SCHEDULE_ID/SCHEDULE_MAP not set — re-run createSignupForm to create the schedule sheet.');
    return;
  }
  const dateMap = JSON.parse(mapJson);
  const cellRef = dateMap[chosenDate.trim()];
  if (!cellRef) {
    console.error('Could not find "' + chosenDate + '" in the schedule calendar.');
    return;
  }

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

  // 3) Email the signer a confirmation + calendar invite
  sendConfirmationEmail(email, name, chosenDate, cellRef.iso);
}

/** Finds one item response by its question title. */
function findResponse(responses, title) {
  const match = responses.find(r => r.getItem().getTitle() === title);
  return match ? match.getResponse() : '';
}

/** Emails the signer a confirmation with a .ics calendar invite attached. */
function sendConfirmationEmail(email, name, chosenDate, isoDate) {
  const subject = 'You\'re signed up to feed the missionaries — ' + chosenDate;
  const body =
    'Hi ' + name + ',\n\n' +
    'You\'re confirmed to bring dinner for the missionaries on ' + chosenDate + '.\n\n' +
    'A calendar invite is attached — open it to add the date to your calendar.\n\n' +
    'If your plans change, please let us know as soon as possible so we can ' +
    'find someone else to cover that day.\n\n' +
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
