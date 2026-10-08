// koldsleep Lying Contest
// Google Apps Script
//
// Script Properties:
// SPREADSHEET_ID
// SECRET (same as server GOOGLE_SCRIPT_SECRET)

const HEADERS = [
  'id',
  'created_at',
  'lie_text',
  'liar_name',
  'contact',
  'phone',
  'email',
  'consent',
  'public'
];

const DEADLINE = '2026-10-26T00:00:00+09:00';


// ----------------------------------------
// 1. SHEET SETUP
// ----------------------------------------

function setupSheet() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);

    const s = sheet_();

    s.setFrozenRows(1);

    s.getRange('B:B')
      .setNumberFormat('yyyy-mm-dd hh:mm:ss');

    s.getRange('E:G')
      .setNumberFormat('@');

    backfillContacts_(s);

    SpreadsheetApp.flush();

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}


// ----------------------------------------
// 2. SHEET ACCESS / MIGRATION
// ----------------------------------------

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) throw Error('Missing SPREADSHEET_ID');

  const ss = SpreadsheetApp.openById(id);
  let s = ss.getSheetByName('lies');
  if (!s) s = ss.insertSheet('lies');

  // A new sheet needs nine header columns.
  if (s.getLastRow() === 0) {
    if (s.getMaxColumns() < 9) s.insertColumnsAfter(s.getMaxColumns(), 9 - s.getMaxColumns());
    s.getRange(1, 1, 1, 9).setValues([HEADERS]);
    return s;
  }

  // Inspect the old layout before inserting anything, to preserve entries.
  const width = Math.min(9, s.getMaxColumns());
  const current = s.getRange(1, 1, 1, width).getValues()[0].map(String);
  const legacy = ['id', 'created_at', 'lie_text', 'liar_name', 'contact', 'consent', 'public'];
  const hasLegacyHeaders = legacy.every((name, i) => current[i] === name);
  const unusedTrailingHeaders = current.slice(7).every(value => !value);

  if (hasLegacyHeaders && unusedTrailingHeaders) {
    // The old F/G values (consent/public) move to H/I in the same rows.
    s.insertColumnsAfter(5, 2);
    s.getRange(1, 1, 1, 9).setValues([HEADERS]);
    return s;
  }

  if (HEADERS.some((name, i) => current[i] !== name)) {
    throw Error('lies header mismatch: make a backup and inspect the first row');
  }
  return s;
}


// ----------------------------------------
// ----------------------------------------
// 3. CONTACT PARSER
// ----------------------------------------

function parseContact_(input) {
  const original = String(input ?? '').trim();

  if (!original) {
    return {
      ok: false,
      phone: '',
      email: '',
      original
    };
  }

  // Extract emails.
  const emailRegex =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  const emailMatches =
    original.match(emailRegex) || [];

  const emails = [
    ...new Set(
      emailMatches.map(value => value.toLowerCase())
    )
  ];

  // Remove emails before processing phone numbers.
  let remainder = original.replace(
    emailRegex,
    ' '
  );

  // Korean mobile numbers, including +82 10...
  const phoneRegex =
    /(?:\+82[\s.-]?\(?0?\)?[\s.-]?|0)1[016789][\s().-]?\d{3,4}[\s.-]?\d{4}/g;

  const phoneMatches =
    remainder.match(phoneRegex) || [];

  const phones = [];

  for (const match of phoneMatches) {
    let digits = match.replace(/\D/g, '');

    if (digits.startsWith('82')) {
      digits = '0' + digits.slice(2);
    }

    if (!/^01[016789]\d{7,8}$/.test(digits)) {
      return {
        ok: false,
        phone: '',
        email: '',
        original
      };
    }

    const formatted =
      digits.length === 11
        ? digits.replace(
            /^(\d{3})(\d{4})(\d{4})$/,
            '$1-$2-$3'
          )
        : digits.replace(
            /^(\d{3})(\d{3})(\d{4})$/,
            '$1-$2-$3'
          );

    if (!phones.includes(formatted)) {
      phones.push(formatted);
    }
  }

  remainder = remainder.replace(
    phoneRegex,
    ' '
  );

  // Remove optional field labels and separators.
  remainder = remainder
    .replace(
      /휴대전화번호|휴대전화|휴대폰번호|휴대폰|전화번호|전화|이메일주소|이메일|메일주소|메일|contact|mobile|phone|email|e-mail/gi,
      ' '
    )
    .replace(/[\s,;/|:()[\]{}<>·，、]+/g, '')
    .trim();

  // Reject unrecognized remaining input.
  if (remainder !== '') {
    return {
      ok: false,
      phone: '',
      email: '',
      original
    };
  }

  if (phones.length === 0 && emails.length === 0) {
    return {
      ok: false,
      phone: '',
      email: '',
      original
    };
  }

  return {
    ok: true,
    phone: phones.join(', '),
    email: emails.join(', '),
    original
  };
}


