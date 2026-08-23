// ==========================================================================
// tests.js - בדיקות אוטומטיות למנוע המתמטי ולתוכן
// ==========================================================================
// הבדיקה החשובה ביותר כאן היא הסריקה על הגנרטורים: לכל מיומנות, לכל רמה,
// על מאות seeds - מוודאים שהתשובה ה"נכונה" שהגנרטור מכריז עליה באמת עוברת
// את בודק התשובות, ושכל "תשובה שגויה" שהוא חוזה באמת שונה מהנכונה ובאמת
// מאובחנת נכון. זה מה שמונע מתרגיל שבור להגיע לתלמיד.

import { rat, rAdd, rMul, rDiv, rEq, rSqrt, ratToString } from '../js/math/rational.js';
import { pEqual, pOne, pMul, pScale, ratFunc, rfEqual, polyKey } from '../js/math/poly.js';
import { parse } from '../js/math/parser.js';
import { evalPoly, evalExpr } from '../js/math/evaluate.js';
import { factorPoly, isFullyReduced } from '../js/math/factor.js';
import { checkAnswer, checkRoots, isExpandedForm } from '../js/math/check.js';
import { GENERATORS, generateExercise } from '../js/curriculum/generators.js';
import { MISCONCEPTIONS } from '../js/curriculum/misconceptions.js';
import { SKILLS, topoOrder } from '../js/curriculum/skills.js';
import { renderExpr, renderInline } from '../js/math/render.js';
import { LESSONS } from '../js/curriculum/lessons.js';
import { emptyState, updateSkill, selectNextSkill, isUnlocked, MASTERY_THRESHOLD } from '../js/learn/mastery.js';
import { diagnose } from '../js/learn/diagnose.js';

const results = [];
let currentGroup = '';

function group(name) { currentGroup = name; }
function ok(name, condition, detail = '') {
  results.push({ group: currentGroup, name, pass: !!condition, detail });
}
function throws(name, fn) {
  try { fn(); ok(name, false, 'לא נזרקה שגיאה'); }
  catch { ok(name, true); }
}

// -------------------------------------------------------------- שברים
group('אריתמטיקה רציונלית');
ok('1/3 + 1/6 = 1/2', rEq(rAdd(rat(1, 3), rat(1, 6)), rat(1, 2)));
ok('2/4 מצטמצם ל-1/2', ratToString(rat(2, 4)) === '1/2');
ok('מכנה שלילי מנורמל', ratToString(rat(1, -2)) === '-1/2');
ok('שורש של 9/4 הוא 3/2', rEq(rSqrt(rat(9, 4)), rat(3, 2)));
ok('שורש של 2 אינו רציונלי', rSqrt(rat(2)) === null);
throws('חלוקה באפס זורקת', () => rDiv(rat(1), rat(0)));

// -------------------------------------------------------------- ניתוח תחבירי
group('ניתוח תחבירי');
ok('כפל מרומז 2x', pEqual(evalPoly('2x'), evalPoly('2*x')));
ok('כפל מרומז בין סוגריים', pEqual(evalPoly('(x+1)(x+2)'), evalPoly('x^2+3x+2')));
ok('חזקה עילית ² מזוהה', pEqual(evalPoly('x²'), evalPoly('x^2')));
ok('סימן כפל · מזוהה', pEqual(evalPoly('3·x'), evalPoly('3x')));
ok('מינוס יוניקוד מזוהה', pEqual(evalPoly('x−3'), evalPoly('x-3')));
ok('סדר פעולות: 2+3*4', pEqual(evalPoly('2+3*4'), evalPoly('14')));
ok('חזקה לפני כפל: 2x^2', pEqual(evalPoly('2x^2'), evalPoly('2*(x^2)')));
ok('מינוס אונרי: -x^2 שווה ל-(-(x^2))', pEqual(evalPoly('-x^2'), evalPoly('0-x^2')));
ok('שבר מספרי 0.5 = 1/2', pEqual(evalPoly('0.5'), evalPoly('1/2')));
ok('X גדול זהה ל-x קטן', pEqual(evalPoly('X^2+8X+16'), evalPoly('x^2+8x+16')));
ok('כתיב מעורב XY זהה ל-xy', pEqual(evalPoly('(X+Y)^2'), evalPoly('(x+y)^2')));
ok('כמה משתנים', pEqual(evalPoly('(x+y)^2'), evalPoly('x^2+2xy+y^2')));
throws('סוגריים לא סגורים', () => evalPoly('(x+1'));
throws('תו לא חוקי', () => evalPoly('x@2'));
throws('קלט ריק', () => evalPoly('   '));

