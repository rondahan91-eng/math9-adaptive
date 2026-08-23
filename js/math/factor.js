// ==========================================================================
// factor.js - פירוק פולינומים לגורמים מעל הרציונליים
// ==========================================================================
// מכסה את התבניות שבתוכנית הלימודים של כיתה ט': גורם משותף, הפרש ריבועים,
// שלשה שהיא ריבוע שלם, טרינום ריבועי (כולל מקדם מוביל שונה מ-1), פירוק
// בקיבוץ, וטרינום הומוגני בשני משתנים.
//
// עיקרון חשוב לבדיקת תשובות: אנחנו *לא* מסתמכים על כך שהפירוק שלנו זהה
// לפירוק של התלמיד. תשובה מתקבלת אם (א) היא מתפרקת חזרה בדיוק לביטוי המקורי,
// (ב) היא במבנה של מכפלה, ו-(ג) אף גורם בה לא ניתן לפירוק נוסף. זו בדיקה
// נכונה מתמטית שלא פוסלת תשובות תקינות רק כי הן נכתבו אחרת.

import { rat, rMul, rDiv, rNeg, rEq, rSqrt, isZero, isOne, ONE, gcd } from './rational.js';
import {
  poly, pInt, pOne, pZero, pVar, pConst, pAdd, pSub, pMul, pNeg, pScale, pPow,
  pEqual, isZeroPoly, isConstPoly, constValue, polyVars, degreeIn, totalDegree,
  coeffsIn, contentPrimitive, sortedTerms, leadingCoef, polyKey, exactDivide,
} from './poly.js';

const MAX_DEPTH = 12;

// -------------------------------------------------------------- עזרים
/** אם q = k·prod, מחזיר את k. אחרת null. */
function ratio(q, prod) {
  if (isZeroPoly(prod)) return null;
  const k = rDiv(leadingCoef(q), leadingCoef(prod));
  return pEqual(q, pScale(prod, k)) ? k : null;
}

/** שורש ריבועי מדויק של פולינום, או null. */
export function polySqrt(p) {
  if (isZeroPoly(p)) return pZero();
  const terms = sortedTerms(p);
  if (terms.length === 1) {
    const t = terms[0];
    const c = rSqrt(t.coef);
    if (!c) return null;
    const vars = {};
    for (const v of Object.keys(t.vars)) {
      if (t.vars[v] % 2 !== 0) return null;
      vars[v] = t.vars[v] / 2;
    }
    return poly([{ coef: c, vars }]);
  }
  if (terms.length === 3) {
    const A = polySqrt(poly([terms[0]]));
    const C = polySqrt(poly([terms[2]]));
    if (!A || !C) return null;
    const middle = poly([terms[1]]);
    const cross = pScale(pMul(A, C), rat(2));
    if (pEqual(middle, cross)) return pAdd(A, C);
    if (pEqual(middle, pNeg(cross))) return pSub(A, C);
  }
  return null;
}

/** מפריד גורם משותף שהוא קבוע×חד-איבר: p = factor · rest. */
export function pullCommon(p) {
  if (isZeroPoly(p)) return { factor: pOne(), rest: pZero() };
  const { content, primitive } = contentPrimitive(p);
  const vars = polyVars(primitive);
  const mono = {};
  for (const v of vars) {
    let min = Infinity;
    for (const t of primitive.terms.values()) min = Math.min(min, t.vars[v] || 0);
    if (min > 0) mono[v] = min;
  }
  const factor = poly([{ coef: content, vars: mono }]);
  const rest = poly([...primitive.terms.values()].map(t => {
    const vs = { ...t.vars };
    for (const v of Object.keys(mono)) vs[v] -= mono[v];
    return { coef: t.coef, vars: vs };
  }));
  return { factor, rest };
}

// -------------------------------------------------------------- תבניות פירוק
/** הפרש ריבועים: a² - b² = (a-b)(a+b). עובד גם בשני משתנים (9x²-4y²). */
function tryDifferenceOfSquares(q) {
  const terms = sortedTerms(q);
  if (terms.length !== 2) return null;
  const [t1, t2] = terms;
  // צריך סימנים הפוכים
  if ((t1.coef.n > 0) === (t2.coef.n > 0)) return null;
  const pos = t1.coef.n > 0 ? t1 : t2;
  const neg = t1.coef.n > 0 ? t2 : t1;
  const a = polySqrt(poly([pos]));
  const b = polySqrt(poly([{ coef: rNeg(neg.coef), vars: neg.vars }]));
  if (!a || !b) return null;
  return [pSub(a, b), pAdd(a, b)];
}

/**
 * טרינום ריבועי במשתנה v (כולל המקרה ההומוגני בשני משתנים).
 * משתמש בזהות: 4a·q = (2av + B - S)(2av + B + S) כאשר S² = B² - 4aC.
 */
function tryQuadratic(q) {
  for (const v of polyVars(q)) {
    if (degreeIn(q, v) !== 2) continue;
    const c = coeffsIn(q, v); // c[0]=C, c[1]=B, c[2]=A
    const A = c[2], B = c[1], C = c[0];
    const a = constValue(A);
    if (a === null || isZero(a)) continue;
    const disc = pSub(pMul(B, B), pScale(pMul(A, C), rat(4)));
    const S = polySqrt(disc);
    if (!S) continue;
    const twoAv = poly([{ coef: rMul(rat(2), a), vars: { [v]: 1 } }]);
    const f1 = pAdd(pSub(twoAv, S), B);
    const f2 = pAdd(pAdd(twoAv, S), B);
    if (isZeroPoly(f1) || isZeroPoly(f2)) continue;
    return [f1, f2];
  }
  return null;
}

