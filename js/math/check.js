// ==========================================================================
// check.js - בדיקת תשובות התלמיד
// ==========================================================================
// שלוש שאלות נפרדות, וחשוב לא לבלבל ביניהן:
//   1. האם התשובה *שקולה* לביטוי הנכון?          (equivalence)
//   2. האם היא כתובה בצורה שנדרשה - פתוחה?        (expanded form)
//   3. האם היא כתובה כמכפלה שפורקה עד הסוף?       (factored form)
// תלמיד שכתב ביטוי שקול אבל לא בצורה הנדרשת מקבל משוב שונה לגמרי מתלמיד
// שטעה בחישוב - וזה ההבדל שמפעיל את המסלול הנכון במנוע האדפטיבי.

import { rat, rMul, rNeg, rEq, ONE, isOne } from './rational.js';
import {
  pOne, pEqual, isConstPoly, constValue, rfToPoly, rfEqual, ratFunc, polyKey,
} from './poly.js';
import { parse, stripParens } from './parser.js';
import { astToRatFunc } from './evaluate.js';
import { isFullyReduced, factorPoly } from './factor.js';

// -------------------------------------------------------------- מבנה הביטוי
function containsSum(node) {
  if (!node) return false;
  switch (node.t) {
    case 'add': case 'sub': return true;
    case 'paren': case 'neg': return containsSum(node.a);
    case 'mul': case 'div': case 'pow': return containsSum(node.a) || containsSum(node.b);
    default: return false;
  }
}

/** האם הביטוי כתוב בצורה פתוחה (סכום של חד-איברים, בלי סוגריים לא-מפורקים). */
export function isExpandedForm(node) {
  switch (node.t) {
    case 'paren': case 'neg': return isExpandedForm(node.a);
    case 'add': case 'sub': return isExpandedForm(node.a) && isExpandedForm(node.b);
    case 'mul': case 'div': return !containsSum(node.a) && !containsSum(node.b);
    case 'pow': return !containsSum(node.a);
    default: return true;
  }
}

/**
 * מפרק את *מבנה* הביטוי שהתלמיד כתב לרשימת גורמים.
 * חזקה נפרשת לגורמים חוזרים: (x+1)^2 -> [x+1, x+1] - כך שהשוואת פירוקים
 * לא תלויה בשאלה אם התלמיד כתב חזקה או כפל.
 */
export function astFactors(node) {
  const acc = { constant: ONE, factors: [], ok: true };
  collect(node, acc);
  return acc;
}

function collect(node, acc) {
  switch (node.t) {
    case 'paren': return collect(node.a, acc);
    case 'neg': acc.constant = rNeg(acc.constant); return collect(node.a, acc);
    case 'mul': collect(node.a, acc); return collect(node.b, acc);
    case 'num': acc.constant = rMul(acc.constant, node.v); return acc;
    case 'pow': {
      const exp = literalExponent(node.b);
      if (exp === null) { acc.ok = false; return acc; }
      for (let i = 0; i < exp; i++) collect(node.a, acc);
      return acc;
    }
    default: {
      const p = rfToPoly(astToRatFunc(node));
      if (!p) { acc.ok = false; return acc; }
      const c = constValue(p);
      if (c !== null) acc.constant = rMul(acc.constant, c);
      else acc.factors.push(p);
      return acc;
    }
  }
}

function literalExponent(node) {
  const n = stripParens(node);
  if (n.t !== 'num') return null;
  if (n.v.d !== 1 || n.v.n < 0) return null;
  return n.v.n;
}

// -------------------------------------------------------------- הבדיקות
/** האם שני ביטויים שקולים מתמטית (בלי קשר לצורת הכתיבה). */
export function isEquivalent(studentAst, targetRf) {
  return rfEqual(astToRatFunc(studentAst), targetRf);
}

/**
 * בדיקת תשובה. mode הוא 'expand' (לפתוח סוגריים), 'factor' (לפרק לגורמים)
 * או 'equivalent' (כל צורה שקולה מתקבלת).
 * @returns {{ok: boolean, reason?: string, message?: string}}
 */