// -------------------------------------------------------------- שקילות
group('שקילות ביטויים');
ok('(x+3)(x-3) = x²-9', pEqual(evalPoly('(x+3)(x-3)'), evalPoly('x^2-9')));
ok('(2x-5)² = 4x²-20x+25', pEqual(evalPoly('(2x-5)^2'), evalPoly('4x^2-20x+25')));
ok('(x+4)² אינו x²+16', !pEqual(evalPoly('(x+4)^2'), evalPoly('x^2+16')));
ok('(x²-9)/(x+3) שקול ל-x-3',
  rfEqual(evalExpr('(x^2-9)/(x+3)'), evalExpr('x-3')));
ok('(x+1)/(x+2) אינו שקול ל-1/2',
  !rfEqual(evalExpr('(x+1)/(x+2)'), evalExpr('1/2')));

// -------------------------------------------------------------- פירוק לגורמים
group('פירוק לגורמים');
function factorCheck(name, input, expectedFactorCount, expectedConst) {
  const p = evalPoly(input);
  const res = factorPoly(p);
  let product = pOne();
  for (const f of res.factors) product = pMul(product, f);
  const rebuilt = pScale(product, res.constant);
  const correct = pEqual(rebuilt, p);
  const countOk = expectedFactorCount === undefined || res.factors.length === expectedFactorCount;
  const constOk = expectedConst === undefined || rEq(res.constant, rat(expectedConst));
  ok(name, correct && countOk && constOk,
    `גורמים: ${res.factors.map(polyKey).join(' | ')} · קבוע ${ratToString(res.constant)}`);
}
factorCheck('x²-9 -> שני גורמים', 'x^2-9', 2, 1);
factorCheck('9-x² -> שני גורמים עם קבוע -1', '9-x^2', 2, -1);
factorCheck('x²+6x+9 -> (x+3)²', 'x^2+6x+9', 2, 1);
factorCheck('2x²+5x+2', '2x^2+5x+2', 2, 1);
factorCheck('6x²+3x -> 3·x·(2x+1)', '6x^2+3x', 2, 3);
factorCheck('3x²-27 -> 3(x-3)(x+3)', '3x^2-27', 2, 3);
factorCheck('x³+5x²+6x -> x(x+2)(x+3)', 'x^3+5x^2+6x', 3, 1);
factorCheck('9x²-4y² -> (3x-2y)(3x+2y)', '9x^2-4y^2', 2, 1);
factorCheck('x²+5xy+6y²', 'x^2+5xy+6y^2', 2, 1);
factorCheck('קיבוץ: ax+ay+bx+by', 'a*x+a*y+b*x+b*y', 2, 1);
factorCheck('x⁴-16', 'x^4-16');
factorCheck('x²+9 אינו מתפרק', 'x^2+9', 1, 1);
factorCheck('x²+x+1 אינו מתפרק', 'x^2+x+1', 1, 1);
factorCheck('חד-איבר 12x³', '12x^3', 3, 12);

group('אי-פריקות');
ok('x+3 מפורק עד הסוף', isFullyReduced(evalPoly('x+3')));
ok('2x+1 מפורק עד הסוף', isFullyReduced(evalPoly('2x+1')));
ok('4x+2 לא מפורק (גורם 2 משותף)', !isFullyReduced(evalPoly('4x+2')));
ok('x²-9 לא מפורק', !isFullyReduced(evalPoly('x^2-9')));
ok('x²+9 מפורק (סכום ריבועים)', isFullyReduced(evalPoly('x^2+9')));

