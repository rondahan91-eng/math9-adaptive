// ==========================================================================
// parser.js - ניתוח תחבירי של ביטוי אלגברי שהתלמיד הקליד
// ==========================================================================
// תומך בכתיב המתמטי הרגיל של כיתה ט': כפל מרומז (2x, 3xy, (x+1)(x-1)),
// חזקות (x^2 או x²), שברים, ומינוס אונרי. הודעות השגיאה בעברית ומכוונות
// לתלמיד - לא ל-stack trace.

import { rat, gcd } from './rational.js';

const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** מנרמל קלט: מעביר סימנים "יפים" לצורה הפנימית הסטנדרטית. */
export function normalizeInput(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (SUPERSCRIPTS[ch]) {
      // רצף של ספרות-על הופך לחזקה אחת: x²³ -> x^23
      let digits = '';
      while (i < src.length && SUPERSCRIPTS[src[i]]) { digits += SUPERSCRIPTS[src[i]]; i++; }
      out += '^' + digits;
      continue;
    }
    if (ch === '·' || ch === '×' || ch === '∙' || ch === '⋅') out += '*';
    else if (ch === '−' || ch === '–' || ch === '—') out += '-';
    else if (ch === '÷' || ch === ':') out += '/';
    else if (ch === '[' || ch === '{') out += '(';
    else if (ch === ']' || ch === '}') out += ')';
    else if (ch === '‏' || ch === '‎') { /* סימני כיווניות RTL - מתעלמים */ }
    else out += ch;
    i++;
  }
  return out;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      if ((num.match(/\./g) || []).length > 1) throw new Error(`המספר "${num}" אינו תקין`);
      tokens.push({ type: 'num', value: parseDecimal(num), pos: i });
      continue;
    }
    // שמות משתנים מנורמלים לאות קטנה: בכיתה ט' X ו-x הם אותו משתנה, ואין שום
    // סיבה פדגוגית לפסול תשובה נכונה רק בגלל Shift.
    if (/[a-zA-Z]/.test(ch)) { tokens.push({ type: 'var', value: ch.toLowerCase(), pos: i }); i++; continue; }
    if ('+-*/^()'.includes(ch)) { tokens.push({ type: ch, pos: i }); i++; continue; }
    throw new Error(`התו "${ch}" אינו מוכר. אפשר להשתמש במספרים, אותיות, + - * / ^ וסוגריים.`);
  }
  return tokens;
}

function parseDecimal(text) {
  const dot = text.indexOf('.');
  if (dot === -1) return rat(parseInt(text, 10), 1);
  const digits = text.length - dot - 1;
  const numerator = parseInt(text.replace('.', ''), 10);
  const denominator = Math.pow(10, digits);
  const g = gcd(numerator, denominator) || 1;
  return rat(numerator / g, denominator / g);
}

/** האם הטוקן יכול לפתוח ביטוי - קובע אם כפל מרומז חוקי כאן. */
const startsAtom = (t) => t && (t.type === 'num' || t.type === 'var' || t.type === '(');

export function parse(source) {
  const src = normalizeInput(source || '');
  if (!src.trim()) throw new Error('לא הוקלדה תשובה');
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      const right = parseTerm();
      left = { t: op === '+' ? 'add' : 'sub', a: left, b: right };
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.type === '*' || t.type === '/') {
        next();
        left = { t: t.type === '*' ? 'mul' : 'div', a: left, b: parseUnary() };
      } else if (startsAtom(t)) {
        // כפל מרומז: 2x, (x+1)(x-1), 3(a+b)
        left = { t: 'mul', a: left, b: parseUnary(), implicit: true };
      } else break;
    }
    return left;
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === '-') { next(); return { t: 'neg', a: parseUnary() }; }
    if (t && t.type === '+') { next(); return parseUnary(); }
    return parsePower();
  }

  function parsePower() {
    const base = parseAtom();
    if (peek() && peek().type === '^') {
      next();
      return { t: 'pow', a: base, b: parseUnary() }; // חזקה אסוציאטיבית ימינה
    }
    return base;
  }

  function parseAtom() {
    const t = next();
    if (!t) throw new Error('הביטוי נגמר באמצע - חסר משהו בסוף');
    if (t.type === 'num') return { t: 'num', v: t.value };
    if (t.type === 'var') return { t: 'var', name: t.value };
    if (t.type === '(') {
      const inner = parseExpr();
      const close = next();
      if (!close || close.type !== ')') throw new Error('חסרים סוגריים סוגרים )');
      return { t: 'paren', a: inner };
    }
    if (t.type === ')') throw new Error('יש סוגר ) בלי סוגר פותח מתאים');
    throw new Error(`לא ציפיתי לסימן "${t.type}" כאן`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) {
    const leftover = tokens[pos];
    throw new Error(`יש משהו מיותר אחרי סוף הביטוי (סימן "${leftover.type === 'num' || leftover.type === 'var' ? leftover.value : leftover.type}")`);
  }
  return ast;
}

/** מסיר עטיפות סוגריים כדי לבדוק את מבנה הביטוי (למשל: האם זו מכפלה). */
export function stripParens(node) {
  let n = node;
  while (n && n.t === 'paren') n = n.a;
  return n;
}