export function checkAnswer(text, target, mode) {
  let ast;
  try {
    ast = parse(text);
  } catch (err) {
    return { ok: false, reason: 'parse', message: err.message };
  }

  let value;
  try {
    value = astToRatFunc(ast);
  } catch (err) {
    return { ok: false, reason: 'parse', message: err.message };
  }

  const targetRf = target.den ? target : ratFunc(target, pOne());
  if (!rfEqual(value, targetRf)) {
    return { ok: false, reason: 'value', ast, value };
  }

  if (mode === 'expand') {
    if (!isExpandedForm(ast)) {
      return { ok: false, reason: 'not-expanded', ast, value,
        message: 'התשובה נכונה מתמטית, אבל השאלה ביקשה לפתוח את הסוגריים עד הסוף.' };
    }
    return { ok: true, ast, value };
  }

  if (mode === 'factor') {
    const parts = astFactors(ast);
    if (!parts.ok) {
      return { ok: false, reason: 'not-factored', ast, value,
        message: 'לא הצלחתי לקרוא את התשובה כמכפלה של גורמים.' };
    }
    const nonTrivial = parts.factors.length;
    const constIsUnit = isOne(parts.constant) || rEq(parts.constant, rat(-1));
    if (nonTrivial === 0) {
      return { ok: false, reason: 'not-factored', ast, value,
        message: 'התשובה צריכה להיות מכפלה של גורמים.' };
    }
    if (nonTrivial === 1 && constIsUnit) {
      return { ok: false, reason: 'not-factored', ast, value,
        message: 'הערך נכון, אבל הביטוי עדיין לא כתוב כמכפלה של גורמים.' };
    }
    const stuck = parts.factors.find(f => !isFullyReduced(f));
    if (stuck) {
      return { ok: false, reason: 'partial-factor', ast, value, stuck,
        message: 'התחלת נכון, אבל אחד הגורמים עדיין ניתן לפירוק נוסף.' };
    }
    return { ok: true, ast, value };
  }

  if (mode === 'simplify') {
    const numFactors = factorPoly(value.num).factors.map(polyKey);
    const denFactors = factorPoly(value.den).factors.map(polyKey);
    const shared = numFactors.find(k => denFactors.includes(k));
    if (shared) {
      return { ok: false, reason: 'not-simplified', ast, value,
        message: 'הערך נכון, אבל אפשר עוד לצמצם - נשאר גורם משותף למונה ולמכנה.' };
    }
    return { ok: true, ast, value };
  }

  return { ok: true, ast, value };
}

// -------------------------------------------------------------- פתרון משוואות
/**
 * בודק רשימת פתרונות: "3, -2" או "x=3, x=-2" (גם בלי רווחים).
 * ההשוואה היא בין קבוצות - סדר הפתרונות לא משנה.
 */
export function checkRoots(text, targetRoots) {
  const cleaned = String(text || '').replace(/x\s*=/gi, ' ').trim();
  if (!cleaned) return { ok: false, reason: 'parse', message: 'לא הוקלדה תשובה' };
  const pieces = cleaned.split(/[,;]|\sו\s|\bאו\b/).map(s => s.trim()).filter(Boolean);
  if (pieces.length !== targetRoots.length) {
    return { ok: false, reason: 'root-count',
      message: `למשוואה הזו יש ${targetRoots.length} פתרונות. רשמו את כולם, מופרדים בפסיק.` };
  }
  const values = [];
  for (const piece of pieces) {
    try {
      const p = rfToPoly(astToRatFunc(parse(piece)));
      const c = p ? constValue(p) : null;
      if (c === null) throw new Error(`"${piece}" אינו מספר`);
      values.push(c);
    } catch (err) {
      return { ok: false, reason: 'parse', message: err.message };
    }
  }
  const key = (arr) => arr.map(r => `${r.n}/${r.d}`).sort().join(',');
  if (key(values) !== key(targetRoots)) {
    return { ok: false, reason: 'value', roots: values };
  }
  return { ok: true, roots: values };
}
