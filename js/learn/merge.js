// ==========================================================================
// merge.js - איחוד שני מצבי התקדמות בלי לאבד ראיות
// ==========================================================================
// ההתקדמות של תלמיד/ה נשמרת גם בדפדפן וגם בשרת, ולכן יכולים להתקיים שני
// מצבים שונים בו-זמנית: עבודה שנעשתה במחשב הכיתה מול עבודה שנעשתה בבית,
// או מצב ישן שנשאר בדפדפן אחרי תקלת רשת. "האחרון מנצח" היה מוחק עבודה
// אמיתית, ולכן המיזוג כאן בנוי על עיקרון אחד:
//
//   מספר הניסיונות של תלמיד/ה לעולם אינו קטן.
//
// לכן לכל מיומנות לוקחים את המקסימום של כל מונה, וההסתברות נלקחת מהצד שיש
// לו יותר ניסיונות - הוא זה שראה יותר ראיות. היסטוריה מאוחדת לפי זמן.
//
// הקובץ הזה מועתק גם ל-backend/Code.gs (בגרסת ES5). שינוי כאן מחייב שינוי
// גם שם, והבדיקות ב-tests/ מכסות את שתי ההתנהגויות.

export const HISTORY_LIMIT = 300;

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function mergeSkill(a, b) {
  if (!a) return b;
  if (!b) return a;
  // הצד עם יותר ניסיונות הוא העדכני יותר מבחינת מודל השליטה
  const newer = num(b.attempts) >= num(a.attempts) ? b : a;
  return {
    p: typeof newer.p === 'number' ? newer.p : Math.max(num(a.p), num(b.p)),
    attempts: Math.max(num(a.attempts), num(b.attempts)),
    correct: Math.max(num(a.correct), num(b.correct)),
    streak: num(newer.streak),
    maxCorrectLevel: Math.max(num(a.maxCorrectLevel), num(b.maxCorrectLevel)),
  };
}

function mergeMisconception(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = num(b.lastAt) >= num(a.lastAt) ? b : a;
  return { ...newer, seen: Math.max(num(a.seen), num(b.seen)) };
}

function mergeUsage(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (a.date === b.date) return { date: a.date, count: Math.max(num(a.count), num(b.count)) };
  return String(b.date) > String(a.date) ? b : a;   // המכסה היומית שייכת ליום המאוחר
}

/**
 * ממזג שני מצבים. התוצאה אף פעם אינה "פחות" מכל אחד מהם בנפרד.
 * @returns {object} מצב ממוזג חדש (הקלט אינו משתנה)
 */
export function mergeStates(a, b) {
  if (!a || typeof a !== 'object') return b;
  if (!b || typeof b !== 'object') return a;

  const skills = {};
  for (const id of new Set([...Object.keys(a.skills || {}), ...Object.keys(b.skills || {})])) {
    skills[id] = mergeSkill((a.skills || {})[id], (b.skills || {})[id]);
  }

  const misconceptions = {};
  for (const id of new Set([...Object.keys(a.misconceptions || {}), ...Object.keys(b.misconceptions || {})])) {
    misconceptions[id] = mergeMisconception((a.misconceptions || {})[id], (b.misconceptions || {})[id]);
  }

  // אירוע מזוהה לפי הזמן והמיומנות, כך שאותו תרגיל לא נספר פעמיים
  const byKey = new Map();
  for (const h of [...(a.history || []), ...(b.history || [])]) {
    if (!h) continue;
    byKey.set(`${num(h.at)}|${h.skillId}|${h.level}`, h);
  }
  const history = [...byKey.values()].sort((x, y) => num(x.at) - num(y.at)).slice(-HISTORY_LIMIT);

  return { skills, misconceptions, history, tutorUsage: mergeUsage(a.tutorUsage, b.tutorUsage) };
}
