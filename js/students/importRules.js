// ==========================================================================
// importRules.js - מקובץ תלמידים לרשימת חשבונות
// ==========================================================================
// הכללים זהים לאלה של מערכת האלקטרוניקה, כדי שתלמיד/ה ייכנס/תיכנס לשתיהן
// באותה דרך:
//   שם משתמש = שם פרטי + 3 הספרות האחרונות של ת.ז
//   סיסמה     = תאריך הלידה בצורה DDMMYY
// קובץ שכבר כולל עמודות "שם משתמש" ו"סיסמה" - משתמשים בהן כמו שהן.
//
// מספר תעודת הזהות משמש רק לחישוב שם המשתמש, ואינו נשלח לשרת ואינו נשמר.

const ALIASES = {
  firstName: ['שם פרטי', 'פרטי'],
  lastName: ['שם משפחה', 'משפחה'],
  fullName: ['שם מלא', 'שם התלמיד', 'שם תלמיד', 'שם'],
  idNumber: ['ת.ז', 'תז', 'תעודת זהות', 'מספר זהות'],
  dob: ['תאריך לידה', 'ת. לידה', 'ת.לידה'],
  grade: ['כיתה', 'שכבה', 'כיתה ומקבילה'],
  username: ['שם משתמש', 'משתמש'],
  password: ['סיסמה', 'סיסמא'],
};

export const LABELS = {
  firstName: 'שם פרטי', lastName: 'שם משפחה', fullName: 'שם מלא', idNumber: 'ת.ז',
  dob: 'תאריך לידה', grade: 'כיתה', username: 'שם משתמש', password: 'סיסמה',
};

