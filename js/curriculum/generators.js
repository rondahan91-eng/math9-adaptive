// ==========================================================================
// generators.js - גנרטורים פרמטריים לתרגילים
// ==========================================================================
// כל תרגיל נוצר בקוד דטרמיניסטי מתוך seed, ולכן:
//   * התשובה הנכונה ידועה בוודאות (אין "אולי המודל טעה")
//   * אפשר לחשב מראש בדיוק מה יענה תלמיד עם כל תפיסה מוטעית
//   * אותו seed מייצר את אותו תרגיל - מורה יכולה לשחזר מה תלמיד ראה
//
// ה-AI לא מייצר תרגילים ולא בודק תשובות. הוא רק מסביר.

import { evalPoly, evalExpr } from '../math/evaluate.js';
import { rat, gcd, rDiv, rNeg, isZero, ratToString } from '../math/rational.js';
import {
  pSub, polyToText, coeffsIn, degreeIn, constValue, ratFunc, pOne, rfEqual, leadingCoef,
} from '../math/poly.js';

// -------------------------------------------------------------- אקראיות עם seed
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const coin = (rng) => (rng() < 0.5 ? -1 : 1);

/**
 * מגריל זוג מספרים זרים. קריטי לתרגילי פירוק: אם ל-a ול-b יש גורם משותף,
 * ה"תשובה" שהגנרטור מכריז עליה אינה מפורקת עד הסוף. למשל 16x²−64 מתפרק
 * ל-16(x−2)(x+2) ולא ל-(4x−8)(4x+8).
 */
function coprimePair(rng, loA, hiA, loB, hiB) {
  for (let i = 0; i < 60; i++) {
    const a = ri(rng, loA, hiA), b = ri(rng, loB, hiB);
    if (gcd(a, b) === 1) return [a, b];
  }
  return [1, ri(rng, loB, hiB)];
}

// -------------------------------------------------------------- בניית מחרוזות
function termStr(coef, varName, exp) {
  if (coef === 0) return '0';
  if (!varName || exp === 0) return String(coef);
  let head = coef === 1 ? '' : coef === -1 ? '-' : String(coef);
  return `${head}${varName}${exp > 1 ? '^' + exp : ''}`;
}

/** terms: [{c, v, e}] -> "4x^2 - 12x + 9" */
function polyStr(terms) {
  let out = '';
  for (const t of terms) {
    if (t.c === 0) continue;
    const piece = termStr(Math.abs(t.c), t.v, t.e);
    if (!out) out = (t.c < 0 ? '-' : '') + piece;
    else out += (t.c < 0 ? ' - ' : ' + ') + piece;
  }
  return out || '0';
}

/** "(x + 3)" / "(x - 3)" / "(2x + 3)" */
function binomStr(a, varName, b) {
  const left = termStr(a, varName, 1);
  const sign = b < 0 ? ' - ' : ' + ';
  return `(${left}${sign}${Math.abs(b)})`;
}

const ex = (o) => ({ wrongs: [], vars: ['x'], ...o });

// -------------------------------------------------------------- נוסחאות הכפל המקוצר
// סולם הקושי נגזר משני דפי עבודה של כיתה ט' - רמה ב' ורמה א'. כל רמה מוסיפה
// מכשול אחד בדיוק, בסדר שבו הוא מופיע שם:
//   1 מונום פשוט · 2 מקדם · 3 סדר הפוך, חזקות ושני משתנים ·
//   4 שברים והופכיים · 5 הרכבה של שתי נוסחאות וכינוס איברים.
// רמה 5 היא בדיוק מה שדף רמה א' דורש, ולכן היא התקרה של המיומנות.

const VARS = ['x', 'a', 'b', 'y', 'c'];
const pickVar = (rng) => pick(rng, VARS);

/**
 * שני משתנים שונים, תמיד בסדר אלפביתי. הסדר אינו קוסמטי: הצורה הקנונית של
 * הפולינום ממיינת לפי שם המשתנה, ולכן (6b+5a)(6b−5a) היה מודפס כ-
 * "−25a² + 36b²" - נכון, אבל לא מה שתלמיד/ה כותב/ת. כשהחצי הראשון מחזיק את
 * האות המוקדמת יותר, האיבר המוביל תמיד חיובי.
 */
function twoVars(rng) {
  const v = pickVar(rng);
  const w = pick(rng, VARS.filter(u => u !== v));
  return v < w ? [v, w] : [w, v];
}

/** תשובה שגויה חזויה, מחושבת מתוך הביטוי שתלמיד עם התפיסה הזו היה כותב. */
const wrong = (id, text) => ({ id, rf: evalExpr(text) });

/**
 * האם החצי הוא חד-איבר פשוט כמו x, 3x או 3x². רק במקרה הזה יש משמעות
 * ל"לא העלית את המקדם בריבוע": ל-x/4 אין מקדם נפרד שאפשר לשכוח לרבע,
 * ו-"x/4^2" היה יוצר תשובה שגויה שאף תלמיד לא כותב.
 */
const isMonomial = (s) => /^-?\d*[a-z](\^\d+)?$/.test(s);

/**
 * שני ה"חצאים" A ו-B שנכנסים לנוסחה. מוחזרים כמחרוזות כדי שגם התרגיל וגם
 * כל תשובה שגויה חזויה ייבנו מאותם רכיבים ויחושבו במנוע - ולא יורכבו ביד.
 */