/** משפט השורש הרציונלי - מוציא גורם ליניארי מפולינום בחד-משתנה. */
function tryRationalRoot(q) {
  const vars = polyVars(q);
  if (vars.length !== 1) return null;
  const v = vars[0];
  const deg = degreeIn(q, v);
  if (deg < 2) return null;
  const c = coeffsIn(q, v);
  const a0 = constValue(c[0]);
  const ad = constValue(c[deg]);
  if (a0 === null || ad === null || isZero(a0)) return null;
  for (const num of divisors(Math.abs(a0.n))) {
    for (const den of divisors(Math.abs(ad.n))) {
      for (const sign of [1, -1]) {
        const root = rat(sign * num, den);
        // (den·v - sign·num) הוא גורם אם השורש מאפס את הפולינום
        const linear = poly([
          { coef: rat(den), vars: { [v]: 1 } },
          { coef: rat(-sign * num), vars: {} },
        ]);
        const quotient = exactDivide(q, linear);
        if (quotient && !isZeroPoly(quotient) && totalDegree(quotient) < totalDegree(q)) {
          return [linear, quotient];
        }
      }
    }
  }
  return null;
}

function divisors(n) {
  if (n === 0) return [1];
  const out = [];
  for (let i = 1; i <= Math.abs(n); i++) if (n % i === 0) out.push(i);
  return out;
}

/** פירוק בקיבוץ: ax + ay + bx + by = (a+b)(x+y). */
function tryGrouping(q) {
  const terms = sortedTerms(q);
  if (terms.length !== 4) return null;
  for (const [i, j] of [[0, 1], [0, 2], [0, 3]]) {
    const g1 = poly([terms[i], terms[j]]);
    const g2 = poly(terms.filter((_, k) => k !== i && k !== j));
    const p1 = pullCommon(g1);
    const p2 = pullCommon(g2);
    if (isConstPoly(p1.rest) || isConstPoly(p2.rest)) continue;
    if (pEqual(p1.rest, p2.rest)) {
      return [pAdd(p1.factor, p2.factor), p1.rest];
    }
    if (pEqual(p1.rest, pNeg(p2.rest))) {
      return [pSub(p1.factor, p2.factor), p1.rest];
    }
  }
  return null;
}

const PATTERNS = [tryDifferenceOfSquares, tryQuadratic, tryGrouping, tryRationalRoot];

// -------------------------------------------------------------- הפירוק המלא
/**
 * מפרק פולינום לגורמים.
 * @returns {{constant: Object, factors: Array}} כך ש-p = constant · Π factors.
 *          כל factor פרימיטיבי (gcd מקדמים 1, מקדם מוביל חיובי) ואי-פריק.
 */
export function factorPoly(p, depth = 0) {
  if (isZeroPoly(p)) return { constant: rat(0), factors: [] };
  const { content, primitive } = contentPrimitive(p);
  if (isConstPoly(primitive)) return { constant: content, factors: [] };
  if (depth > MAX_DEPTH) return { constant: content, factors: [primitive] };

  // 1. הוצאת חד-איבר משותף (x², xy וכו') - כל משתנה נשמר כגורם נפרד
  const { factor: mono, rest } = pullCommon(primitive);
  let constant = content;
  const factors = [];
  const monoTerm = [...mono.terms.values()][0];
  if (monoTerm) {
    constant = rMul(constant, monoTerm.coef);
    for (const v of Object.keys(monoTerm.vars).sort()) {
      for (let i = 0; i < monoTerm.vars[v]; i++) factors.push(pVar(v));
    }
  }
  if (isConstPoly(rest)) {
    const rc = constValue(rest);
    return { constant: rMul(constant, rc), factors };
  }

  // 2. ניסיון תבניות
  const sub = factorIrreducibleCandidate(rest, depth);
  return { constant: rMul(constant, sub.constant), factors: [...factors, ...sub.factors] };
}

function factorIrreducibleCandidate(q, depth) {
  if (totalDegree(q) <= 1) return { constant: ONE, factors: [q] };
  for (const pattern of PATTERNS) {
    const parts = pattern(q);
    if (!parts || parts.length < 2) continue;
    // הגנה מלולאה: כל גורם חייב להיות בדרגה נמוכה יותר מהמקורי
    if (parts.some(f => totalDegree(f) >= totalDegree(q) || totalDegree(f) < 1)) continue;
    let product = pOne();
    for (const f of parts) product = pMul(product, f);
    const k = ratio(q, product);
    if (k === null) continue;
    let constant = k;
    const factors = [];
    for (const f of parts) {
      const sub = factorPoly(f, depth + 1);
      constant = rMul(constant, sub.constant);
      factors.push(...sub.factors);
    }
    return { constant, factors };
  }
  return { constant: ONE, factors: [q] };
}

/**
 * האם הפולינום אי-פריק *ובצורתו הסופית* - כלומר גם אין בו גורם מספרי משותף
 * שאפשר להוציא (4x+2 אינו "מפורק עד הסוף", התשובה היא 2(2x+1)).
 */
export function isFullyReduced(p) {
  if (isConstPoly(p)) return true;
  const { content, primitive } = contentPrimitive(p);
  if (!isOne(content) && !rEq(content, rat(-1))) return false;
  const res = factorPoly(primitive);
  return res.factors.length === 1 && pEqual(res.factors[0], primitive);
}

/** מפתח קנוני לרב-קבוצת גורמים - להשוואה בין פירוקים. */
export function factorsKey(factors) {
  return factors.map(polyKey).sort().join(' | ');
}
