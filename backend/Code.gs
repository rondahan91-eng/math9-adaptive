/**
 * ==========================================================================
 * לומדת מתמטיקה ט' - Code.gs
 * שרת ה-Backend (Google Apps Script) עבור הלומדה האדפטיבית.
 *
 * שני תפקידים:
 *   1. מסד נתונים - משתמשים והתקדמות, בגיליון Google Sheets מחובר.
 *   2. פרוקסי ל-Claude - מפתח ה-API יושב כאן ב-Script Properties ולעולם
 *      לא נשלח לדפדפן. התלמידים קוראים לשרת, השרת קורא ל-Anthropic.
 *
 * הוראות פריסה מלאות: README.md שבשורש הפרויקט.
 * ==========================================================================
 */

var SHEET_USERS = 'Users';
var SHEET_PROGRESS = 'Progress';
var SHEET_TUTOR = 'TutorUsage';
var SHEET_REVEALS = 'Reveals';

// שלבי הספר, בסדר הלימוד. חייב להיות זהה ל-STAGES ב-js/curriculum/skills.js.
var STAGES = ['יסודות', 'נוסחאות הכפל המקוצר', 'פירוק לגורמים', 'שילוב ויישום'];

// מה חשוף כשהגיליון נוצר: שני השלבים הראשונים - בדיוק הפרק שהכיתה לומדת.
var STAGES_REVEALED_BY_DEFAULT = ['יסודות', 'נוסחאות הכפל המקוצר'];

var ADMIN_TOKEN_PROPERTY = 'ADMIN_TOKEN';
var ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;   // 12 שעות

// המכסה היומית מוגדרת **כאן ולא בלקוח**. הלקוח מציג את מה שהשרת מחזיר,
// ולא סופר בעצמו - אחרת ניקוי localStorage היה מאפס את המגבלה.
var TUTOR_DAILY_LIMIT = 15;

// -------------------------------------------------------------- הגדרות ה-AI
var CLAUDE_MODEL = 'claude-opus-5';
var CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_VERSION = '2023-06-01';

/**
 * הנחיית המערכת. היא ארוכה, קבועה, וזהה בכל קריאה - ולכן היא מסומנת
 * ב-cache_control. אחרי הקריאה הראשונה כל תלמיד "קורא" אותה מהמטמון
 * בעלות של כעשירית ממחיר טוקן קלט רגיל.
 */