function halves(rng, level) {
  const v = pickVar(rng);
  if (level <= 1) return { A: v, B: String(ri(rng, 2, 12)) };
  if (level === 2) return { A: termStr(ri(rng, 2, 9), v, 1), B: String(ri(rng, 2, 12)) };
  if (level === 3) {
    switch (pick(rng, ['power', 'twovar', 'swap'])) {
      case 'power':
        return { A: termStr(ri(rng, 1, 5), v, pick(rng, [2, 3])), B: String(ri(rng, 2, 9)) };
      case 'twovar': {
        const [first, second] = twoVars(rng);
        return { A: termStr(ri(rng, 2, 6), first, 1), B: termStr(ri(rng, 2, 6), second, 1) };
      }
      default:
        // (8 + x)(x − 8): הסדר בין הסוגריים הפוך, והתשובה עדיין x² − 64
        return { A: termStr(ri(rng, 2, 9), v, 1), B: String(ri(rng, 2, 12)), swap: true };
    }
  }
  switch (pick(rng, ['frac', 'frac2', 'recip'])) {
    case 'frac':  return { A: `${v}/${ri(rng, 2, 10)}`, B: String(ri(rng, 2, 9)) };
    case 'frac2': return { A: `${v}/${ri(rng, 2, 8)}`, B: `${ri(rng, 2, 7)}/${ri(rng, 2, 9)}` };
    default: {
      // (2a + 1/(2a))²: המכפלה הכפולה מצטמצמת בדיוק ל-2, וזו כל הפואנטה
      const k = ri(rng, 1, 5);
      return {
        A: termStr(k, v, 1),
        B: k === 1 ? `1/${v}` : `1/(${k}${v})`,
        recip: true, k, v,
      };
    }
  }
}

/** התשובה לצורת ההופכי, בכתיב שתלמיד/ה באמת כותב/ת (ולא כשבר אחד גדול). */
function recipAnswer(h, kind) {
  const k2 = h.k * h.k;
  const sq = k2 === 1 ? `${h.v}^2` : `${k2}${h.v}^2`;
  const inv = k2 === 1 ? `1/${h.v}^2` : `1/(${k2}${h.v}^2)`;
  if (kind === 'sum')  return `${sq} + 2 + ${inv}`;
  if (kind === 'diff') return `${sq} - 2 + ${inv}`;
  return `${sq} - ${inv}`;
}

const SHORTCUT_PROMPT = 'פתחו את הסוגריים לפי נוסחת הכפל המקוצר:';
const COLLECT_PROMPT = 'פתחו את הסוגריים וכנסו איברים דומים:';

/** אותו ריבוע כפי שכותב אותו מי ששכח את האיבר האמצעי. */
const flatSquare = (v, n) => `((${v})^2 + ${n}^2)`;

/**
 * רמה 5 של ריבוע סכום/הפרש: הנוסחה יושבת בתוך ביטוי גדול יותר וצריך גם
 * לכנס איברים דומים. זו בדיוק שאלה 12 בדף רמה א'.
 */
function squareCombo(rng, sign) {
  const v = pickVar(rng);
  const b = ri(rng, 2, 9);
  let c = ri(rng, 2, 9);
  while (c === b) c = ri(rng, 2, 9);
  const sq = (n) => `(${v} ${sign} ${n})^2`;

  let exprText, wrongs;
  switch (pick(rng, ['scaled', 'minusmono', 'withdiff'])) {
    case 'scaled': {
      const k = ri(rng, 2, 5), m = ri(rng, 2, 5);
      exprText = `${k}${sq(b)} - ${m}${sq(c)}`;
      wrongs = [wrong('sq-no-middle', `${k}${flatSquare(v, b)} - ${m}${flatSquare(v, c)}`)];
      break;
    }
    case 'minusmono': {
      const k = ri(rng, 2, 12);
      exprText = `${sq(b)} - ${k}${v}`;
      wrongs = [wrong('sq-no-middle', `${flatSquare(v, b)} - ${k}${v}`)];
      break;
    }
    default: {
      exprText = `${sq(b)} + (${v} + ${c})(${v} - ${c})`;
      wrongs = [
        wrong('sq-no-middle', `${flatSquare(v, b)} + (${v} + ${c})(${v} - ${c})`),
        wrong('sum-of-squares', `${sq(b)} + ${flatSquare(v, c)}`),
      ];
      break;
    }
  }
  return ex({
    prompt: COLLECT_PROMPT,
    exprText,
    mode: 'expand',
    target: evalPoly(exprText),
    answerText: polyToText(evalPoly(exprText)),
    rule: sign === '+'
      ? '(a + b)² = a² + 2ab + b². פותחים כל ריבוע בנפרד, ורק אחר כך מכנסים.'
      : '(a − b)² = a² − 2ab + b². פותחים כל ריבוע בנפרד, ורק אחר כך מכנסים.',
    wrongs,
  });
}

