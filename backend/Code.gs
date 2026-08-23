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
  '## שלושה מצבי עבודה',
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
    case 'createNewStudent': return createNewStudent(p.username, p.password, p.displayName, p.grade);
    case 'saveProgress': return saveProgress(p.studentId, p.state);
    case 'fetchMyProgress': return fetchMyProgress(p.studentId);
    case 'fetchClassProgress': return fetchClassProgress();
    case 'tutorStatus': return tutorStatus();
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
    return {
      studentId: u.studentId, username: u.username, role: u.role,
      displayName: u.displayName, grade: u.grade || '',
    };
  }
  throw new Error('שם משתמש או סיסמה שגויים');
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

function tutorHint(p) {
  var key = getApiKey();
  if (!key) return { available: false, reason: 'לא הוגדר מפתח API בשרת' };

  var lines = [
    'מיומנות: ' + (p.skillTitle || ''),
    'הכלל הרלוונטי: ' + (p.rule || ''),
    'ההוראה שהוצגה: ' + (p.prompt || ''),
    'התרגיל: ' + (p.exercise || ''),
    'התשובה הנכונה: ' + (p.correctAnswer || ''),
    'מה שהתלמיד/ה כתב/ה: ' + (p.studentAnswer || '(ריק)'),
    'מספר הניסיונות עד כה: ' + (p.attempts || 1),
    'stage: ' + (p.stage || 'hint'),
  ];
  if (p.misconception) {
    lines.push('תפיסה מוטעית שזוהתה: ' + p.misconceptionLabel);
    lines.push('פירוט: ' + p.misconception);
  } else {
    lines.push('לא זוהתה תפיסה מוטעית מוכרת. התייחס/י לתשובה כפי שהיא.');
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
    messages: [{ role: 'user', content: lines.join('\n') }],
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
    return { available: false, reason: 'שגיאה מהשירות (' + code + ')' };
  }

  var data = JSON.parse(text);
  if (data.stop_reason === 'refusal') {
    return { available: false, reason: 'הבקשה נדחתה על ידי מסנני הבטיחות' };
  }
  var out = '';
  (data.content || []).forEach(function (block) {
    if (block.type === 'text') out += block.text;
  });
  return { available: true, text: out.trim() };
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