var TUTOR_SYSTEM = [
  'את/ה מורה פרטי/ת למתמטיקה בכיתה ט׳ בישראל, בתוך לומדה דיגיטלית לנושא',
  'כפל מקוצר ופירוק לגורמים. אתה מדבר עם תלמיד/ה בן/בת 14-15.',
  '',
  '## מה כבר ידוע לך בוודאות',
  'מנוע מתמטי דטרמיניסטי כבר בדק את התשובה לפני שהגעת. הפסיקה שלו סופית:',
  'אם נמסר לך שהתשובה שגויה - היא שגויה, גם אם היא נראית לך נכונה. אם נמסרה',
  'לך תפיסה מוטעית שזוהתה - היא זוהתה בהתאמה מדויקת, לא בניחוש. לעולם אל',
  'תסתור את הפסיקה הזו, אל תפקפק בה, ואל תחשב מחדש את התרגיל כדי לאמת אותה.',
  'התפקיד שלך הוא ניסוח פדגוגי בלבד.',
  '',
  '## אימות טענות - חובה, לא המלצה',
  'כל שוויון אלגברי שאתה כותב חייב להיות עטוף בסימון ⟦ ⟧. לדוגמה:',
  '  ⟦(x+4)^2 = x^2+8x+16⟧',
  'מנוע מתמטי דטרמיניסטי מריץ כל טענה כזו דרך אותו בודק שבודק את התלמידים,',
  'לפני שהיא מוצגת. שוויון שגוי אינו מוצג והתשובה שלך נפסלת. אל תכתוב שום',
  'שוויון מחוץ לסימון הזה. ביטוי בודד בלי סימן שוויון - כתוב רגיל, בלי סימון.',
  'אם אינך בטוח/ה בשוויון, אל תכתוב אותו: העדף/י לשאול שאלה מכוונת.',
  '',
  '## ארבעה מצבי עבודה',
  'stage=chat  - התלמיד/ה שאל/ה שאלה. ענה/עני עליה, ורק עליה. אסור לגלות את',
  '              התשובה הסופית כל עוד נמסר לך solutionRevealed=false, גם אם',
  '              נשאלת ישירות וגם אם התלמיד/ה מתעקש/ת. אסור לבצע את השלב',
  '              במקומו/ה. מותר: שאלה מכוונת, הצבעה על המקום שנשבר, הצעת',
  '              בדיקה, הסבר הכלל, דוגמה נוספת עם מספרים אחרים.',
  'stage=hint  - התלמיד/ה טעה/תה ורוצה רמז. אסור לך לגלות את התשובה הסופית',
  '              ואסור לך לבצע את השלב עבורו. שאל שאלה מכוונת אחת שתגרום',
  '              לו/ה לשים לב לנקודה שנכשלה, או הצע בדיקה קטנה שאפשר לעשות',
  '              (למשל: הצבת מספר במקום x בשני האגפים).',
  'stage=why   - התלמיד/ה רוצה להבין למה התשובה שלו/ה שגויה. הסבר בדיוק איפה',
  '              השתבש הצעד, בלי לפתור את התרגיל מההתחלה.',
  'stage=explain - התלמיד/ה כבר ראה/תה את הפתרון. הסבר את הרעיון בקצרה כדי',
  '              שהפעם הבאה תהיה שונה.',
  '',
  '## כללי כתיבה',
  '- עברית פשוטה וברורה, פנייה בגוף שני. מותר לפנות בלשון נייטרלית.',
  '- שניים עד ארבעה משפטים. לא יותר. בלי כותרות, בלי רשימות ממוספרות,',
  '  בלי אימוג׳ים.',
  '- טון: רגוע, מכבד, ענייני. לא מתלהב מדי ולא מתנשא. אל תפתח במחמאה',
  '  ריקה כמו "שאלה מצוינת" ואל תאמר "אל תדאג".',
  '- כתוב חזקות בכתב עילי בלבד: x², x³, x⁴. אסור להשתמש בסימן ^ בתשובה.',
  '- שאר המתמטיקה בטקסט רגיל: a·b, (x+3)(x-3). אסור LaTeX, אסור סימני $',
  '  ואסור \\frac.',
  '- אל תכלול תגיות XML או HTML כלשהן בתשובה.',
  '- אל תמציא נוסחאות. הנוסחאות הרלוונטיות ליחידה הן בדיוק אלה:',
  '  (a+b)^2 = a^2 + 2ab + b^2',
  '  (a-b)^2 = a^2 - 2ab + b^2',
  '  (a-b)(a+b) = a^2 - b^2',
  '- אם התלמיד/ה כתב/ה משהו שאינו קשור לתרגיל, החזר/י אותו/ה לתרגיל במשפט אחד.',
  '',
  '## מה אסור',
  '- לחשוף את התשובה הסופית כאשר stage=hint.',
  '- לפתור את התרגיל שלב-אחר-שלב במקום התלמיד/ה.',
  '- לומר לתלמיד/ה שהוא/היא צודק/ת כשנמסר לך שהתשובה שגויה.',
  '- להוסיף עידוד גנרי בסוף כל תשובה. עודד/י רק כשיש על מה.',
].join('\n');

