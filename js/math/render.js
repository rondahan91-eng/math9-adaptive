// ==========================================================================
// render.js - הצגת ביטויים אלגבריים כ-HTML קריא
// ==========================================================================
// בלי ספריות חיצוניות (בלי KaTeX/MathJax): רק <sup> ותווים מתמטיים. כך הלומדה
// עובדת גם בלי אינטרנט ובלי CDN חסום ברשת בית הספר.
//
// כלל ברזל: הסימן ^ לעולם לא מגיע למסך. הוא צורת *הקלדה* בלבד, ובתצוגה הוא
// תמיד הופך לכתב עילי - גם כשהמעריך הוא אות (x^m) וגם כשהוא ביטוי (x^(m+n)).

import { sortedTerms, monoKey } from './poly.js';
import { ratToString } from './rational.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** ניקוי טיפוגרפי על הטקסט הגולמי, לפני פיצול לכתב עילי. */
function typography(raw) {
  let s = raw.replace(/\*/g, '·');
  // כפל מרומז נקרא טוב יותר בלי נקודה: 2·(x+3) -> 2(x+3)
  s = s.replace(/(\d|\)|[a-zA-Z])\s*·\s*(?=[a-zA-Z(])/g, '$1');
  s = s.replace(/\s*\+\s*/g, ' + ');
  // מינוס בין שני איברים הופך למינוס טיפוגרפי; מינוס אונרי בתחילת ביטוי נשאר
  s = s.replace(/([\w)²³])\s*-\s*/g, '$1 − ');
  return s;
}

/**
 * הופך כל ^ לכתב עילי. תומך בשלוש צורות:
 *   x^2      -> ספרות
 *   x^m      -> אות
 *   x^(m+n)  -> ביטוי בסוגריים (הסוגריים נעלמים)
 * ^ בודד בלי מעריך נשאר כפי שהוא, כדי לא לאבד תוכן.
 */
function superscriptify(raw) {
  let out = '';
  let plain = '';
  let i = 0;
  const flush = () => { out += escapeHtml(plain); plain = ''; };

  while (i < raw.length) {
    if (raw[i] !== '^') { plain += raw[i++]; continue; }
    i++;
    let body = '';

    if (raw[i] === '(') {
      let depth = 0, j = i, closed = false;
      for (; j < raw.length; j++) {
        if (raw[j] === '(') depth++;
        else if (raw[j] === ')') { depth--; if (depth === 0) { closed = true; j++; break; } }
      }
      if (closed) { body = raw.slice(i + 1, j - 1); i = j; }
    }

    if (!body) {
      let j = i;
      if (raw[j] === '-' || raw[j] === '+') j++;
      while (j < raw.length && /[0-9a-zA-Z]/.test(raw[j])) j++;
      body = raw.slice(i, j);
      i = j;
    }

    if (!body) { plain += '^'; continue; }
    flush();
    out += `<sup>${escapeHtml(body)}</sup>`;
  }
  flush();
  return out;
}

/**
 * ביטוי מתמטי טהור. נכפה עליו כיוון LTR ומופעל עליו ניקוי טיפוגרפי.
 * שומר על הצורה המקורית - (x+3)^2 יוצג כ-(x+3)² ולא ייפתח.
 */
export function renderExpr(text) {
  return `<span class="expr" dir="ltr">${superscriptify(typography(String(text ?? '')))}</span>`;
}

/**
 * טקסט מעורב עברית+מתמטיקה (שלבי פתרון, הערות, תשובות המורה הפרטי).
 * ממיר חזקות לכתב עילי, אבל *לא* כופה כיוון LTR - אחרת משפט עברי שיש בו
 * ביטוי היה מוצג הפוך. רק אם אין בטקסט אות עברית כלל, הוא נחשב ביטוי טהור.
 */
export function renderInline(text) {
  const raw = String(text ?? '');
  const html = superscriptify(raw);
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
