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
import { rat, gcd } from '../math/rational.js';
import { pEqual } from '../math/poly.js';

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
    const a = level >= 2 ? ri(rng, 2, 5) : 1;
    const b = ri(rng, 2, 9);
    const expr = `(${termStr(a, 'x', 1)} + ${b})^2`;
    return ex({
      prompt: 'פתחו את הסוגריים לפי נוסחת הכפל המקוצר:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(expr),
      answerText: polyStr([{ c: a * a, v: 'x', e: 2 }, { c: 2 * a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }]),
      rule: '(a + b)² = a² + 2ab + b²',
      wrongs: [
        { id: 'sq-no-middle', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: b * b, v: '', e: 0 }])) },
        { id: 'sq-middle-no-two', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }])) },
        { id: 'sq-coef-not-squared', poly: evalPoly(polyStr([{ c: a, v: 'x', e: 2 }, { c: 2 * a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }])) },
      ],
    });
  },

  'sq-diff'(rng, level) {
    const a = level >= 2 ? ri(rng, 2, 5) : 1;
    const b = ri(rng, 2, 9);
    const expr = `(${termStr(a, 'x', 1)} - ${b})^2`;
    return ex({
      prompt: 'פתחו את הסוגריים לפי נוסחת הכפל המקוצר:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(expr),
      answerText: polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -2 * a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }]),
      rule: '(a − b)² = a² − 2ab + b²',
      wrongs: [
        { id: 'sq-no-middle', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: b * b, v: '', e: 0 }])) },
        { id: 'sq-diff-sign-b2', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -2 * a * b, v: 'x', e: 1 }, { c: -b * b, v: '', e: 0 }])) },
        { id: 'sq-diff-middle-sign', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: 2 * a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }])) },
      ],
    });
  },

  'diff-squares-expand'(rng, level) {
    const a = level >= 2 ? ri(rng, 2, 5) : 1;
    const b = ri(rng, 2, 9);
    const expr = `(${termStr(a, 'x', 1)} - ${b})(${termStr(a, 'x', 1)} + ${b})`;
    return ex({
      prompt: 'פתחו את הסוגריים לפי נוסחת הכפל המקוצר:',
      exprText: expr,
      mode: 'expand',
      target: evalPoly(expr),
      answerText: polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -b * b, v: '', e: 0 }]),
      rule: '(a − b)(a + b) = a² − b²',
      wrongs: [
        { id: 'confuse-square-with-diff', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: -2 * a * b, v: 'x', e: 1 }, { c: b * b, v: '', e: 0 }])) },
        { id: 'sum-of-squares', poly: evalPoly(polyStr([{ c: a * a, v: 'x', e: 2 }, { c: b * b, v: '', e: 0 }])) },
      ],
    });
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

/** יוצר תרגיל למיומנות ולרמה נתונות. */
export function generateExercise(skillId, level, seed) {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`אין גנרטור למיומנות ${skillId}`);
  const rng = makeRng(seed);
  const exercise = gen(rng, Math.max(1, Math.min(3, level)));
  // רשת ביטחון: אם צירוף פרמטרים מסוים גרם לכך ש"תשובה שגויה" חזויה מתלכדת
  // עם התשובה הנכונה, מסירים אותה - אחרת היינו מאבחנים תשובה נכונה כטעות.
  const wrongs = (exercise.wrongs || []).filter(w =>
    w.roots ? true : !!w.poly && !(exercise.target?.terms && pEqual(w.poly, exercise.target)));
  return { ...exercise, wrongs, skillId, level, seed, id: `${skillId}-${level}-${seed}` };
}
