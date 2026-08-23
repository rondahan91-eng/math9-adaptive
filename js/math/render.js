// ==========================================================================
// render.js - הצגת ביטויים אלגבריים כ-HTML קריא
// ==========================================================================
// בלי ספריות חיצוניות (בלי KaTeX/MathJax): רק <sup> ותווים מתמטיים. כך הלומדה
// עובדת גם בלי אינטרנט ובלי CDN חסום ברשת בית הספר.

import { sortedTerms, monoKey } from './poly.js';
import { ratToString } from './rational.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * ממיר מחרוזת ביטוי לתצוגה. מיועד למחרוזות שאנחנו כתבנו (שאלות, פתרונות),
 * ולכן שומר על הצורה המקורית - (x+3)^2 יוצג כ-(x+3)² ולא ייפתח.
 */
export function renderExpr(text) {
  let html = escapeHtml(text);
  html = html.replace(/\^\(?(-?\d+)\)?/g, (_, exp) => `<sup>${exp}</sup>`);
  html = html.replace(/\*/g, '·');
  html = html.replace(/(\d|\)|[a-zA-Z])\s*·\s*(?=[a-zA-Z(])/g, '$1');
  html = html.replace(/\s*\+\s*/g, ' + ');
  // מינוס בין שני איברים הופך למינוס טיפוגרפי; מינוס אונרי בתחילת ביטוי נשאר
  html = html.replace(/([\w)²³])\s*-\s*/g, '$1 − ');
  return `<span class="expr" dir="ltr">${html}</span>`;
}

/**
 * טקסט מעורב עברית+מתמטיקה (שלבי פתרון, הערות). ממיר ^n לחזקה עילית, אבל
 * *לא* כופה כיוון LTR - אחרת משפט עברי שיש בו ביטוי היה מוצג הפוך.
 * רק אם אין בטקסט אות עברית כלל, הוא נחשב ביטוי טהור ומקבל dir=ltr.
 */
export function renderInline(text) {
  const raw = String(text ?? '');
  let html = escapeHtml(raw).replace(/\^\(?(-?\d+)\)?/g, (_, exp) => `<sup>${exp}</sup>`);
  const hasHebrew = /[֐-׿]/.test(raw);
  return hasHebrew ? html : `<span class="expr" dir="ltr">${html}</span>`;
}

const SUPS = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function monoHtml(vars) {
  const keys = Object.keys(vars).sort();
  return keys.map(v => {
    const e = vars[v];
    if (e === 1) return v;
    return `${v}<sup>${e}</sup>`;
  }).join('');
}

/** מציג פולינום בצורה קנונית פתוחה: x² + 6x + 9 */
export function polyToHtml(p) {
  const terms = sortedTerms(p);
  if (terms.length === 0) return '<span class="expr" dir="ltr">0</span>';
  let out = '';
  terms.forEach((t, i) => {
    const isNeg = t.coef.n < 0;
    const absCoef = { n: Math.abs(t.coef.n), d: t.coef.d };
    const varsHtml = monoHtml(t.vars);
    const showCoef = varsHtml === '' || !(absCoef.n === 1 && absCoef.d === 1);
    const coefText = showCoef ? escapeHtml(ratToString(absCoef)) : '';
    if (i === 0) out += isNeg ? '−' : '';
    else out += isNeg ? ' − ' : ' + ';
    out += coefText + varsHtml;
  });
  return `<span class="expr" dir="ltr">${out}</span>`;
}

/** מציג פירוק לגורמים: 2(x − 3)(x + 3) */
export function factorsToHtml(constant, factors) {
  let out = '';
  if (constant.n === -1 && constant.d === 1) out += '−';
  else if (!(constant.n === 1 && constant.d === 1)) out += escapeHtml(ratToString(constant));
  if (factors.length === 0) return `<span class="expr" dir="ltr">${out || '1'}</span>`;

  // גורמים זהים מקובצים לחזקה: (x+3)(x+3) -> (x+3)²
  const groups = [];
  for (const f of factors) {
    const key = sortedTerms(f).map(t => `${ratToString(t.coef)}·${monoKey(t.vars)}`).join('+');
    const existing = groups.find(g => g.key === key);
    if (existing) existing.count++;
    else groups.push({ key, poly: f, count: 1 });
  }
  for (const g of groups) {
    const inner = polyToHtml(g.poly).replace(/^<span[^>]*>|<\/span>$/g, '');
    const single = sortedTerms(g.poly).length === 1;
    const body = single ? inner : `(${inner})`;
    out += body + (g.count > 1 ? (SUPS[g.count] || `<sup>${g.count}</sup>`) : '');
  }
  return `<span class="expr" dir="ltr">${out}</span>`;
}