// ----------------------------------------
// 4. EXISTING DATA BACKFILL
// ----------------------------------------

function backfillContacts_(s) {
  const lastRow = s.getLastRow();

  if (lastRow < 2) return;

  const values = s.getRange(
    2,
    5,
    lastRow - 1,
    3
  ).getValues();

  const richUpdates = [];

  values.forEach((row, index) => {
    const original = String(row[0] ?? '');

    const existingPhone = String(row[1] ?? '');
    const existingEmail = String(row[2] ?? '');

    if (!original) return;

    if (existingPhone || existingEmail) return;

    const parsed = parseContact_(original);

    // Do not alter legacy contacts that cannot be parsed.
    if (!parsed.ok) return;

    richUpdates.push({
      row: index + 2,
      phone: parsed.phone,
      email: parsed.email
    });
  });

  richUpdates.forEach(item => {
    const rich = [item.phone, item.email].map(
      value => SpreadsheetApp.newRichTextValue()
        .setText(value)
        .build()
    );

    s.getRange(item.row, 6, 1, 2)
      .setRichTextValues([rich]);
  });
}


// ----------------------------------------
// 5. GET
// ----------------------------------------

function doGet() {
  return json_({
    ok: true,
    service: 'koldsleep-lying-contest'
  });
}


// ----------------------------------------
// 6. POST
// ----------------------------------------

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const d = JSON.parse(e.postData.contents);

    const secret = PropertiesService
      .getScriptProperties()
      .getProperty('SECRET');

    if (!secret || d.secret !== secret) {
      return json_({
        ok: false,
        error: 'unauthorized'
      });
    }

    lock.waitLock(20000);

    const s = sheet_();

    // RANDOM PUBLIC LIE
    if (d.action === 'random') {
      const last = s.getLastRow();

      const rows = last > 1
        ? s.getRange(
            2,
            3,
            last - 1,
            7
          ).getValues()
        : [];

      // C:I => lie_text at index 0, public at index 6.
      const lies = rows
        .filter(row =>
          row[6] === true ||
          row[6] === 'TRUE'
        )
        .map(row => String(row[0]));

      return json_({
        ok: true,
        lie_text: lies.length
          ? lies[Math.floor(Math.random() * lies.length)]
          : ''
      });
    }

    if (d.action !== 'submit') {
      return json_({
        ok: false,
        error: 'invalid action'
      });
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id || '') ||
      d.consent !== true
    ) {
      return json_({
        ok: false,
        error: 'invalid submission'
      });
    }

    const values = [
      'lie_text',
      'liar_name',
      'contact'
    ].map(key =>
      typeof d[key] === 'string'
        ? d[key].trim()
        : ''
    );

    if (
      values.some(value =>
        !value ||
        value.length > 49000
      )
    ) {
      return json_({
        ok: false,
        error: 'invalid fields'
      });
    }

    const contact = parseContact_(values[2]);

    if (!contact.ok) {
      return json_({
        ok: false,
        error: 'invalid contact'
      });
    }

    // Prevent duplicate submissions with the same ID.
    const existing = s.getLastRow() > 1
      ? s.getRange(
          2,
          1,
          s.getLastRow() - 1,
          1
        )
          .createTextFinder(d.id)
          .matchEntireCell(true)
          .findNext()
      : null;

    if (existing) {
      return json_({
        ok: true,
        id: d.id
      });
    }

    // Submission deadline.
    if (
      Date.now() >= Date.parse(DEADLINE)
    ) {
      return json_({
        ok: false,
        error: 'closed'
      });
    }

    const row = s.getLastRow() + 1;

    // Set all cells to text before writing.
    s.getRange(row, 1, 1, 9)
      .setNumberFormat('@');

    // RichText prevents formula interpretation.
    const textValues = [
      d.id,
      '',
      values[0],
      values[1],
      contact.original,
      contact.phone,
      contact.email,
      '',
      ''
    ].map(value =>
      SpreadsheetApp.newRichTextValue()
        .setText(value)
        .build()
    );

    s.getRange(row, 1, 1, 9)
      .setRichTextValues([textValues]);

    s.getRange(row, 2)
      .setValue(new Date())
      .setNumberFormat('yyyy-mm-dd hh:mm:ss');

    // Consent
    s.getRange(row, 8)
      .setValue(true);

    // Public display is OFF by default.
    s.getRange(row, 9)
      .insertCheckboxes()
      .setValue(false);

    SpreadsheetApp.flush();

    return json_({
      ok: true,
      id: d.id
    });

  } catch (err) {
    console.error(err);

    return json_({
      ok: false,
      error: 'storage error'
    });

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}


// ----------------------------------------
// 7. JSON RESPONSE
// ----------------------------------------

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}