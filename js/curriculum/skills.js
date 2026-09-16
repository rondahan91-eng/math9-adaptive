// ==========================================================================
// skills.js - מפת הידע של היחידה "כפל מקוצר ופירוק לגורמים" (כיתה ט')
// ==========================================================================
// זהו גרף מכוון: לכל מיומנות יש רשימת קדם-דרישות. המנוע האדפטיבי לא יגיש
// לתלמיד מיומנות שהבסיס שלה עדיין לא נשלט - וזו בדיוק הנקודה שבה תלמידים
// "נשברים" באלגברה: הם מגיעים לפירוק טרינום בלי לשלוט בחוק הפילוג.

export const SKILLS = [
  {
    id: 'monomial-mult',
    title: 'כפל חד-איברים',
    short: 'כפל בין ביטויים כמו 3x ו-4x²',
    prereqs: [],
    stage: 'יסודות',
  },
  {
    id: 'distribute-mono',
    title: 'חוק הפילוג',
    short: 'כפל חד-איבר בסוגריים',
    prereqs: ['monomial-mult'],
    stage: 'יסודות',
  },
  {
    id: 'distribute-binom',
    title: 'כפל שני זוגות סוגריים',
    short: 'פילוג מורחב: (x+2)(x+5)',
    prereqs: ['distribute-mono'],
    stage: 'יסודות',
  },
  {
    id: 'sq-sum',
    title: 'ריבוע של סכום',
    short: '(a+b)² = a² + 2ab + b²',
    prereqs: ['distribute-binom'],
    stage: 'נוסחאות הכפל המקוצר',
  },
  {
    id: 'sq-diff',
    title: 'ריבוע של הפרש',
    short: '(a−b)² = a² − 2ab + b²',
    prereqs: ['sq-sum'],
    stage: 'נוסחאות הכפל המקוצר',
  },
  {
    id: 'diff-squares-expand',
    title: 'מכפלת סכום בהפרש',
    short: '(a−b)(a+b) = a² − b²',
    prereqs: ['distribute-binom'],
    stage: 'נוסחאות הכפל המקוצר',
  },
  {
    id: 'mental-mult',
    title: 'חישוב בראש',
    short: '104 · 96 = 10000 − 16',
    prereqs: ['diff-squares-expand'],
    stage: 'נוסחאות הכפל המקוצר',
  },
  {
    id: 'complete-identity',
    title: 'השלמת זהות',
    short: 'הכיוון ההפוך: ( ? + 3)² = x² + 6x + 9',
    prereqs: ['sq-sum', 'sq-diff', 'diff-squares-expand'],
    stage: 'נוסחאות הכפל המקוצר',
  },
  {
    id: 'factor-common',
    title: 'הוצאת גורם משותף',
    short: '6x² + 3x = 3x(2x + 1)',
    prereqs: ['distribute-mono'],
    stage: 'פירוק לגורמים',
  },
  {
    id: 'factor-diff-squares',
    title: 'פירוק הפרש ריבועים',
    short: 'x² − 9 = (x−3)(x+3)',
    prereqs: ['diff-squares-expand', 'factor-common'],
    stage: 'פירוק לגורמים',
  },
  {
    id: 'factor-perfect-square',
    title: 'פירוק לריבוע שלם',
    short: 'x² + 6x + 9 = (x+3)²',
    prereqs: ['sq-sum', 'sq-diff'],
    stage: 'פירוק לגורמים',
  },
  {
    id: 'factor-trinomial',
    title: 'פירוק טרינום',
    short: 'x² + 5x + 6 = (x+2)(x+3)',
    prereqs: ['distribute-binom', 'factor-common'],
    stage: 'פירוק לגורמים',
  },
  {
    id: 'factor-combined',
    title: 'פירוק משולב',
    short: 'קודם גורם משותף, אחר כך נוסחה',
    prereqs: ['factor-common', 'factor-diff-squares', 'factor-trinomial'],
    stage: 'שילוב ויישום',
  },
  {
    id: 'simplify-fractions',
    title: 'צמצום שברים אלגבריים',
    short: 'פירוק המונה והמכנה וצמצום',
    prereqs: ['factor-combined'],
    stage: 'שילוב ויישום',
  },
  {
    id: 'solve-by-factoring',
    title: 'פתרון משוואות בעזרת פירוק',
    short: 'מכפלה שווה לאפס',
    prereqs: ['factor-combined'],
    stage: 'שילוב ויישום',
  },
  {
    id: 'shortcut-equations',
    title: 'משוואות עם כפל מקוצר',
    short: 'איבר ה-x² מצטמצם ונשארת משוואה פשוטה',
    prereqs: ['complete-identity'],
    stage: 'שילוב ויישום',
  },
  {
    id: 'symmetric-values',
    title: 'זהויות סימטריות',
    short: 'נתון a²+b² ו-ab — חשבו (a+b)²',
    prereqs: ['complete-identity'],
    stage: 'שילוב ויישום',
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

export const STAGES = ['יסודות', 'נוסחאות הכפל המקוצר', 'פירוק לגורמים', 'שילוב ויישום'];

/**
 * מה חשוף כשאין עדיין החלטה שמורה של המורה. שני השלבים הראשונים - בדיוק
 * הפרק שהכיתה לומדת עכשיו. חייב להישאר זהה ל-STAGES_REVEALED_BY_DEFAULT
 * ב-backend/Code.gs, אחרת מצב פיתוח והשרת יראו שונה.
 */
export const STAGES_REVEALED_BY_DEFAULT = ['יסודות', 'נוסחאות הכפל המקוצר'];

/** השלב שבו נמצאת מיומנות. */
export const stageOf = (skillId) => SKILL_BY_ID[skillId]?.stage || null;

/** כל המיומנויות שתלויות (ישירות) במיומנות נתונה. */
export function dependentsOf(skillId) {
  return SKILLS.filter(s => s.prereqs.includes(skillId)).map(s => s.id);
}

/** סדר טופולוגי - שימושי להצגת מפת הידע ולבדיקות תקינות. */
export function topoOrder() {
  const done = new Set();
  const out = [];
  let guard = 0;
  while (out.length < SKILLS.length) {
    if (++guard > 100) throw new Error('מעגל בגרף המיומנויות');
    for (const s of SKILLS) {
      if (done.has(s.id)) continue;
      if (s.prereqs.every(p => done.has(p))) { done.add(s.id); out.push(s.id); }
    }
  }
  return out;
}