// -------------------------------------------------------------- בדיקת תשובות
group('בדיקת תשובות - פתיחת סוגריים');
const t1 = evalPoly('x^2+8x+16');
ok('תשובה נכונה מתקבלת', checkAnswer('x^2+8x+16', t1, 'expand').ok);
ok('סדר איברים אחר מתקבל', checkAnswer('16+8x+x^2', t1, 'expand').ok);
ok('רווחים לא משנים', checkAnswer('  x ^ 2 + 8 x + 16 ', t1, 'expand').ok);
ok('חזקה עילית מתקבלת', checkAnswer('x²+8x+16', t1, 'expand').ok);
ok('אות גדולה מתקבלת', checkAnswer('X^2+8X+16', t1, 'expand').ok);
ok('תשובה לא פתוחה נדחית', checkAnswer('(x+4)^2', t1, 'expand').reason === 'not-expanded');
ok('תשובה שגויה נדחית', checkAnswer('x^2+16', t1, 'expand').reason === 'value');
ok('שגיאת תחביר מסומנת בנפרד', checkAnswer('x^2+', t1, 'expand').reason === 'parse');
ok('זיהוי צורה פתוחה', isExpandedForm(parse('x^2+8x+16')));
ok('זיהוי צורה לא פתוחה', !isExpandedForm(parse('x(x+8)+16')));

group('בדיקת תשובות - פירוק לגורמים');
const t2 = evalPoly('x^2-9');
ok('(x-3)(x+3) מתקבל', checkAnswer('(x-3)(x+3)', t2, 'factor').ok);
ok('סדר גורמים הפוך מתקבל', checkAnswer('(x+3)(x-3)', t2, 'factor').ok);
ok('הביטוי המקורי נדחה', checkAnswer('x^2-9', t2, 'factor').reason === 'not-factored');
ok('(x-3)(x-3) נדחה כערך שגוי', checkAnswer('(x-3)(x-3)', t2, 'factor').reason === 'value');
const t3 = evalPoly('3x^2-27');
ok('3(x-3)(x+3) מתקבל', checkAnswer('3(x-3)(x+3)', t3, 'factor').ok);
ok('3(x^2-9) נדחה כפירוק חלקי', checkAnswer('3(x^2-9)', t3, 'factor').reason === 'partial-factor');
const t4 = evalPoly('x^2+6x+9');
ok('(x+3)^2 מתקבל', checkAnswer('(x+3)^2', t4, 'factor').ok);
ok('(x+3)(x+3) מתקבל', checkAnswer('(x+3)(x+3)', t4, 'factor').ok);
const t5 = evalPoly('6x^2+3x');
ok('3x(2x+1) מתקבל', checkAnswer('3x(2x+1)', t5, 'factor').ok);
ok('3(2x^2+x) נדחה כחלקי', checkAnswer('3(2x^2+x)', t5, 'factor').reason === 'partial-factor');
ok('x(6x+3) נדחה כחלקי', checkAnswer('x(6x+3)', t5, 'factor').reason === 'partial-factor');

group('בדיקת תשובות - צמצום שברים ופתרון משוואות');
const t6 = evalExpr('(x-3)/(x+3)');
ok('שבר מצומצם מתקבל', checkAnswer('(x-3)/(x+3)', t6, 'simplify').ok);
ok('שבר לא מצומצם נדחה',
  checkAnswer('(x^2-9)/(x^2+6x+9)', t6, 'simplify').reason === 'not-simplified');
const roots = [rat(-5), rat(3)];
ok('פתרונות מופרדים בפסיק', checkRoots('-5, 3', roots).ok);
ok('סדר הפתרונות לא משנה', checkRoots('3,-5', roots).ok);
ok('פורמט x= מתקבל', checkRoots('x=-5, x=3', roots).ok);
ok('פתרון אחד בלבד נדחה', checkRoots('3', roots).reason === 'root-count');
ok('פתרונות שגויים נדחים', checkRoots('5, -3', roots).reason === 'value');