// -------------------------------------------------------------- כניסה ל-Web App
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'בקשה לא תקינה (JSON שגוי)' });
  }
  try {
    var result = routeAction(body.action, body.payload || {});
    return jsonResponse({ ok: true, result: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('לומדת מתמטיקה ט׳ - API פעיל. יש לשלוח בקשות POST בלבד.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction(action, p) {
  switch (action) {
    case 'authenticateUser': return authenticateUser(p.username, p.password);
    case 'createNewStudent':
      requireAdmin(p.token);
      return createNewStudent(p.username, p.password, p.displayName, p.grade);
    case 'importStudents': return importStudents(p.students, p.token);
    case 'listStudents': requireAdmin(p.token); return listStudents();
    case 'resetPassword': return resetPassword(p.studentId, p.password, p.token);
    case 'saveProgress': return saveProgress(p.studentId, p.state);
    case 'fetchMyProgress': return fetchMyProgress(p.studentId);
    case 'fetchClassProgress': return fetchClassProgress();
    case 'fetchReveals': return fetchReveals();
    case 'setReveal': return setReveal(p.stage, p.revealed, p.token);
    case 'tutorStatus': return tutorStatus();
    case 'tutorQuota': return tutorQuota(p.studentId);
    case 'tutorHint': return tutorHint(p);
    default: throw new Error('פעולה לא מוכרת: ' + action);
  }
}

// -------------------------------------------------------------- גיליונות
function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = createSheet(ss, name);
  return sheet;
}

function createSheet(ss, name) {
  var sheet = ss.insertSheet(name);
  if (name === SHEET_USERS) {
    sheet.appendRow(['studentId', 'username', 'passHash', 'role', 'displayName', 'grade', 'createdAt']);
    sheet.appendRow(['admin', 'admin', sha256('admin123'), 'admin', 'מורה', '', new Date()]);
    sheet.appendRow(['demo1', 'demo', sha256('demo1234'), 'student', 'תלמיד/ה לדוגמה', 'ט1', new Date()]);
  } else if (name === SHEET_PROGRESS) {
    sheet.appendRow(['studentId', 'stateJson', 'updatedAt']);
  } else if (name === SHEET_TUTOR) {
    sheet.appendRow(['studentId', 'date', 'count', 'lastQuestionId', 'retryUsed', 'updatedAt']);
  } else if (name === SHEET_REVEALS) {
    sheet.appendRow(['stage', 'revealed', 'updatedAt', 'updatedBy']);
    for (var i = 0; i < STAGES.length; i++) {
      var on = STAGES_REVEALED_BY_DEFAULT.indexOf(STAGES[i]) !== -1;
      sheet.appendRow([STAGES[i], on, new Date(), 'ברירת מחדל']);
    }
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).filter(function (row) { return row[0] !== ''; }).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function sha256(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0');
  }).join('');
}

// -------------------------------------------------------------- משתמשים
function authenticateUser(username, password) {
  if (!username || !password) throw new Error('שם משתמש וסיסמה הם שדות חובה');
  var users = sheetToObjects(getSheet(SHEET_USERS));
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.username).toLowerCase() !== String(username).trim().toLowerCase()) continue;
    if (sha256(password) !== u.passHash) throw new Error('שם משתמש או סיסמה שגויים');
    var out = {
      studentId: u.studentId, username: u.username, role: u.role,
      displayName: u.displayName, grade: u.grade || '',
    };
    // רק למורה יש אסימון, ורק הוא נדרש לפעולות שמשנות מה התלמידים רואים
    if (u.role === 'admin') out.token = mintAdminToken(out);
    return out;
  }
  throw new Error('שם משתמש או סיסמה שגויים');
}

// -------------------------------------------------------------- חשיפת שלבים
// שתי שכבות שליטה נפרדות במה שתלמיד/ה רואה:
//   1. חשיפה - החלטה של המורה, ברמת שלב. נשמרת כאן.
//   2. קדם-דרישות - אוטומטי, לפי שליטה. נשאר בצד הלקוח ואינו ניתן לעקיפה.
// הסתרה לעולם אינה מוחקת התקדמות: היא רק מעלימה שלב מהמפה, וחשיפה מחדש
// מחזירה את המצב כפי שהיה.

function fetchReveals() {
  var rows = sheetToObjects(getSheet(SHEET_REVEALS));
  var byStage = {};
  for (var i = 0; i < rows.length; i++) {
    byStage[String(rows[i].stage)] = isTrue(rows[i].revealed);
  }
  // שלב שאינו מופיע בגיליון נחשב מוסתר, כדי שתוכן חדש לא ייחשף מעצמו
  var out = [];
  for (var j = 0; j < STAGES.length; j++) {
    out.push({ stage: STAGES[j], revealed: byStage[STAGES[j]] === true });
  }
  return out;
}

