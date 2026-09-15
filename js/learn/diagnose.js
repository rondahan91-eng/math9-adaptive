// ==========================================================================
// diagnose.js - זיהוי איזו תפיסה מוטעית מסבירה את התשובה השגויה
// ==========================================================================
// הגנרטור חישב מראש בדיוק איזו תשובה תתקבל מכל תפיסה מוטעית. כאן אנחנו רק
// משווים - זו התאמה מדויקת, לא ניחוש הסתברותי. אם אין התאמה, מחזירים null
// והמשוב יהיה כללי (ולא ניחוש שגוי, שגרוע יותר מכלום).

import { ratFunc, pOne, rfEqual } from '../math/poly.js';

function sameRootSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const key = (arr) => arr.map(r => `${r.n}/${r.d}`).sort().join(',');
  return key(a) === key(b);
}

/**
 * @returns {string|null} מזהה התפיסה המוטעית, או null אם לא זוהתה
 */
export function diagnose(exercise, result) {
  if (result.ok) return null;

  // טעויות מבניות - הערך נכון אבל הצורה לא
  if (result.reason === 'partial-factor') return 'not-fully-factored';
  if (result.reason === 'not-simplified') return 'cancel-terms-not-factors';

  if (exercise.mode === 'roots') {
    if (result.reason !== 'value' || !result.roots) return null;
    for (const w of exercise.wrongs) {
      if (w.roots && sameRootSet(w.roots, result.roots)) return w.id;
    }
    return null;
  }

  if (result.reason !== 'value' || !result.value) return null;

  // ברמות הגבוהות יש תרגילים עם 1/x, ושם התשובה אינה פולינום אלא מנה של
  // שניים. לכן ההשוואה נעשית תמיד במישור הפונקציות הרציונליות.
  const targetRf = exercise.target?.den
    ? exercise.target
    : (exercise.target?.terms ? ratFunc(exercise.target, pOne()) : null);

  for (const w of exercise.wrongs) {
    const rf = w.rf || (w.poly ? ratFunc(w.poly, pOne()) : null);
    if (!rf) continue;
    // הגנה: אם הגנרטור יצר "תשובה שגויה" שבמקרה שווה לנכונה - מתעלמים ממנה
    if (targetRf && rfEqual(rf, targetRf)) continue;
    if (rfEqual(result.value, rf)) return w.id;
  }
  return null;
}