/** רמה 5 של מכפלת סכום בהפרש - אותו רעיון, עם הנוסחה השנייה. */
function diffSquaresCombo(rng) {
  const v = pickVar(rng);
  const b = ri(rng, 2, 9);
  let c = ri(rng, 2, 9);
  while (c === b) c = ri(rng, 2, 9);
  const ds = (n) => `(${v} + ${n})(${v} - ${n})`;

  let exprText, wrongs;
  switch (pick(rng, ['scaled', 'minusmono', 'withsquare'])) {
    case 'scaled': {
      const k = ri(rng, 2, 5), m = ri(rng, 2, 5);
      exprText = `${k}${ds(b)} - ${m}${ds(c)}`;
      wrongs = [wrong('sum-of-squares', `${k}${flatSquare(v, b)} - ${m}${flatSquare(v, c)}`)];
      break;
    }
    case 'minusmono': {
      const k = ri(rng, 2, 9);
      exprText = `${ds(b)} - ${v}(${v} + ${k})`;
      wrongs = [wrong('sum-of-squares', `${flatSquare(v, b)} - ${v}(${v} + ${k})`)];
      break;
    }
    default: {
      exprText = `${ds(b)} + (${v} + ${c})^2`;
      wrongs = [
        wrong('sum-of-squares', `${flatSquare(v, b)} + (${v} + ${c})^2`),
        wrong('sq-no-middle', `${ds(b)} + ${flatSquare(v, c)}`),
      ];
      break;
    }
  }
  return ex({
    prompt: COLLECT_PROMPT,
    exprText,
    mode: 'expand',
    target: evalPoly(exprText),
    answerText: polyToText(evalPoly(exprText)),
    rule: '(a − b)(a + b) = a² − b². פותחים כל מכפלה בנפרד, ורק אחר כך מכנסים.',
    wrongs,
  });
}

/**
 * פתרון המשוואה lhs = rhs, אבל רק אם אחרי הצמצום היא באמת לינארית עם פתרון
 * שלם. הגנרטור מגריל צורות ומשתמש בזה כמסננת, במקום לסמוך על אלגברה שנעשתה
 * בראש - כך אי אפשר לייצר משוואה שהתשובה המוצהרת שלה שגויה.
 */
function linearRoot(lhs, rhs, v) {
  const d = pSub(evalPoly(lhs), evalPoly(rhs));
  if (degreeIn(d, v) !== 1) return null;
  const cs = coeffsIn(d, v);
  const a = cs[1] ? constValue(cs[1]) : null;
  const b = cs[0] ? constValue(cs[0]) : rat(0);
  if (a === null || b === null || isZero(a)) return null;
  const r = rDiv(rNeg(b), a);
  // רק פתרון שלם, ובסדר גודל שאפשר לבדוק בראש - פתרון כמו 4137 נכון
  // מתמטית אבל רק מסמן לתלמיד/ה שכנראה טעו
  return r.d === 1 && Math.abs(r.n) <= 120 ? r : null;
}