function setReveal(stage, revealed, token) {
  var admin = requireAdmin(token);
  if (STAGES.indexOf(stage) === -1) throw new Error('שלב לא מוכר: ' + stage);
  var sheet = getSheet(SHEET_REVEALS);
  var values = sheet.getDataRange().getValues();
  var want = !!revealed;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) !== String(stage)) continue;
    sheet.getRange(r + 1, 2, 1, 3).setValues([[want, new Date(), admin.displayName || admin.studentId]]);
    return fetchReveals();
  }
  sheet.appendRow([stage, want, new Date(), admin.displayName || admin.studentId]);
  return fetchReveals();
}

/** גיליון Google מחזיר לפעמים בוליאני ולפעמים את המחרוזת "TRUE". */
function isTrue(v) {
  if (v === true) return true;
  return String(v).trim().toLowerCase() === 'true';
}

// -------------------------------------------------------------- הרשאת מורה
// בלי זה "בדיקת אדמין" הייתה תיאטרון: הלקוח שולח studentId, וכל תלמיד/ה
// שפותח/ת את קוד המקור יכול/ה לשלוח 'admin'. אסימון שנוצר רק בהתחברות
// מוצלחת הוא הדבר היחיד שהלקוח אינו יכול להמציא.
function mintAdminToken(user) {
  var token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(ADMIN_TOKEN_PROPERTY, JSON.stringify({
    token: token, studentId: user.studentId, displayName: user.displayName, at: Date.now(),
  }));
  return token;
}

function requireAdmin(token) {
  if (!token) throw new Error('הפעולה הזו דורשת התחברות כמורה');
  var raw = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY);
  if (!raw) throw new Error('פג תוקף ההתחברות. יש להתחבר מחדש');
  var saved;
  try { saved = JSON.parse(raw); } catch (e) { throw new Error('פג תוקף ההתחברות. יש להתחבר מחדש'); }
  if (saved.token !== token) throw new Error('הפעולה הזו דורשת התחברות כמורה');
  if (Date.now() - saved.at > ADMIN_TOKEN_TTL_MS) {
    throw new Error('פג תוקף ההתחברות. יש להתחבר מחדש');
  }
  return saved;
}

// -------------------------------------------------------------- ניהול תלמידים
// כל הפעולות כאן דורשות אסימון מורה. בלי זה כל מי שקורא את קוד המקור היה
// יכול ליצור לעצמו חשבונות או לאפס סיסמה של חבר/ה.

var MAX_IMPORT = 400;

/**
 * הוספת תלמידים בבת אחת. שם משתמש שכבר קיים מדולג ומדווח - לא נדרס -
 * כך שייבוא חוזר של אותו קובץ אינו יוצר כפילויות.
 * כל השורות נכתבות בפעולה אחת: appendRow לכל שורה איטי מאוד ב-Apps Script.
 */
