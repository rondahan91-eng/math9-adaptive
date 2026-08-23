// ==========================================================================
// verify.js - אימות טענות אלגבריות שכתב המורה הפרטי
// ==========================================================================
// ברמז רגיל המודל מקבל את התשובה הנכונה מוכנה מהמנוע, ולכן אינו יכול לטעות
// בחשבון. בשיחה הוא כן יכול: תלמיד/ה שואל/ת על ביטוי שלא חישבנו, והמודל עונה
// מהזיכרון. בספר לימוד זה בלתי מקובל.
//
// לכן המודל מתבקש לעטוף כל שוויון שהוא כותב ב-⟦ ⟧, וכאן אנחנו מריצים את שני
// האגפים דרך *אותו מנוע* שבודק את התלמידים. שוויון שלא עובר לא מוצג.

import { parse } from './parser.js';
import { astToRatFunc } from './evaluate.js';
import { rfEqual } from './poly.js';
import { renderExpr, renderInline } from './render.js';

const CLAIM = /⟦([^⟧]*)⟧/g;

/**
 * בודק טענה בודדת.
 * @returns {{kind: 'verified'|'expression'|'false'|'invalid', body: string, reason?: string}}
 *   verified   - שוויון שנבדק ונמצא נכון
 *   expression - ביטוי בלי סימן שוויון; אין מה לאמת, מוצג כרגיל
 *   false      - שוויון שאינו נכון
 *   invalid    - לא ניתן לפרסר, ולכן לא ניתן לאמת
 */
export function checkClaim(raw) {
  const body = String(raw || '').trim();
  if (!body) return { kind: 'invalid', body, reason: 'טענה ריקה' };

  const sides = body.split('=');
  if (sides.length === 1) {
    try { astToRatFunc(parse(body)); return { kind: 'expression', body }; }
    catch (err) { return { kind: 'invalid', body, reason: err.message }; }
  }
  if (sides.length !== 2) {
    return { kind: 'invalid', body, reason: 'יותר מסימן שוויון אחד' };
  }

  try {
    const left = astToRatFunc(parse(sides[0]));
    const right = astToRatFunc(parse(sides[1]));
    return rfEqual(left, right)
      ? { kind: 'verified', body }
      : { kind: 'false', body };
  } catch (err) {
    return { kind: 'invalid', body, reason: err.message };
  }
}

/**
 * מרנדר את תשובת המודל, ומחזיר גם את הטענות שנכשלו.
 * הקורא אחראי להחליט מה לעשות עם הכשלים - בדרך כלל בקשה חוזרת אחת.
 * @returns {{html: string, failures: Array}}
 */
export function renderVerified(text) {
  const source = String(text || '');
  const failures = [];
  let html = '';
  let last = 0;

  for (const match of source.matchAll(CLAIM)) {
    html += renderInline(source.slice(last, match.index));
    const result = checkClaim(match[1]);
    if (result.kind === 'false' || result.kind === 'invalid') {
      failures.push(result);
    } else {
      const cls = result.kind === 'verified' ? 'claim verified' : 'claim';
      html += `<span class="${cls}">${renderExpr(result.body)}</span>`;
    }
    last = match.index + match[0].length;
  }
  html += renderInline(source.slice(last));
  return { html, failures };
}

/** מנסח למודל מה בדיוק נכשל, לבקשה החוזרת. */
export function failureNote(failures) {
  const lines = failures.map(f => f.kind === 'false'
    ? `הטענה "${f.body}" אינה נכונה - שני האגפים אינם שקולים.`
    : `הטענה "${f.body}" אינה ניתנת לקריאה (${f.reason || 'שגיאת תחביר'}).`);
  return [
    'המנוע המתמטי בדק את התשובה שלך ומצא בה בעיה:',
    ...lines,
    'כתוב/כתבי את התשובה מחדש. אל תחזור/תחזרי על הטענה השגויה.',
  ].join('\n');
}