// -------------------------------------------------------------- הגנרטורים
export const GENERATORS = {

  'monomial-mult'(rng, level) {
    // נמנעים ממקרים מנוונים שבהם הטעות מייצרת במקרה את התשובה הנכונה:
    // 2+2 = 2·2, וגם 2+2 = 2·2 במעריכים.
    let a, b, m, n;
    do {
      a = ri(rng, 2, 7); b = ri(rng, 2, 7);
      m = level >= 2 ? ri(rng, 2, 3) : 1;
      n = ri(rng, 1, 3);
    } while (a + b === a * b || m + n === m * n);
    const expr = `${termStr(a, 'x', m)} * ${termStr(b, 'x', n)}`;
    return ex({
      prompt: 'כפלו את החד-איברים:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(`${a * b}x^${m + n}`),
      answerText: termStr(a * b, 'x', m + n),
      rule: 'בכפל חזקות של אותו בסיס מחברים את המעריכים, ואת המקדמים מכפילים.',
      wrongs: [
        { id: 'coef-add-instead-mul', poly: evalPoly(`${a + b}x^${m + n}`) },
        { id: 'exp-mul-instead-add', poly: evalPoly(`${a * b}x^${m * n}`) },
      ],
    });
  },

  'distribute-mono'(rng, level) {
    const a = ri(rng, 2, 6) * (level >= 3 ? coin(rng) : 1);
    const k = level >= 2 ? ri(rng, 1, 2) : 1;
    const b = ri(rng, 2, 6), c = ri(rng, 2, 9) * (level >= 2 ? coin(rng) : 1);
    const inner = `${termStr(b, 'x', 1)}${c < 0 ? ' - ' : ' + '}${Math.abs(c)}`;
    const expr = `${termStr(a, 'x', k)}(${inner})`;
    return ex({
      prompt: 'פתחו את הסוגריים:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(expr),
      answerText: polyStr([{ c: a * b, v: 'x', e: k + 1 }, { c: a * c, v: 'x', e: k }]),
      rule: 'חוק הפילוג: מכפילים את הגורם שמחוץ לסוגריים בכל אחד מהאיברים שבתוכם.',
      wrongs: [
        { id: 'distribute-first-only', poly: evalPoly(polyStr([{ c: a * b, v: 'x', e: k + 1 }, { c, v: '', e: 0 }])) },
        { id: 'distribute-sign', poly: evalPoly(polyStr([{ c: a * b, v: 'x', e: k + 1 }, { c: -a * c, v: 'x', e: k }])) },
      ],
    });
  },

  'distribute-binom'(rng, level) {
    const a = level >= 3 ? ri(rng, 2, 4) : 1;
    const c = level >= 2 ? ri(rng, 2, 3) : 1;
    const b = ri(rng, 1, 7) * coin(rng);
    const d = ri(rng, 1, 7) * coin(rng);
    const expr = `${binomStr(a, 'x', b)}${binomStr(c, 'x', d)}`;
    return ex({
      prompt: 'פתחו את הסוגריים:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(expr),
      answerText: polyStr([{ c: a * c, v: 'x', e: 2 }, { c: a * d + b * c, v: 'x', e: 1 }, { c: b * d, v: '', e: 0 }]),
      rule: 'כל איבר בסוגריים הראשונים מוכפל בכל איבר בסוגריים השניים - ארבע מכפלות.',
      wrongs: [
        { id: 'first-last-only', poly: evalPoly(polyStr([{ c: a * c, v: 'x', e: 2 }, { c: b * d, v: '', e: 0 }])) },
      ],
    });
  },

  'sq-sum'(rng, level) {
    if (level >= 5) return squareCombo(rng, '+');
    const h = halves(rng, level);
    const exprText = `(${h.A} + ${h.B})^2`;
    return ex({
      prompt: SHORTCUT_PROMPT,
      exprText,
      mode: 'expand',
      target: evalExpr(exprText),
      answerText: h.recip ? recipAnswer(h, 'sum') : polyToText(evalPoly(exprText)),
      rule: '(a + b)² = a² + 2ab + b²',
      wrongs: [
        wrong('sq-no-middle', `(${h.A})^2 + (${h.B})^2`),
        wrong('sq-middle-no-two', `(${h.A})^2 + (${h.A})(${h.B}) + (${h.B})^2`),
        ...(isMonomial(h.A)
          ? [wrong('sq-coef-not-squared', `${h.A}^2 + 2(${h.A})(${h.B}) + (${h.B})^2`)]
          : []),
      ],
    });
  },

  'sq-diff'(rng, level) {
    if (level >= 5) return squareCombo(rng, '-');
    const h = halves(rng, level);
    const exprText = `(${h.A} - ${h.B})^2`;
    return ex({
      prompt: SHORTCUT_PROMPT,
      exprText,
      mode: 'expand',
      target: evalExpr(exprText),
      answerText: h.recip ? recipAnswer(h, 'diff') : polyToText(evalPoly(exprText)),
      rule: '(a − b)² = a² − 2ab + b²',
      wrongs: [
        wrong('sq-no-middle', `(${h.A})^2 + (${h.B})^2`),
        wrong('sq-diff-sign-b2', `(${h.A})^2 - 2(${h.A})(${h.B}) - (${h.B})^2`),
        wrong('sq-diff-middle-sign', `(${h.A})^2 + 2(${h.A})(${h.B}) + (${h.B})^2`),
      ],
    });
  },

  'diff-squares-expand'(rng, level) {
    if (level >= 5) return diffSquaresCombo(rng);
    const h = halves(rng, level);
    // (8 + x)(x − 8) הוא אותו תרגיל בדיוק, רק שהסדר בין הסוגריים מבלבל
    const exprText = h.swap
      ? `(${h.B} + ${h.A})(${h.A} - ${h.B})`
      : `(${h.A} + ${h.B})(${h.A} - ${h.B})`;
    const wrongs = [
      wrong('confuse-square-with-diff', `(${h.A} - ${h.B})^2`),
      wrong('sum-of-squares', `(${h.A})^2 + (${h.B})^2`),
    ];
    if (h.swap) wrongs.push(wrong('order-trap-sign', `(${h.B})^2 - (${h.A})^2`));
    return ex({
      prompt: SHORTCUT_PROMPT,
      exprText,
      mode: 'expand',
      target: evalExpr(exprText),
      answerText: h.recip ? recipAnswer(h, 'both') : polyToText(evalPoly(exprText)),
      rule: '(a − b)(a + b) = a² − b². הסדר שבו הסוגריים כתובים אינו משנה את התוצאה.',
      wrongs,
    });
  },

  // ---------------------------------------------------------- חישוב בראש
  // הנוסחה אינה רק מניפולציה אלגברית - היא כלי חישוב. 104·96 בראש זה
  // (100+4)(100−4) = 10000 − 16. מופיע בשני דפי העבודה, בשתי הרמות.
  'mental-mult'(rng, level) {
    const ask = 'חשבו ללא מחשבון, בעזרת נוסחאות הכפל המקוצר:';

    if (level >= 5) {
      const c = pick(rng, [50, 60, 70, 80, 90, 100]);
      const d = ri(rng, 2, 9);
      const hi = c + d, lo = c - d;
      const value = hi * hi - lo * lo;
      return ex({
        prompt: ask,
        exprText: `${hi}^2 - ${lo}^2`,
        mode: 'equivalent',
        target: evalPoly(String(value)),
        answerText: String(value),
        solutionText: `${hi}^2 - ${lo}^2 = (${hi} - ${lo})(${hi} + ${lo}) = ${hi - lo} · ${hi + lo} = ${value}`,
        rule: 'a² − b² = (a − b)(a + b). הפרש של שני ריבועים הוא מכפלת ההפרש בסכום.',
        wrongs: [wrong('diff-subtract-first', String((hi - lo) * (hi - lo)))],
      });
    }

    let c, d, square;
    if (level <= 1)      { c = ri(rng, 2, 9) * 10; d = ri(rng, 1, 3); square = false; }
    else if (level === 2){ c = pick(rng, [100, 1000]); d = ri(rng, 2, 9); square = false; }
    else if (level === 3){ c = ri(rng, 2, 9) * 10; d = ri(rng, 1, 3); square = true; }
    else if (rng() < 0.5){ c = ri(rng, 3, 9) * 10; d = ri(rng, 4, 9); square = false; }
    else                 { c = pick(rng, [100, 200]); d = ri(rng, 2, 6); square = true; }

    if (square) {
      const s = coin(rng);
      const n = c + s * d;
      const value = n * n;
      return ex({
        prompt: ask,
        exprText: `${n}^2`,
        mode: 'equivalent',
        target: evalPoly(String(value)),
        answerText: String(value),
        solutionText: `${n}^2 = (${c} ${s > 0 ? '+' : '−'} ${d})^2 = ${c * c} ${s > 0 ? '+' : '−'} ${2 * c * d} + ${d * d} = ${value}`,
        rule: '(a ± b)² = a² ± 2ab + b². בוחרים a עגול, ו-b קטן.',
        wrongs: [wrong('sq-no-middle', String(c * c + d * d))],
      });
    }

    const value = c * c - d * d;
    return ex({
      prompt: ask,
      exprText: `${c + d} · ${c - d}`,
      mode: 'equivalent',
      target: evalPoly(String(value)),
      answerText: String(value),
      solutionText: `${c + d} · ${c - d} = (${c} + ${d})(${c} - ${d}) = ${c * c} - ${d * d} = ${value}`,
      rule: '(a + b)(a − b) = a² − b². מחפשים את המספר העגול שנמצא בדיוק באמצע בין השניים.',
      wrongs: [wrong('sum-of-squares', String(c * c + d * d))],
    });
  },

  // ---------------------------------------------------------- השלמת זהות
  // הכיוון ההפוך. תלמיד ששינן נוסחה ולא הבין אותה פותח סוגריים בלי בעיה
  // ונתקע כאן, ולכן זו השאלה המאבחנת ביותר ביחידה.
  'complete-identity'(rng, level) {
    const numeric = (s) => /^\d+$/.test(s);
    const build = (exprText, answerText, extra = []) => ex({
      prompt: 'השלימו את המקום החסר (כל ה-? מייצגים את אותו ביטוי):',
      exprText,
      mode: 'equivalent',
      target: evalExpr(answerText),
      answerText,
      rule: 'באיבר האמצעי יש תמיד פי 2 ממכפלת שני החצאים, והאיבר האחרון הוא ריבוע החצי השני.',
      wrongs: extra,
    });

    if (level >= 5) {
      const v = pickVar(rng);
      const k = ri(rng, 2, 6), b = ri(rng, 2, 9);
      const head = termStr(k, v, 1);
      return build(
        `(${head} + ?)^2 - (${head} - ?)^2 = ${termStr(4 * k * b, v, 1)}`,
        String(b),
        [wrong('complete-uses-middle-term', String(4 * k * b))],
      );
    }

    const h = halves(rng, Math.min(4, level));

    if (h.recip) {
      return build(
        `(${h.A} + ?)^2 = ${recipAnswer(h, 'sum')}`,
        h.B,
        [wrong('complete-uses-middle-term', '2')],
      );
    }

    // הכיוון מתחלף בין הרמות: ברמה 1 חסר האיבר החופשי, ומשם והלאה חסר דווקא
    // החלק שנושא את המשתנה - החצי שדורש לזהות שורש של מקדם.
    const blankIsB = level <= 1;
    const known = blankIsB ? h.A : h.B;
    const answerText = blankIsB ? h.B : h.A;

    const wrongs = [];
    if (numeric(answerText)) {
      const b = Number(answerText);
      // מי שלוקח את האיבר האמצעי כמו שהוא כותב את *המקדם* שלו, לא את הביטוי
      const middleCoef = leadingCoef(evalPoly(`2(${h.A})(${h.B})`));
      wrongs.push(wrong('complete-uses-middle-term', ratToString(middleCoef)));
      wrongs.push(wrong('complete-uses-constant', String(b * b)));
    } else if (isMonomial(answerText)) {
      wrongs.push(wrong('complete-coef-squared', `(${answerText})^2`));
    }

    if (level === 3) {
      // מכפלת סכום בהפרש: אותו ? מופיע בשני הסוגריים
      const expansion = polyToText(evalPoly(`(${h.A} + ${h.B})(${h.A} - ${h.B})`));
      return build(`(? + ${h.B})(? - ${h.B}) = ${expansion}`, answerText, wrongs);
    }

    const expansion = polyToText(evalPoly(`(${h.A} + ${h.B})^2`));
    return build(
      blankIsB ? `(${known} + ?)^2 = ${expansion}` : `(? + ${known})^2 = ${expansion}`,
      answerText,
      wrongs,
    );
  },

  // ---------------------------------------------------------- משוואות
  // כשפותחים את הריבועים איבר ה-x² מצטמצם, ונשארת משוואה לינארית פשוטה.
  // תלמיד ששכח את האיבר האמצעי מקבל משוואה אחרת לגמרי - ולכן פתרון שגוי
  // כאן הוא אבחון חד במיוחד.
  'shortcut-equations'(rng, level) {
    const v = 'x';
    for (let tries = 0; tries < 200; tries++) {
      const p = ri(rng, 2, 10), q = ri(rng, 2, 10);
      const k = ri(rng, 2, 12), m = ri(rng, 1, 9), c = ri(rng, 2, 40) * coin(rng);
      const plusC = c < 0 ? `- ${-c}` : `+ ${c}`;   // ולא "+ -21"
      let lhs, rhs, lhsFlat, rhsFlat;

      switch (Math.min(5, Math.max(1, level))) {
        case 1:
          lhs = `(${v} + ${p})(${v} - ${p})`;   lhsFlat = flatSquare(v, p);
          rhs = `${v}(${v} + ${m}) ${plusC}`;    rhsFlat = rhs;
          break;
        case 2:
          lhs = `(${v} + ${p})^2`;               lhsFlat = flatSquare(v, p);
          rhs = `${v}^2 ${plusC}`;               rhsFlat = rhs;
          break;
        case 3:
          lhs = `(${v} + ${p})^2 - ${k}${v}`;    lhsFlat = `${flatSquare(v, p)} - ${k}${v}`;
          rhs = `${v}(${v} + ${m})`;             rhsFlat = rhs;
          break;
        case 4:
          lhs = `(${v} - ${p})^2`;               lhsFlat = flatSquare(v, p);
          rhs = `(${v} + ${q})^2`;               rhsFlat = flatSquare(v, q);
          break;
        default:
          lhs = `(${p} - ${v})^2 + (${q} + ${v})^2`;
          lhsFlat = `${flatSquare(v, p)} + ${flatSquare(v, q)}`;
          rhs = `2${v}(${v} - ${m}) + ${k}${v}`; rhsFlat = rhs;
          break;
      }

      const root = linearRoot(lhs, rhs, v);
      if (root === null) continue;

      const wrongs = [];
      const flatRoot = linearRoot(lhsFlat, rhsFlat, v);
      if (flatRoot !== null && flatRoot.n !== root.n) {
        wrongs.push({ id: 'sq-no-middle', roots: [flatRoot] });
      }

      return ex({
        prompt: 'פתרו את המשוואה:',
        exprText: `${lhs} = ${rhs}`,
        mode: 'roots',
        target: [root],
        answerText: `x = ${root.n}`,
        rule: 'פותחים את שני האגפים לפי הנוסחאות. איבר ה-x² מצטמצם, ונשארת משוואה פשוטה.',
        wrongs,
      });
    }
    // לא אמור לקרות: 200 הגרלות בלי משוואה לינארית עם פתרון שלם
    throw new Error('לא נמצאה משוואה מתאימה');
  },

  // ---------------------------------------------------------- זהויות סימטריות
  // נתון a²+b² ו-ab, וצריך את (a+b)² - בלי למצוא את a ואת b עצמם.
  // זה השיא של דף רמה א' (שאלות 14–17): שימוש בנוסחה כזהות, לא כמתכון.
  'symmetric-values'(rng, level) {
    const build = (given, question, value, wrongs, how) => ex({
      prompt: question,
      exprText: given,
      mode: 'equivalent',
      target: evalPoly(String(value)),
      answerText: String(value),
      solutionText: how,
      rule: '(a + b)² = a² + 2ab + b² ו-(a − b)² = a² − 2ab + b². משתי אלה נובע שכל אחד מהשלושה נקבע ע"י שני האחרים.',
      wrongs,
    });

    const P = ri(rng, 2, 8) * ri(rng, 2, 6);         // ab
    const S = 2 * P + ri(rng, 1, 6) * ri(rng, 2, 8); // a²+b², תמיד ≥ 2ab

    if (level <= 1) {
      return build(`a^2 + b^2 = ${S} ,  ab = ${P}`, 'חשבו את (a+b)^2 :', S + 2 * P,
        [wrong('symmetric-forgot-double', String(S + P))],
        `(a + b)^2 = a^2 + b^2 + 2ab = ${S} + 2 · ${P} = ${S + 2 * P}`);
    }
    if (level === 2) {
      return build(`a^2 + b^2 = ${S} ,  ab = ${P}`, 'חשבו את (a−b)^2 :', S - 2 * P,
        [wrong('symmetric-wrong-sign', String(S + 2 * P))],
        `(a − b)^2 = a^2 + b^2 − 2ab = ${S} − 2 · ${P} = ${S - 2 * P}`);
    }
    if (level === 3) {
      const d = ri(rng, 2, 9), sum = ri(rng, 2, 15);
      return build(`a − b = ${d} ,  a^2 − b^2 = ${d * sum}`, 'חשבו את a+b :', sum,
        [wrong('symmetric-subtract-not-divide', String(d * sum - d))],
        `a^2 − b^2 = (a − b)(a + b), ולכן a + b = ${d * sum} : ${d} = ${sum}`);
    }
    if (level === 4) {
      const Q = S + 2 * P;
      return build(`(a+b)^2 = ${Q} ,  ab = ${P}`, 'חשבו את a^2 + b^2 :', Q - 2 * P,
        [wrong('symmetric-forgot-double', String(Q - P))],
        `a^2 + b^2 = (a + b)^2 − 2ab = ${Q} − 2 · ${P} = ${Q - 2 * P}`);
    }
    const s = ri(rng, 5, 20);
    const P5 = ri(rng, 1, Math.floor((s * s) / 4));
    return build(`a + b = ${s} ,  ab = ${P5}`, 'חשבו את (a−b)^2 :', s * s - 4 * P5,
      [wrong('symmetric-forgot-double', String(s * s - 2 * P5))],
      `(a − b)^2 = (a + b)^2 − 4ab = ${s * s} − 4 · ${P5} = ${s * s - 4 * P5}`);
  },

  'factor-common'(rng, level) {
    const g = ri(rng, 2, 6);
    const k = level >= 2 ? ri(rng, 1, 2) : 1;
    // a ו-b חייבים להיות זרים, אחרת g אינו הגורם המשותף *הגדול ביותר*
    // והתשובה שנכריז עליה לא תהיה מפורקת עד הסוף.
    // ברמה 1 נכריח לעיתים איבר שהופך ל-1, כדי לאבחן את השמטת ה-1
    const forceOne = level === 1 && rng() < 0.5;
    const [a, b] = forceOne ? [ri(rng, 2, 5), 1] : coprimePair(rng, 2, 5, 2, 7);
    const expr = polyStr([{ c: g * a, v: 'x', e: k + 1 }, { c: g * b, v: 'x', e: k }]);
    const wrongs = [];
    if (b === 1) {
      wrongs.push({ id: 'dropped-one', poly: evalPoly(`${termStr(g, 'x', k)} * ${termStr(a, 'x', 1)}`) });
    }
    return ex({
      prompt: 'פרקו לגורמים על ידי הוצאת גורם משותף:',
      exprText: expr,
      mode: 'factor',
      target: evalPoly(expr),
      answerText: `${termStr(g, 'x', k)}(${polyStr([{ c: a, v: 'x', e: 1 }, { c: b, v: '', e: 0 }])})`,
      rule: 'מוציאים את הגורם המשותף הגדול ביותר - גם את המספר וגם את המשתנה בחזקה הנמוכה ביותר.',
      wrongs,
    });
  },

  'factor-diff-squares'(rng, level) {
    // a ו-b זרים: אחרת ל-a²x²−b² יש גורם מספרי משותף והפירוק לא יהיה מלא
    const [a, b] = level >= 2 ? coprimePair(rng, 2, 5, 2, 9) : [1, ri(rng, 2, 9)];
    const expr = polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -b * b, v: '', e: 0 }]);
    return ex({
      prompt: 'פרקו לגורמים:',
      exprText: expr,
      mode: 'factor',
      target: evalPoly(expr),
      answerText: `(${termStr(a, 'x', 1)} - ${b})(${termStr(a, 'x', 1)} + ${b})`,
      rule: 'a² − b² = (a − b)(a + b). שימו לב: הפרש ריבועים מתפרק, סכום ריבועים לא.',
      wrongs: [
        { id: 'both-same-sign', poly: evalPoly(`(${termStr(a, 'x', 1)} - ${b})^2`) },
      ],
    });
  },

  'factor-perfect-square'(rng, level) {
    const [a, b] = level >= 2 ? coprimePair(rng, 2, 4, 2, 7) : [1, ri(rng, 2, 7)];
    const s = coin(rng);
    const expr = polyStr([
      { c: a * a, v: 'x', e: 2 },
      { c: s * 2 * a * b, v: 'x', e: 1 },
      { c: b * b, v: '', e: 0 },
    ]);
    return ex({
      prompt: 'פרקו לגורמים:',
      exprText: expr,
      mode: 'factor',
      target: evalPoly(expr),
      answerText: `(${termStr(a, 'x', 1)} ${s > 0 ? '+' : '-'} ${b})^2`,
      rule: 'a² ± 2ab + b² = (a ± b)². בודקים שהאיבר האמצעי הוא בדיוק פעמיים מכפלת השורשים.',
      wrongs: [
        { id: 'confuse-square-with-diff', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -b * b, v: '', e: 0 }])) },
      ],
    });
  },

  'factor-trinomial'(rng, level) {
    let p, q;
    do {
      p = ri(rng, 1, level >= 2 ? 8 : 5) * (level >= 2 ? coin(rng) : 1);
      q = ri(rng, 1, level >= 2 ? 8 : 5) * (level >= 2 ? coin(rng) : 1);
    } while (p === q || p + q === 0);
    const b = p + q, c = p * q;
    const expr = polyStr([{ c: 1, v: 'x', e: 2 }, { c: b, v: 'x', e: 1 }, { c, v: '', e: 0 }]);
    const wrongs = [
      { id: 'trinomial-sign-flip', poly: evalPoly(`${binomStr(1, 'x', -p)}${binomStr(1, 'x', -q)}`) },
    ];
    const alt = evalPoly(`${binomStr(1, 'x', b)}${binomStr(1, 'x', c)}`);
    wrongs.push({ id: 'trinomial-uses-coefficients', poly: alt });
    return ex({
      prompt: 'פרקו לגורמים:',
      exprText: expr,
      mode: 'factor',
      target: evalPoly(expr),
      answerText: `${binomStr(1, 'x', p)}${binomStr(1, 'x', q)}`,
      rule: 'מחפשים שני מספרים שהמכפלה שלהם היא האיבר החופשי והסכום שלהם הוא מקדם ה-x.',
      wrongs,
    });
  },

  'factor-combined'(rng, level) {
    if (level === 1 || rng() < 0.5) {
      const k = ri(rng, 2, 5), c = ri(rng, 2, 6);
      const expr = polyStr([{ c: k, v: 'x', e: 2 }, { c: -k * c * c, v: '', e: 0 }]);
      return ex({
        prompt: 'פרקו לגורמים עד הסוף:',
        exprText: expr,
        mode: 'factor',
        target: evalPoly(expr),
        answerText: `${k}(x - ${c})(x + ${c})`,
        rule: 'קודם מוציאים גורם משותף, ורק אחר כך בודקים אם מה שנשאר מתפרק לפי נוסחה.',
        wrongs: [],
      });
    }
    let p, q;
    do { p = ri(rng, 1, 6) * coin(rng); q = ri(rng, 1, 6) * coin(rng); } while (p === q);
    const expr = polyStr([{ c: 1, v: 'x', e: 3 }, { c: p + q, v: 'x', e: 2 }, { c: p * q, v: 'x', e: 1 }]);
    return ex({
      prompt: 'פרקו לגורמים עד הסוף:',
      exprText: expr,
      mode: 'factor',
      target: evalPoly(expr),
      answerText: `x${binomStr(1, 'x', p)}${binomStr(1, 'x', q)}`,
      rule: 'מוציאים x כגורם משותף, ואז מפרקים את הטרינום שנשאר.',
      wrongs: [],
    });
  },

  'simplify-fractions'(rng, level) {
    const c = ri(rng, 2, 6);
    const useSquare = level >= 2 && rng() < 0.5;
    const num = polyStr([{ c: 1, v: 'x', e: 2 }, { c: -c * c, v: '', e: 0 }]);
    const den = useSquare
      ? polyStr([{ c: 1, v: 'x', e: 2 }, { c: 2 * c, v: 'x', e: 1 }, { c: c * c, v: '', e: 0 }])
      : polyStr([{ c: 1, v: 'x', e: 1 }, { c, v: '', e: 0 }]);
    const answerText = useSquare ? `(x - ${c})/(x + ${c})` : `x - ${c}`;
    return ex({
      prompt: 'צמצמו את השבר האלגברי:',
      exprText: `(${num})/(${den})`,
      mode: 'simplify',
      target: evalExpr(answerText),
      answerText,
      rule: 'מפרקים את המונה ואת המכנה לגורמים, ואז מצמצמים גורם שלם. אסור לצמצם איברים בודדים!',
      wrongs: [],
    });
  },

  'solve-by-factoring'(rng, level) {
    let p, q;
    do {
      p = ri(rng, 1, level >= 2 ? 7 : 5) * coin(rng);
      q = ri(rng, 1, level >= 2 ? 7 : 5) * coin(rng);
    } while (p === q);
    const expr = polyStr([{ c: 1, v: 'x', e: 2 }, { c: p + q, v: 'x', e: 1 }, { c: p * q, v: '', e: 0 }]);
    return ex({
      prompt: 'פתרו את המשוואה (רשמו את שני הפתרונות, מופרדים בפסיק):',
      exprText: `${expr} = 0`,
      mode: 'roots',
      target: [rat(-p), rat(-q)],
      answerText: `x = ${-p},  x = ${-q}`,
      rule: 'מפרקים לגורמים, ואז מכפלה שווה לאפס רק אם אחד הגורמים מתאפס.',
      wrongs: [
        { id: 'root-sign', roots: [rat(p), rat(q)] },
      ],
    });
  },
};