// -------------------------------------------------------------- הגנרטורים
// -------------------------------------------------------------- תצוגה
group('תצוגה - הסימן ^ לעולם לא מגיע למסך');
const noCaret = (html) => !html.includes('^');
ok('חזקה מספרית: x^2', renderExpr('x^2').includes('<sup>2</sup>'));
ok('חזקה עם אות: x^m', renderInline('x^m · x^n').includes('<sup>m</sup>'));
ok('חזקה עם ביטוי: x^(m+n)', renderInline('x^(m+n)').includes('<sup>m+n</sup>'));
ok('חזקה עם ביטוי מספרי: x^(2+3)', renderInline('x^(2+3)').includes('<sup>2+3</sup>'));
ok('הנוסחה המלאה נקייה מ-^', noCaret(renderInline('x^m · x^n = x^(m+n)')));
ok('משפט עברי עם חזקה נקי מ-^', noCaret(renderInline('החזקה x^2 היא x כפול x')));
ok('טקסט עברי עם חזקה לא נכפה ל-LTR', !renderInline('החזקה x^2 היא').includes('dir="ltr"'));
ok('חזקה שלילית x^-1', renderInline('x^-1').includes('<sup>-1</sup>'));
ok('ביטוי מפורק נשמר: (x+3)^2', noCaret(renderExpr('(x+3)^2')) && renderExpr('(x+3)^2').includes('<sup>2</sup>'));
ok('מינוס טיפוגרפי אחרי חזקה', renderExpr('x^2 - 9').includes('−'));
ok('בריחת HTML נשמרת', renderInline('<b>x</b>').includes('&lt;b&gt;'));
ok('סוגריים לא סגורים אחרי ^ לא מפילים', typeof renderInline('x^(m+n') === 'string');
ok('כל הנוסחאות בשיעורים נקיות מ-^ אחרי רינדור', (() => {
  for (const lesson of Object.values(LESSONS)) {
    for (const b of lesson.body) {
      const texts = b.type === 'example' ? [b.question, b.answer, ...b.steps] : [b.text];
      for (const t of texts) if (!noCaret(renderInline(t))) return false;
    }
  }
  return true;
})());

group('גנרטורים - סריקה מלאה');
const SEEDS = 120;
let genFail = 0, wrongFail = 0, diagFail = 0, renderFail = 0, total = 0;
const failures = [];

for (const skill of SKILLS) {
  ok(`קיים גנרטור ל-${skill.title}`, typeof GENERATORS[skill.id] === 'function');
  ok(`קיים שיעור ל-${skill.title}`, !!LESSONS[skill.id]);
  if (!GENERATORS[skill.id]) continue;

  for (let level = 1; level <= 3; level++) {
    for (let s = 0; s < SEEDS; s++) {
      total++;
      let exercise;
      try {
        exercise = generateExercise(skill.id, level, s * 7919 + level * 104729 + 13);
      } catch (err) {
        genFail++; failures.push(`${skill.id} L${level} #${s}: יצירה נכשלה - ${err.message}`);
        continue;
      }

      // 0. שום תרגיל לא מציג את הסימן ^ על המסך
      for (const [what, text] of [['השאלה', exercise.exprText], ['התשובה', exercise.answerText], ['הכלל', exercise.rule]]) {
        if (text && !noCaret(renderExpr(text))) {
          renderFail++;
          failures.push(`${skill.id} L${level}: ${what} "${text}" מוצגת עם הסימן ^`);
        }
      }

      // 1. התשובה שהגנרטור מכריז עליה חייבת לעבור את הבודק
      const verdict = exercise.mode === 'roots'
        ? checkRoots(exercise.answerText, exercise.target)
        : checkAnswer(exercise.answerText, exercise.target, exercise.mode);
      if (!verdict.ok) {
        genFail++;
        failures.push(`${skill.id} L${level}: "${exercise.exprText}" — התשובה "${exercise.answerText}" נדחתה (${verdict.reason}${verdict.message ? ': ' + verdict.message : ''})`);
      }

      // 2. כל תשובה שגויה חזויה חייבת להיות באמת שונה מהנכונה
      for (const wrong of exercise.wrongs || []) {
        if (wrong.poly && exercise.target?.terms && pEqual(wrong.poly, exercise.target)) {
          wrongFail++;
          failures.push(`${skill.id} L${level}: "${exercise.exprText}" — התפיסה "${wrong.id}" מייצרת תשובה נכונה`);
          continue;
        }
        // 3. ...וחייבת להיות מאובחנת (לא בהכרח לאותו id, אם שתי תפיסות מתלכדות)
        const fake = wrong.roots
          ? { ok: false, reason: 'value', roots: wrong.roots }
          : { ok: false, reason: 'value', value: ratFunc(wrong.poly, pOne()) };
        const found = diagnose(exercise, fake);
        if (!found) {
          diagFail++;
          failures.push(`${skill.id} L${level}: "${exercise.exprText}" — התפיסה "${wrong.id}" לא אובחנה`);
        }
      }
    }
  }
}
ok(`כל ${total} התרגילים נוצרו ותשובתם עוברת את הבודק`, genFail === 0, `${genFail} כשלים`);
ok('אין "תשובה שגויה" שהיא בעצם נכונה', wrongFail === 0, `${wrongFail} כשלים`);
ok('כל התפיסות המוטעות החזויות מאובחנות', diagFail === 0, `${diagFail} כשלים`);
ok('אף תרגיל לא מציג את הסימן ^', renderFail === 0, `${renderFail} כשלים`);

