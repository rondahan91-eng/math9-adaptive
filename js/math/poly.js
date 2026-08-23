// ==========================================================================
// poly.js - פולינומים רב-משתניים עם מקדמים רציונליים + פונקציות רציונליות
// ==========================================================================
// זהו "הצורה הקנונית" של המנוע: כל ביטוי אלגברי מתורגם לפולינום (או למנה של
// שני פולינומים), ואז שקילות בין ביטויים היא פשוט השוואה של הצורות הקנוניות.
// כך (x+3)(x-3) ו-x²-9 מזוהים כשווים בוודאות, בלי ניחושים ובלי הצבות אקראיות.

import {
  rat, rAdd, rMul, rNeg, rSub, rDiv, rEq, isZero, ONE, ZERO,
  gcd, lcm, ratToString, isNegative,
} from './rational.js';

// -------------------------------------------------------------- חד-איברים
/** מפתח קנוני לחד-איבר: {x:2, y:1} -> "x^2*y^1" (ממויין לפי שם המשתנה). */
export function monoKey(vars) {
  const keys = Object.keys(vars).filter(v => vars[v] > 0).sort();
  if (keys.length === 0) return '1';
  return keys.map(v => `${v}^${vars[v]}`).join('*');
}

function cleanVars(vars) {
  const out = {};
  for (const v of Object.keys(vars)) if (vars[v] > 0) out[v] = vars[v];
  return out;
}

function mulVars(a, b) {
  const out = { ...a };
  for (const v of Object.keys(b)) out[v] = (out[v] || 0) + b[v];
  return cleanVars(out);
}

// -------------------------------------------------------------- בניית פולינומים
/** פולינום = Map ממפתח חד-איבר אל {coef, vars}. איברים עם מקדם 0 נמחקים. */
export function poly(terms = []) {
  const map = new Map();
  for (const { coef, vars } of terms) {
    const v = cleanVars(vars || {});
    const k = monoKey(v);
    const prev = map.get(k);
    const sum = prev ? rAdd(prev.coef, coef) : coef;
    if (isZero(sum)) map.delete(k);
    else map.set(k, { coef: sum, vars: v });
  }
  return { terms: map };
}

export const pConst = (r) => poly([{ coef: r, vars: {} }]);
export const pInt = (n) => pConst(rat(n));
export const pVar = (name) => poly([{ coef: ONE, vars: { [name]: 1 } }]);
export const pZero = () => poly([]);
export const pOne = () => pConst(ONE);

export const isZeroPoly = (p) => p.terms.size === 0;
export const isConstPoly = (p) => p.terms.size === 0 || (p.terms.size === 1 && p.terms.has('1'));

export function constValue(p) {
  if (!isConstPoly(p)) return null;
  const t = p.terms.get('1');
  return t ? t.coef : ZERO;
}

export function pAdd(a, b) {
  return poly([...a.terms.values(), ...b.terms.values()]);
}

export function pNeg(a) {
  return poly([...a.terms.values()].map(t => ({ coef: rNeg(t.coef), vars: t.vars })));
}

export const pSub = (a, b) => pAdd(a, pNeg(b));

export function pMul(a, b) {
  const out = [];
  for (const ta of a.terms.values()) {
    for (const tb of b.terms.values()) {
      out.push({ coef: rMul(ta.coef, tb.coef), vars: mulVars(ta.vars, tb.vars) });
    }
  }
  return poly(out);
}

export function pPow(a, k) {
  if (!Number.isInteger(k) || k < 0) throw new Error('חזקה חייבת להיות מספר שלם אי-שלילי');
  let out = pOne();
  for (let i = 0; i < k; i++) out = pMul(out, a);
  return out;
}

export function pScale(a, r) {
  if (isZero(r)) return pZero();
  return poly([...a.terms.values()].map(t => ({ coef: rMul(t.coef, r), vars: t.vars })));
}

export function pEqual(a, b) { return isZeroPoly(pSub(a, b)); }

// -------------------------------------------------------------- מידע על הפולינום
export function polyVars(p) {
  const s = new Set();
  for (const t of p.terms.values()) for (const v of Object.keys(t.vars)) s.add(v);
  return [...s].sort();
}

export function degreeIn(p, v) {
  let d = 0;
  for (const t of p.terms.values()) d = Math.max(d, t.vars[v] || 0);
  return d;
}

export function totalDegree(p) {
  let d = 0;
  for (const t of p.terms.values()) {
    d = Math.max(d, Object.values(t.vars).reduce((s, e) => s + e, 0));
  }
  return d;
}

/** מקדמי הפולינום כפולינום במשתנה v: [c0, c1, c2, ...] (כל ci פולינום בשאר). */
export function coeffsIn(p, v) {
  const d = degreeIn(p, v);
  const out = Array.from({ length: d + 1 }, () => []);
  for (const t of p.terms.values()) {
    const e = t.vars[v] || 0;
    const rest = { ...t.vars };
    delete rest[v];
    out[e].push({ coef: t.coef, vars: rest });
  }
  return out.map(terms => poly(terms));
}

/** ההצבה p(vals) כאשר vals ממפה שם משתנה לערך רציונלי. */
export function pEval(p, vals) {
  let sum = ZERO;
  for (const t of p.terms.values()) {
    let term = t.coef;
    for (const v of Object.keys(t.vars)) {
      const val = vals[v];
      if (val === undefined) throw new Error(`חסר ערך למשתנה ${v}`);
      for (let i = 0; i < t.vars[v]; i++) term = rMul(term, val);
    }
    sum = rAdd(sum, term);
  }
  return sum;
}