const norm = (h) => String(h ?? '').replace(/["'״׳.]/g, '').replace(/\s+/g, ' ').trim();

/** "ט'1" -> "ט1" ; "ט' 2" -> "ט2". המקבילה נשמרת - היא שימושית בלוח הכיתה. */
export function normalizeGrade(g) {
  return String(g ?? '').replace(/["'״׳]/g, '').replace(/\s+/g, '').trim();
}

/** מיפוי עמודות לפי שורת כותרת. התאמה מדויקת קודם, ואז "מתחיל ב-". */
function mapHeaders(headerRow) {
  const headers = headerRow.map(norm);
  const map = {};
  const used = new Set();
  // הסדר חשוב: "שם" לבדו הוא כינוי של שם מלא, ואסור שיבלע את "שם פרטי"
  for (const pass of ['exact', 'prefix']) {
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (map[field] !== undefined) continue;
      const wanted = aliases.map(norm);
      const idx = headers.findIndex((h, i) => !used.has(i) && h && (pass === 'exact'
        ? wanted.includes(h)
        : wanted.some(a => a.length > 1 && h.startsWith(a))));
      if (idx >= 0) { map[field] = idx; used.add(idx); }
    }
  }
  return map;
}

/**
 * קובצי ייצוא של מערכות בית ספר מתחילים לעיתים בשורות כותרת כלליות
 * ("רשימת תלמידים - ט1"). מחפשים בעשר השורות הראשונות את זו שמתאימה הכי
 * הרבה לשמות עמודות מוכרים.
 */
function findHeaderRow(rows) {
  let best = { index: -1, score: 0, map: {} };
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const map = mapHeaders(rows[i] || []);
    const score = Object.keys(map).length;
    if (score > best.score) best = { index: i, score, map };
  }
  return best;
}

/** תאריך מ-Excel: מספר סידורי, תאריך טקסטואלי או Date. */
export function parseDob(value, date1904 = false) {
  if (value instanceof Date && !isNaN(value)) {
    return two(value.getDate()) + two(value.getMonth() + 1) + two(value.getFullYear() % 100);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // מספר סידורי: ימים מאז 1899-12-30 (או 1904-01-01). ילדים בני 14 - לא
    // מספר קטן, ולכן מספר מתחת ל-1000 הוא כנראה לא תאריך.
    if (value < 1000) return null;
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(value) * 86400000);
    return two(d.getUTCDate()) + two(d.getUTCMonth() + 1) + two(d.getUTCFullYear() % 100);
  }
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (m) return realDate(+m[1], +m[2], m[3]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);   // 2011-03-07
  if (m) return realDate(+m[3], +m[2], m[1]);
  return null;
}
const two = (n) => String(n).padStart(2, '0');

/**
 * 31/02 עובר בדיקת טווח פשוטה, אבל אינו תאריך. סיסמה שנגזרת ממנו לא תתאים
 * לשום דבר שהתלמיד/ה יודע/ת על עצמו/ה - לכן בודקים שהתאריך קיים בלוח השנה.
 */
function realDate(day, month, yearText) {
  const year = yearText.length === 4 ? +yearText : 2000 + +yearText;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return two(day) + two(month) + yearText.slice(-2);
}

const cell = (row, idx) => (idx === undefined ? '' : row[idx] ?? '');
const text = (v) => String(v ?? '').trim();

/** ת.ז שנשמרה כמספר מאבדת אפסים מובילים - אבל רק 3 האחרונות מעניינות אותנו. */
function lastThreeDigits(id) {
  const digits = (typeof id === 'number' ? String(Math.round(id)) : String(id ?? '')).replace(/\D/g, '');
  return digits ? digits.slice(-3).padStart(3, '0') : '';
}

/**
 * @param {{rows: any[][], date1904?: boolean}} sheet
 * @param {Array<{username: string, displayName: string}>} existing - התלמידים שכבר במערכת
 * @returns {{mode: string, valid: object[], existing: object[], invalid: object[], error?: string}}
 */
export function buildImport(sheet, existing = []) {
  const rows = sheet.rows || [];
  const header = findHeaderRow(rows);
  const f = header.map;

  const hasCredentials = f.username !== undefined && f.password !== undefined;
  const hasDerivation = f.idNumber !== undefined && f.dob !== undefined;
  const hasName = f.fullName !== undefined || (f.firstName !== undefined && f.lastName !== undefined);

  const missing = [];
  if (!hasName) missing.push('שם פרטי + שם משפחה (או שם מלא)');
  if (!hasCredentials && !hasDerivation) missing.push('ת.ז + תאריך לידה (או שם משתמש + סיסמה)');
  if (f.grade === undefined) missing.push('כיתה');
  if (header.index < 0 || missing.length) {
    return {
      mode: 'none', valid: [], existing: [], invalid: [],
      error: `לא מצאתי בקובץ את העמודות: ${missing.join(' · ') || 'כותרות'}. ` +
        'העמודות צריכות להופיע בשורת כותרת אחת בגיליון הראשון.',
    };
  }

  const mode = hasCredentials ? 'credentials' : 'derived';
  const byUsername = new Map(existing.map(s => [text(s.username).toLowerCase(), s]));
  const taken = new Set(byUsername.keys());
  const seenIds = new Map();
  const valid = [], already = [], invalid = [];

  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const excelRow = i + 1;
    const used = Object.values(f).map(idx => text(cell(row, idx)));
    if (used.every(v => v === '')) continue;   // שורה ריקה - מדלגים בשקט

    const first = text(cell(row, f.firstName));
    const last = text(cell(row, f.lastName));
    const full = text(cell(row, f.fullName));
    const displayName = (first && last) ? `${first} ${last}` : (full || `${first} ${last}`.trim());
    const firstName = first || full.split(/\s+/)[0] || '';
    const grade = normalizeGrade(cell(row, f.grade));

    if (!displayName) { invalid.push({ excelRow, reason: 'חסר שם' }); continue; }
    if (!grade) { invalid.push({ excelRow, displayName, reason: 'חסרה כיתה' }); continue; }

    let username, password;
    if (mode === 'credentials') {
      username = text(cell(row, f.username));
      password = text(cell(row, f.password));
      if (!username || !password) { invalid.push({ excelRow, displayName, reason: 'חסר שם משתמש או סיסמה' }); continue; }
      if (/\s/.test(username)) { invalid.push({ excelRow, displayName, reason: 'שם משתמש לא יכול להכיל רווחים' }); continue; }
    } else {
      const last3 = lastThreeDigits(cell(row, f.idNumber));
      if (!last3) { invalid.push({ excelRow, displayName, reason: 'חסרה ת.ז' }); continue; }
      const idKey = String(cell(row, f.idNumber)).replace(/\D/g, '');
      if (seenIds.has(idKey)) {
        invalid.push({ excelRow, displayName, reason: `מופיע/ה פעמיים בקובץ (גם בשורה ${seenIds.get(idKey)})` });
        continue;
      }
      seenIds.set(idKey, excelRow);
      if (text(cell(row, f.dob)) === '') { invalid.push({ excelRow, displayName, reason: 'חסר תאריך לידה' }); continue; }
      password = parseDob(cell(row, f.dob), sheet.date1904);
      if (!password) {
        invalid.push({ excelRow, displayName, reason: `תאריך לידה לא תקין ("${text(cell(row, f.dob))}")` });
        continue;
      }
      if (!firstName) { invalid.push({ excelRow, displayName, reason: 'חסר שם פרטי' }); continue; }
      username = firstName.replace(/\s+/g, '') + last3;
    }

    // ייבוא חוזר של אותו קובץ: אותו שם משתמש ואותו שם - זה אותו תלמיד.
    // בודקים גם את הגרסאות עם סיומת: מי שקיבל/ה "נועה482_2" בייבוא הראשון
    // לא יימצא/תימצא תחת "נועה482", ובלי זה היה נוצר/ת לו/ה חשבון שלישי.
    const same = variantsOf(username)
      .map(u => byUsername.get(u.toLowerCase()))
      .find(s => s && text(s.displayName) === displayName);
    if (same) {
      already.push({ excelRow, displayName, username: text(same.username), grade });
      continue;
    }
    if (mode === 'credentials') {
      if (taken.has(username.toLowerCase())) {
        invalid.push({ excelRow, displayName, reason: `שם המשתמש "${username}" כבר תפוס` });
        continue;
      }
    } else {
      // שני תלמידים עם אותו שם פרטי ואותן 3 ספרות - מוסיפים סיומת
      const base = username;
      for (let k = 2; taken.has(username.toLowerCase()); k++) username = `${base}_${k}`;
    }
    taken.add(username.toLowerCase());
    valid.push({ excelRow, displayName, username, password, grade });
  }

  return { mode, valid, existing: already, invalid };
}

/** "נועה482" -> ["נועה482", "נועה482_2", …]. במצב פרטים מוכנים אין סיומות. */
function variantsOf(username, max = 20) {
  const out = [username];
  for (let k = 2; k <= max; k++) out.push(`${username}_${k}`);
  return out;
}

/** רשימת פרטי כניסה להדפסה או לשמירה, בפורמט ש-Excel פותח נכון בעברית. */
export function credentialsCsv(list) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['כיתה', 'שם', 'שם משתמש', 'סיסמה'].map(q).join(',')];
  for (const s of list) lines.push([s.grade, s.displayName, s.username, s.password].map(q).join(','));
  return '﻿' + lines.join('\r\n');
}