export const TOP_LEVEL = 5;

/** יוצר תרגיל למיומנות ולרמה נתונות. */
export function generateExercise(skillId, level, seed) {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`אין גנרטור למיומנות ${skillId}`);
  const rng = makeRng(seed);
  const exercise = gen(rng, Math.max(1, Math.min(TOP_LEVEL, level)));

  // כל תשובה שגויה חזויה מיוצגת כפונקציה רציונלית, גם כשהיא פולינום: ברמות
  // הגבוהות יש תרגילים עם 1/x, ושם התשובה אינה פולינום כלל.
  const targetRf = exercise.target?.den
    ? exercise.target
    : (exercise.target?.terms ? ratFunc(exercise.target, pOne()) : null);

  // רשת ביטחון: אם צירוף פרמטרים מסוים גרם לכך ש"תשובה שגויה" חזויה מתלכדת
  // עם התשובה הנכונה, מסירים אותה - אחרת היינו מאבחנים תשובה נכונה כטעות.
  const wrongs = [];
  for (const w of exercise.wrongs || []) {
    if (w.roots) { wrongs.push(w); continue; }
    const rf = w.rf || (w.poly ? ratFunc(w.poly, pOne()) : null);
    if (!rf) continue;
    if (targetRf && rfEqual(rf, targetRf)) continue;
    wrongs.push({ ...w, rf });
  }
  return { ...exercise, wrongs, skillId, level, seed, id: `${skillId}-${level}-${seed}` };
}