// -------------------------------------------------------------- תוכן וחלק פרימיטיבי
/**
 * מפרק פולינום ל-content * primitive:
 * content = מקדם רציונלי משותף, primitive = פולינום עם מקדמים שלמים שה-gcd
 * שלהם 1 והמקדם המוביל חיובי. זה הבסיס להשוואת פירוקים "עד כדי קבוע".
 */
export function contentPrimitive(p) {
  if (isZeroPoly(p)) return { content: ZERO, primitive: pZero() };
  const terms = [...p.terms.values()];
  // מכנה משותף לכל המקדמים, ואז gcd של המונים
  let den = 1;
  for (const t of terms) den = lcm(den, t.coef.d);
  let num = 0;
  for (const t of terms) num = gcd(num, Math.abs(t.coef.n * (den / t.coef.d)));
  let content = rat(num, den);
  let primitive = pScale(p, rat(den, num));
  // נרמול סימן: המקדם של האיבר "הראשון" (לפי סדר קנוני) יהיה חיובי
  if (isNegative(leadingCoef(primitive))) {
    primitive = pNeg(primitive);
    content = rNeg(content);
  }
  return { content, primitive };
}

/**
 * סדר קנוני של איברים (graded lex): קודם דרגה כוללת יורדת, ובתוך אותה דרגה
 * לפי החזקות של המשתנים לפי סדר אלפביתי, מהגבוה לנמוך.
 * חשוב: x²+2xy+y² חייב להיות ממויין בדיוק כך כדי שזיהוי ריבוע שלם יעבוד.
 */
export function sortedTerms(p) {
  const vars = polyVars(p);
  const deg = (t) => Object.values(t.vars).reduce((s, e) => s + e, 0);
  return [...p.terms.values()].sort((a, b) => {
    const da = deg(a), db = deg(b);
    if (da !== db) return db - da;
    for (const v of vars) {
      const ea = a.vars[v] || 0, eb = b.vars[v] || 0;
      if (ea !== eb) return eb - ea;
    }
    return 0;
  });
}

export function leadingCoef(p) {
  const t = sortedTerms(p)[0];
  return t ? t.coef : ZERO;
}

/** מפתח קנוני לפולינום שלם - משמש להשוואת רב-קבוצות של גורמים. */
export function polyKey(p) {
  return sortedTerms(p)
    .map(t => `${ratToString(t.coef)}·${monoKey(t.vars)}`)
    .join('+') || '0';
}

// -------------------------------------------------------------- חילוק פולינומים
/**
 * חילוק ארוך לפי משתנה v. מחזיר {quotient, remainder} או null אם לא ניתן
 * (מקדם מוביל של המחלק אינו קבוע - מקרה שלא נדרש לנו).
 */
export function divideBy(p, divisor, v) {
  const dDeg = degreeIn(divisor, v);
  const dCoeffs = coeffsIn(divisor, v);
  const lead = dCoeffs[dDeg];
  if (!isConstPoly(lead)) return null;
  const leadVal = constValue(lead);
  let rem = p;
  let quo = pZero();
  let guard = 0;
  while (!isZeroPoly(rem) && degreeIn(rem, v) >= dDeg) {
    if (++guard > 200) return null;
    const rDeg = degreeIn(rem, v);
    const rCoeffs = coeffsIn(rem, v);
    const scaled = pScale(rCoeffs[rDeg], rDiv(ONE, leadVal));
    const shift = poly([{ coef: ONE, vars: { [v]: rDeg - dDeg } }]);
    const term = pMul(scaled, shift);
    quo = pAdd(quo, term);
    const next = pSub(rem, pMul(term, divisor));
    if (pEqual(next, rem)) return null; // אין התקדמות - הגנה מלולאה אינסופית
    rem = next;
  }
  return { quotient: quo, remainder: rem };
}

/** חילוק מדויק: מחזיר את המנה אם החלוקה היא ללא שארית, אחרת null. */
export function exactDivide(p, divisor) {
  if (isZeroPoly(divisor)) return null;
  const c = constValue(divisor);
  if (c !== null) return isZero(c) ? null : pScale(p, rDiv(ONE, c));
  for (const v of polyVars(divisor)) {
    const res = divideBy(p, divisor, v);
    if (res && isZeroPoly(res.remainder)) return res.quotient;
  }
  return null;
}

// -------------------------------------------------------------- פונקציה רציונלית
export const ratFunc = (num, den = pOne()) => ({ num, den });

export function rfAdd(a, b) {
  return ratFunc(pAdd(pMul(a.num, b.den), pMul(b.num, a.den)), pMul(a.den, b.den));
}
export function rfSub(a, b) {
  return ratFunc(pSub(pMul(a.num, b.den), pMul(b.num, a.den)), pMul(a.den, b.den));
}
export function rfMul(a, b) {
  return ratFunc(pMul(a.num, b.num), pMul(a.den, b.den));
}
export function rfDiv(a, b) {
  if (isZeroPoly(b.num)) throw new Error('חלוקה באפס');
  return ratFunc(pMul(a.num, b.den), pMul(a.den, b.num));
}
export function rfPow(a, k) {
  return ratFunc(pPow(a.num, k), pPow(a.den, k));
}
export const rfNeg = (a) => ratFunc(pNeg(a.num), a.den);

/** שקילות של שתי פונקציות רציונליות: הכפלה צולבת. */
export function rfEqual(a, b) {
  return isZeroPoly(pSub(pMul(a.num, b.den), pMul(b.num, a.den)));
}

export const rfIsPoly = (a) => isConstPoly(a.den) && !isZeroPoly(a.den);

/** אם הביטוי הוא פולינום - מחזיר אותו, אחרת null. */
export function rfToPoly(a) {
  if (!rfIsPoly(a)) return null;
  return pScale(a.num, rDiv(ONE, constValue(a.den)));
}
