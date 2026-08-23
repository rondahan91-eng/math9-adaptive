// ==========================================================================
// evaluate.js - הופך עץ תחביר (AST) לצורה קנונית: פונקציה רציונלית
// ==========================================================================

import { isInteger, isZero } from './rational.js';
import {
  ratFunc, rfAdd, rfSub, rfMul, rfDiv, rfPow, rfNeg, rfToPoly,
  pConst, pVar, pOne,
} from './poly.js';
import { parse } from './parser.js';

export function astToRatFunc(node) {
  switch (node.t) {
    case 'num': return ratFunc(pConst(node.v), pOne());
    case 'var': return ratFunc(pVar(node.name), pOne());
    case 'paren': return astToRatFunc(node.a);
    case 'neg': return rfNeg(astToRatFunc(node.a));
    case 'add': return rfAdd(astToRatFunc(node.a), astToRatFunc(node.b));
    case 'sub': return rfSub(astToRatFunc(node.a), astToRatFunc(node.b));
    case 'mul': return rfMul(astToRatFunc(node.a), astToRatFunc(node.b));
    case 'div': {
      const den = astToRatFunc(node.b);
      if (isZeroRf(den)) throw new Error('חלוקה באפס אינה מוגדרת');
      return rfDiv(astToRatFunc(node.a), den);
    }
    case 'pow': {
      const expPoly = rfToPoly(astToRatFunc(node.b));
      const expConst = expPoly ? constOf(expPoly) : null;
      if (expConst === null) throw new Error('בשלב הזה המעריך של החזקה חייב להיות מספר שלם, למשל x²');
      if (!isInteger(expConst) || expConst.n < 0) {
        throw new Error('בשלב הזה החזקה חייבת להיות מספר שלם אי-שלילי');
      }
      return rfPow(astToRatFunc(node.a), expConst.n);
    }
    default: throw new Error('ביטוי לא מוכר');
  }
}

function constOf(p) {
  if (p.terms.size === 0) return { n: 0, d: 1 };
  if (p.terms.size === 1 && p.terms.has('1')) return p.terms.get('1').coef;
  return null;
}

const isZeroRf = (rf) => rf.num.terms.size === 0;

/** קיצור נפוץ: מחרוזת -> פונקציה רציונלית. */
export function evalExpr(text) {
  return astToRatFunc(parse(text));
}

/** קיצור נפוץ: מחרוזת -> פולינום. זורק שגיאה אם הביטוי הוא שבר אלגברי. */
export function evalPoly(text) {
  const p = rfToPoly(evalExpr(text));
  if (!p) throw new Error('הביטוי הזה אינו פולינום (יש בו חלוקה במשתנה)');
  return p;
}