function importStudents(students, token) {
  requireAdmin(token);
  if (!students || !students.length) throw new Error('לא התקבלו תלמידים');
  if (students.length > MAX_IMPORT) throw new Error('אפשר לייבא עד ' + MAX_IMPORT + ' תלמידים בבת אחת');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet(SHEET_USERS);
    var taken = {};
    sheetToObjects(sheet).forEach(function (u) { taken[String(u.username).toLowerCase()] = true; });

    var rows = [], added = [], skipped = [];
    for (var i = 0; i < students.length; i++) {
      var s = students[i] || {};
      var username = String(s.username || '').trim();
      var password = String(s.password || '');
      if (!username || !password) { skipped.push({ username: username, reason: 'חסר שם משתמש או סיסמה' }); continue; }
      if (taken[username.toLowerCase()]) { skipped.push({ username: username, reason: 'כבר קיים במערכת' }); continue; }
      taken[username.toLowerCase()] = true;
      var studentId = 's_' + Utilities.getUuid().slice(0, 8);
      var displayName = String(s.displayName || username).trim();
      var grade = String(s.grade || '').trim();
      rows.push([studentId, username, sha256(password), 'student', displayName, grade, new Date()]);
      added.push({ studentId: studentId, username: username, displayName: displayName, grade: grade });
    }
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { added: added, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

/** רשימת התלמידים - בלי גיבוב הסיסמה. */
function listStudents() {
  return sheetToObjects(getSheet(SHEET_USERS))
    .filter(function (u) { return u.role === 'student'; })
    .map(function (u) {
      return {
        studentId: u.studentId, username: u.username, displayName: u.displayName,
        grade: u.grade || '', createdAt: u.createdAt ? new Date(u.createdAt).getTime() : null,
      };
    });
}

function resetPassword(studentId, password, token) {
  requireAdmin(token);
  if (!studentId || !password) throw new Error('חסר תלמיד או סיסמה');
  if (String(password).length < 4) throw new Error('הסיסמה קצרה מדי (לפחות 4 תווים)');
  var sheet = getSheet(SHEET_USERS);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) !== String(studentId)) continue;
    if (values[r][3] !== 'student') throw new Error('אפשר לאפס רק סיסמה של תלמיד/ה');
    sheet.getRange(r + 1, 3).setValue(sha256(String(password)));
    return { ok: true };
  }
  throw new Error('התלמיד/ה לא נמצא/ה');
}

function createNewStudent(username, password, displayName, grade) {
  if (!username || !password) throw new Error('חובה למלא שם משתמש וסיסמה');
  var sheet = getSheet(SHEET_USERS);
  var users = sheetToObjects(sheet);
  var exists = users.some(function (u) {
    return String(u.username).toLowerCase() === String(username).trim().toLowerCase();
  });
  if (exists) throw new Error('שם המשתמש כבר קיים במערכת');
  var studentId = 's_' + Utilities.getUuid().slice(0, 8);
  sheet.appendRow([studentId, String(username).trim(), sha256(password), 'student',
    displayName || String(username).trim(), grade || '', new Date()]);
  return { studentId: studentId, username: String(username).trim(), role: 'student',
    displayName: displayName || String(username).trim(), grade: grade || '' };
}

// -------------------------------------------------------------- התקדמות
function saveProgress(studentId, state) {
  if (!studentId) throw new Error('חסר מזהה תלמיד');
  var sheet = getSheet(SHEET_PROGRESS);
  var json = JSON.stringify(state || {});
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === studentId) {
      sheet.getRange(r + 1, 2).setValue(json);
      sheet.getRange(r + 1, 3).setValue(new Date());
      return { ok: true };
    }
  }
  sheet.appendRow([studentId, json, new Date()]);
  return { ok: true };
}

function fetchMyProgress(studentId) {
  var rows = sheetToObjects(getSheet(SHEET_PROGRESS));
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].studentId === studentId) {
      try { return JSON.parse(rows[i].stateJson); } catch (e) { return null; }
    }
  }
  return null;
}

function fetchClassProgress() {
  var users = sheetToObjects(getSheet(SHEET_USERS)).filter(function (u) { return u.role === 'student'; });
  var rows = sheetToObjects(getSheet(SHEET_PROGRESS));
  var byId = {};
  rows.forEach(function (r) {
    try { byId[r.studentId] = { state: JSON.parse(r.stateJson), updatedAt: r.updatedAt }; }
    catch (e) { byId[r.studentId] = { state: null, updatedAt: r.updatedAt }; }
  });
  return users.map(function (u) {
    var entry = byId[u.studentId] || {};
    return {
      studentId: u.studentId, displayName: u.displayName, grade: u.grade || '',
      state: entry.state || null, updatedAt: entry.updatedAt || null,
    };
  });
}

// -------------------------------------------------------------- המורה הפרטי
function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
}

function tutorStatus() {
  var key = getApiKey();
  return {
    available: !!key,
    reason: key ? '' : 'לא הוגדר מפתח API בשרת (Script Property בשם CLAUDE_API_KEY)',
  };
}