group('שלמות התוכן');
const usedMis = new Set();
for (const skill of SKILLS) {
  if (!GENERATORS[skill.id]) continue;
  for (let level = 1; level <= 3; level++) {
    for (let s = 0; s < 20; s++) {
      const e = generateExercise(skill.id, level, s * 31 + 5);
      (e.wrongs || []).forEach(w => usedMis.add(w.id));
    }
  }
}
usedMis.add('not-fully-factored');
usedMis.add('cancel-terms-not-factors');
const missing = [...usedMis].filter(id => !MISCONCEPTIONS[id]);
ok('לכל תפיסה מוטעית בשימוש יש ערך בבנק', missing.length === 0, missing.join(', '));

// -------------------------------------------------------------- מפת הידע
group('מפת הידע ומודל השליטה');
ok('הגרף חסר מעגלים', (() => { try { topoOrder(); return true; } catch { return false; } })());
ok('כל קדם-דרישה קיימת',
  SKILLS.every(s => s.prereqs.every(p => SKILLS.some(x => x.id === p))));

const st = emptyState();
ok('בהתחלה רק מיומנויות בלי קדם-דרישות פתוחות',
  isUnlocked(st, 'monomial-mult') && !isUnlocked(st, 'factor-trinomial'));
ok('הצעד הראשון הוא היסוד', selectNextSkill(st).skillId === 'monomial-mult');

let sk = st.skills['monomial-mult'];
for (let i = 0; i < 6; i++) sk = updateSkill(sk, true);
ok('שש תשובות נכונות מביאות לשליטה', sk.p >= MASTERY_THRESHOLD, `p=${sk.p.toFixed(3)}`);
let sk2 = sk;
sk2 = updateSkill(sk2, false);
ok('טעות אחת אחרי שליטה לא מאפסת', sk2.p > 0.5, `p=${sk2.p.toFixed(3)}`);
let sk3 = st.skills['sq-sum'];
sk3 = updateSkill(sk3, true);
ok('תשובה נכונה אחת לא מספיקה לשליטה', sk3.p < MASTERY_THRESHOLD, `p=${sk3.p.toFixed(3)}`);

st.skills['monomial-mult'] = sk;
ok('שליטה ביסוד פותחת את הבאה', isUnlocked(st, 'distribute-mono'));

// -------------------------------------------------------------- דוח
export function runAndReport(root) {
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  const groups = [...new Set(results.map(r => r.group))];
  root.innerHTML = `
    <div class="card">
      <h1>${fail === 0 ? '✓ כל הבדיקות עברו' : `✗ ${fail} בדיקות נכשלו`}</h1>
      <p class="muted" style="margin:0">${pass} מתוך ${results.length} · ${total} תרגילים נסרקו</p>
    </div>
    ${groups.map(g => `
      <div class="card">
        <h2>${g}</h2>
        <table><tbody>
          ${results.filter(r => r.group === g).map(r => `
            <tr>
              <td style="width:2rem;color:${r.pass ? 'var(--ok)' : 'var(--err)'}">${r.pass ? '✓' : '✗'}</td>
              <td>${r.name}${r.detail && !r.pass ? `<br><span class="muted">${r.detail}</span>` : ''}</td>
            </tr>`).join('')}
        </tbody></table>
      </div>`).join('')}
    ${failures.length ? `
      <div class="card">
        <h2>פירוט כשלים בגנרטורים (${failures.length})</h2>
        ${Object.entries(failures.reduce((acc, f) => {
          const key = f.split(':')[0].trim() + ' — ' +
            (f.includes('נדחתה') ? 'התשובה הנכונה נדחתה'
              : f.includes('מייצרת תשובה נכונה') ? 'תשובה שגויה שהיא נכונה'
              : f.includes('לא אובחנה') ? 'לא אובחנה'
              : 'אחר');
          (acc[key] = acc[key] || []).push(f);
          return acc;
        }, {})).sort((a, b) => b[1].length - a[1].length).map(([key, list]) => `
          <div class="note-warn" style="margin-bottom:.6rem">
            <strong>${key} — ${list.length} מקרים</strong>
            <ol class="muted">${list.slice(0, 3).map(f => `<li dir="auto">${f}</li>`).join('')}</ol>
          </div>`).join('')}
      </div>` : ''}`;
}
