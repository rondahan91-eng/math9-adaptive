// ==========================================================================
// rational.js - אריתמטיקה מדויקת של שברים (ללא נקודה צפה)
// ==========================================================================
// כל המקדמים במנוע המתמטי הם שברים רציונליים מדויקים. זה קריטי: אם היינו
// משתמשים ב-float, ביטוי כמו x/3 היה מאבד דיוק והשוואת שקילות הייתה נכשלת
// באופן אקראי. כאן 1/3 נשאר בדיוק 1/3.

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

/** יוצר שבר מנורמל: מכנה חיובי, מצומצם. */
export function rat(n, d = 1) {
  if (d === 0) throw new Error('חלוקה באפס');
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new Error('המנוע תומך רק במקדמים רציונליים (מספרים שלמים ביחס)');
  }
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

export const ZERO = rat(0);
export const ONE = rat(1);

export const isZero = (a) => a.n === 0;
export const isOne = (a) => a.n === 1 && a.d === 1;
export const isInteger = (a) => a.d === 1;
export const isNegative = (a) => a.n < 0;

export const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const rDiv = (a, b) => {
  if (isZero(b)) throw new Error('חלוקה באפס');
  return rat(a.n * b.d, a.d * b.n);
};
export const rNeg = (a) => rat(-a.n, a.d);
export const rEq = (a, b) => a.n === b.n && a.d === b.d;
export const rCmp = (a, b) => a.n * b.d - b.n * a.d;
export const rAbs = (a) => rat(Math.abs(a.n), a.d);

export function rPow(a, k) {
  if (!Number.isInteger(k) || k < 0) throw new Error('חזקה חייבת להיות מספר שלם אי-שלילי');
  let out = ONE;
  for (let i = 0; i < k; i++) out = rMul(out, a);
  return out;
}

/** שורש ריבועי מדויק, או null אם השורש אינו רציונלי. */
export function rSqrt(a) {
  if (a.n < 0) return null;
  const sn = Math.round(Math.sqrt(a.n));
  const sd = Math.round(Math.sqrt(a.d));
  if (sn * sn !== a.n || sd * sd !== a.d) return null;
  return rat(sn, sd);
}

export function ratToString(a) {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}