// -------------------------------------------------------------- מכסה יומית
function todayStamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** מאתר את שורת המכסה של התלמיד/ה, או יוצר אותה. מחזיר {row, values}. */
function tutorRow(sheet, studentId) {
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === studentId) return { row: r + 1, values: values[r] };
  }
  sheet.appendRow([studentId, todayStamp(), 0, '', false, new Date()]);
  return { row: sheet.getLastRow(), values: [studentId, todayStamp(), 0, '', false, new Date()] };
}

function quotaOf(studentId) {
  if (!studentId) throw new Error('חסר מזהה תלמיד');
  var sheet = getSheet(SHEET_TUTOR);
  var found = tutorRow(sheet, studentId);
  var sameDay = String(found.values[1]) === todayStamp();
  var used = sameDay ? (Number(found.values[2]) || 0) : 0;
  return {
    sheet: sheet,
    row: found.row,
    values: found.values,
    sameDay: sameDay,
    used: used,
    limit: TUTOR_DAILY_LIMIT,
    left: Math.max(0, TUTOR_DAILY_LIMIT - used),
  };
}

function tutorQuota(studentId) {
  var q = quotaOf(studentId);
  return { limit: q.limit, used: q.used, left: q.left, date: todayStamp() };
}

/**
 * תופס שאלה אחת מהמכסה. נעילה כדי ששתי בקשות במקביל לא ייספרו כאחת.
 *
 * questionId מאפשר **ניסיון חוזר אחד** בלי לחייב את המכסה: כשהאימות המתמטי
 * נכשל, הלקוח שולח שוב עם אותו מזהה. הדגל retryUsed מבטיח שזה קורה פעם אחת
 * בלבד לכל שאלה, כך שאי אפשר לקבל שאלות חינם על ידי שליחה חוזרת.
 */
function claimQuestion(studentId, questionId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { ok: false, reason: 'השרת עמוס, נסו שוב בעוד רגע' }; }

  try {
    var q = quotaOf(studentId);
    var isRetry = questionId
      && String(q.values[3]) === String(questionId)
      && q.sameDay
      && q.values[4] !== true && String(q.values[4]).toLowerCase() !== 'true';

    if (isRetry) {
      q.sheet.getRange(q.row, 5).setValue(true); // ניסיון חוזר אחד נוצל
      q.sheet.getRange(q.row, 6).setValue(new Date());
      return { ok: true, quota: { limit: q.limit, used: q.used, left: q.left, date: todayStamp() } };
    }

    if (q.left <= 0) {
      return {
        ok: false,
        reason: 'נגמרו השאלות להיום. המכסה מתחדשת מחר.',
        quota: { limit: q.limit, used: q.used, left: 0, date: todayStamp() },
      };
    }

    var used = q.used + 1;
    q.sheet.getRange(q.row, 2).setValue(todayStamp());
    q.sheet.getRange(q.row, 3).setValue(used);
    q.sheet.getRange(q.row, 4).setValue(questionId || '');
    q.sheet.getRange(q.row, 5).setValue(false);
    q.sheet.getRange(q.row, 6).setValue(new Date());
    return {
      ok: true,
      quota: { limit: q.limit, used: used, left: Math.max(0, q.limit - used), date: todayStamp() },
    };
  } finally {
    lock.releaseLock();
  }
}

/** מחזיר שאלה למכסה כשהקריאה ל-Claude נכשלה - אין סיבה לחייב על כשל שלנו. */
function refundQuestion(studentId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return null; }
  try {
    var q = quotaOf(studentId);
    var used = Math.max(0, q.used - 1);
    q.sheet.getRange(q.row, 3).setValue(used);
    q.sheet.getRange(q.row, 6).setValue(new Date());
    return { limit: q.limit, used: used, left: Math.max(0, q.limit - used), date: todayStamp() };
  } finally {
    lock.releaseLock();
  }
}

function tutorHint(p) {
  var key = getApiKey();
  if (!key) return { available: false, reason: 'לא הוגדר מפתח API בשרת' };
  if (!p.studentId) return { available: false, reason: 'חסר מזהה תלמיד' };

  var claim = claimQuestion(p.studentId, p.questionId);
  if (!claim.ok) return { available: false, reason: claim.reason, quota: claim.quota };

  // ההקשר מפוצל לשניים בכוונה. החלק הראשון קבוע לאורך כל התרגיל ולכן הוא
  // מסומן ב-cache_control: כל שאלה נוספת באותו תרגיל קוראת אותו מהמטמון.
  // החלק השני משתנה בין ניסיון לניסיון ולכן הוא *אחרי* נקודת המטמון.
  var stableContext = [
    'מיומנות: ' + (p.skillTitle || ''),
    'הכלל הרלוונטי: ' + (p.rule || ''),
    'ההוראה שהוצגה: ' + (p.prompt || ''),
    'התרגיל: ' + (p.exercise || '(עמוד שיעור, בלי תרגיל ספציפי)'),
    'התשובה הנכונה: ' + (p.correctAnswer || '(לא רלוונטי)'),
  ].join('\n');

  var volatileContext = [
    'stage: ' + (p.stage || 'hint'),
    'הקשר: ' + (p.contextKind || 'practice'),
    'מה שהתלמיד/ה כתב/ה: ' + (p.studentAnswer || '(ריק)'),
    'מספר הניסיונות עד כה: ' + (p.attempts || 0),
    'solutionRevealed: ' + (p.solutionRevealed ? 'true' : 'false'),
  ];
  if (p.misconception) {
    volatileContext.push('תפיסה מוטעית שזוהתה: ' + p.misconceptionLabel);
    volatileContext.push('פירוט: ' + p.misconception);
  } else {
    volatileContext.push('לא זוהתה תפיסה מוטעית מוכרת. התייחס/י לתשובה כפי שהיא.');
  }

  var messages = [
    { role: 'user', content: [{
      type: 'text',
      text: stableContext,
      cache_control: { type: 'ephemeral' },
    }] },
    { role: 'user', content: volatileContext.join('\n') },
  ];

  var turns = p.turns || [];
  if (turns.length) {
    for (var i = 0; i < turns.length; i++) {
      var role = turns[i].role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role: role, content: String(turns[i].content || '') });
    }
  } else {
    messages.push({ role: 'user', content: 'נסח/י את התשובה שלך לפי ה-stage שנמסר.' });
  }

  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: 700,
    // effort נמוך: זה ניסוח רמז קצר, לא בעיה שדורשת חשיבה עמוקה.
    // חשיבה אדפטיבית נשארת דלוקה (ברירת המחדל ב-Opus 5) כי כיבוי שלה
    // עלול לגרום לדליפת תגיות פנימיות לתוך התשובה.
    output_config: { effort: 'low' },
    system: [{
      type: 'text',
      text: TUTOR_SYSTEM,
      cache_control: { type: 'ephemeral' },
    }],
    messages: messages,
  };

  var res = UrlFetchApp.fetch(CLAUDE_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': CLAUDE_VERSION },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    Logger.log('Claude error ' + code + ': ' + text);
    return {
      available: false,
      reason: 'שגיאה מהשירות (' + code + ')',
      quota: refundQuestion(p.studentId),
    };
  }

  var data = JSON.parse(text);
  if (data.stop_reason === 'refusal') {
    return {
      available: false,
      reason: 'הבקשה נדחתה על ידי מסנני הבטיחות',
      quota: refundQuestion(p.studentId),
    };
  }
  var out = '';
  (data.content || []).forEach(function (block) {
    if (block.type === 'text') out += block.text;
  });
  return { available: true, text: out.trim(), quota: claim.quota };
}

/** להרצה ידנית מעורך הסקריפטים כדי לוודא שהמפתח עובד. */
function testTutor() {
  Logger.log(JSON.stringify(tutorHint({
    stage: 'hint',
    skillTitle: 'ריבוע של סכום',
    rule: '(a + b)^2 = a^2 + 2ab + b^2',
    prompt: 'פתחו את הסוגריים',
    exercise: '(x + 4)^2',
    correctAnswer: 'x^2 + 8x + 16',
    studentAnswer: 'x^2 + 16',
    misconceptionLabel: 'שכחת את האיבר האמצעי',
    misconception: 'התלמיד כתב (a+b)^2 = a^2 + b^2 ופספס את האיבר האמצעי 2ab.',
    attempts: 1,
  })));
}
