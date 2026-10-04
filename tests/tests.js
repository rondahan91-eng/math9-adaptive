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
import { SKILLS, topoOrder, STAGES, STAGES_REVEALED_BY_DEFAULT } from '../js/curriculum/skills.js';
import { setReveals, resetReveals, revealedStages, isSkillRevealed } from '../js/learn/reveals.js';
import { mergeStates, HISTORY_LIMIT } from '../js/learn/merge.js';
import { symbolBar, wireSymbolBar } from '../js/ui.js';
import { readSpreadsheet } from '../js/students/xlsx.js';
import { buildImport, parseDob, normalizeGrade, credentialsCsv } from '../js/students/importRules.js';
import { renderExpr, renderInline } from '../js/math/render.js';
import { checkClaim, renderVerified, failureNote } from '../js/math/verify.js';
import { CONFIG } from '../js/config.js';
import { api } from '../js/api.js';
import { tutorAvailable, resetTutorStatus } from '../js/tutor.js';
import {
  newThread, pushQuestion, dropLastQuestion, threadFull, preparedQuestions,
  questionsLeft, recordQuestion, refundQuestion, setServerQuota, resetServerQuota,
  hasServerQuota, newQuestionId, DAILY_LIMIT, TURNS_PER_EXERCISE,
} from '../js/learn/conversation.js';
import { LESSONS } from '../js/curriculum/lessons.js';
import {
  emptyState, normalizeState, updateSkill, selectNextSkill, isUnlocked, isMastered,
  levelFor, overallProgress, MASTERY_THRESHOLD, MASTERY_MIN_ATTEMPTS, MASTERY_TOP_LEVEL,
} from '../js/learn/mastery.js';
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

// -------------------------------------------------------------- המורה הפרטי
group('אימות טענות המורה הפרטי');
ok('שוויון נכון עובר', checkClaim('(x+4)^2 = x^2+8x+16').kind === 'verified');
ok('שוויון שגוי נפסל', checkClaim('(x+4)^2 = x^2+16').kind === 'false');
ok('פירוק נכון עובר', checkClaim('x^2-9 = (x-3)(x+3)').kind === 'verified');
ok('פירוק שגוי נפסל', checkClaim('x^2-9 = (x-3)^2').kind === 'false');
ok('ביטוי בלי שוויון אינו טענה', checkClaim('x^2+8x+16').kind === 'expression');
ok('ביטוי לא תקין מסומן', checkClaim('x^2 = ((x').kind === 'invalid');
ok('שני סימני שוויון נפסלים', checkClaim('a = b = c').kind === 'invalid');
ok('שוויון עם אותיות גדולות עובר', checkClaim('(X+3)(X-3) = X^2-9').kind === 'verified');

const good = renderVerified('נבדוק: ⟦(x+4)^2 = x^2+8x+16⟧ ולכן חסר לך האיבר האמצעי.');
ok('תשובה תקינה לא מייצרת כשלים', good.failures.length === 0);
ok('הטענה מסומנת כמאומתת', good.html.includes('claim verified'));
ok('הטקסט העברי נשמר', good.html.includes('ולכן חסר לך האיבר האמצעי'));
ok('הסימון ⟦⟧ לא מגיע למסך', !good.html.includes('⟦') && !good.html.includes('⟧'));

const bad = renderVerified('זה פשוט: ⟦(x+4)^2 = x^2+16⟧');
ok('טענה שגויה מדווחת ככשל', bad.failures.length === 1);
ok('טענה שגויה אינה מרונדרת', !bad.html.includes('x<sup>2</sup>+16'));
ok('הודעת התיקון מכילה את הטענה', failureNote(bad.failures).includes('(x+4)^2 = x^2+16'));

group('מכסת שאלות ושאלות מוכנות');
resetServerQuota();
const qs = emptyState();
ok('מתחילים עם המכסה המלאה', questionsLeft(qs) === DAILY_LIMIT);
recordQuestion(qs); recordQuestion(qs);
ok('כל שאלה מורידה אחת', questionsLeft(qs) === DAILY_LIMIT - 2);
qs.tutorUsage = { date: '2020-01-01', count: DAILY_LIMIT };
ok('מכסה מיום קודם אינה נספרת', questionsLeft(qs) === DAILY_LIMIT);
ok('...והיא אינה נצברת מעבר למקסימום', questionsLeft(qs) <= DAILY_LIMIT);

// -------- אכיפה בצד השרת: השרת גובר על הספירה המקומית
const cheat = emptyState();
cheat.tutorUsage = null; // כאילו נוקה localStorage
setServerQuota({ limit: DAILY_LIMIT, used: DAILY_LIMIT, left: 0, date: '2026-01-01' });
ok('ניקוי הספירה המקומית לא מאפס את המכסה', questionsLeft(cheat) === 0);
ok('מצב מכסת שרת מזוהה', hasServerQuota());

setServerQuota({ limit: DAILY_LIMIT, used: 3, left: 12, date: '2026-01-01' });
ok('מכסת השרת גוברת על המקומית', questionsLeft(cheat) === 12);
recordQuestion(cheat);
ok('ספירה אופטימית מזיזה את המונה מיד', questionsLeft(cheat) === 11);
refundQuestion(cheat);
ok('החזרה מבטלת את הספירה האופטימית', questionsLeft(cheat) === 12);
setServerQuota({ limit: DAILY_LIMIT, used: 9, left: 6, date: '2026-01-01' });
ok('תשובת השרת דורסת את ההערכה המקומית', questionsLeft(cheat) === 6);
setServerQuota(null);
ok('ערך לא תקין מהשרת אינו הורס את המצב', questionsLeft(cheat) === 6);
resetServerQuota();
ok('איפוס מחזיר לספירה המקומית', questionsLeft(qs) === DAILY_LIMIT);

const idA = newQuestionId(), idB = newQuestionId();
ok('מזהה שאלה ייחודי', idA !== idB && idA.startsWith('q_'));

// -------- מתג הכיבוי: כשהתכונה כבויה אין אפילו פנייה לשרת
let statusCalls = 0;
const realStatus = api.tutorStatus;
api.tutorStatus = async () => { statusCalls++; return { available: true, reason: '' }; };
resetTutorStatus();
const availability = await tutorAvailable();
api.tutorStatus = realStatus;
resetTutorStatus();
ok(`הדגל TUTOR_ENABLED=${CONFIG.TUTOR_ENABLED} נאכף`,
  CONFIG.TUTOR_ENABLED ? availability.available : !availability.available);
ok('כשהתכונה כבויה לא נשלחת בקשה לשרת',
  CONFIG.TUTOR_ENABLED ? statusCalls === 1 : statusCalls === 0);

ok('אין שאלות לפני ניסיון ראשון',
  preparedQuestions({ context: 'practice', attempts: 0 }).length === 0);
ok('אחרי טעות בלי אבחון - שאלות פתיחה',
  preparedQuestions({ context: 'practice', attempts: 1 }).length === 3);
const withMis = preparedQuestions({ context: 'practice', attempts: 1, misconceptionId: 'sq-no-middle' });
ok('אבחון מייצר שאלות על הטעות עצמה', withMis.some(q => q.id === 'why-wrong'));
ok('...והשאלה מזכירה את שם התפיסה',
  withMis.find(q => q.id === 'why-wrong').text.includes('שכחת את האיבר האמצעי'));
ok('אחרי חשיפת פתרון - שאלות סיכום',
  preparedQuestions({ context: 'practice', attempts: 2, settled: true }).some(q => q.id === 'recap'));
ok('בשיעור - שאלות על ההסבר',
  preparedQuestions({ context: 'lesson' }).some(q => q.id === 'example'));

const th = newThread();
for (let i = 0; i < TURNS_PER_EXERCISE; i++) pushQuestion(th, `q${i}`, `q${i}`);
ok('מגבלת סבבים בתרגיל נאכפת', threadFull(th));
dropLastQuestion(th);
ok('הסרת סבב שנכשל מפנה מקום', !threadFull(th));
ok('view ו-turns נשארים מסונכרנים', th.view.length === th.turns.length);

group('גנרטורים - סריקה מלאה');
const SEEDS = 120;
let genFail = 0, wrongFail = 0, diagFail = 0, renderFail = 0, total = 0;
const failures = [];

for (const skill of SKILLS) {
  ok(`קיים גנרטור ל-${skill.title}`, typeof GENERATORS[skill.id] === 'function');
  ok(`קיים שיעור ל-${skill.title}`, !!LESSONS[skill.id]);
  if (!GENERATORS[skill.id]) continue;

  for (let level = 1; level <= MASTERY_TOP_LEVEL; level++) {
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
      for (const [what, text] of [['השאלה', exercise.exprText], ['התשובה', exercise.answerText],
        ['הכלל', exercise.rule], ['ההנחיה', exercise.prompt], ['הפתרון', exercise.solutionText]]) {
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
      const targetRf = exercise.target?.den
        ? exercise.target
        : (exercise.target?.terms ? ratFunc(exercise.target, pOne()) : null);
      for (const wrong of exercise.wrongs || []) {
        if (wrong.rf && targetRf && rfEqual(wrong.rf, targetRf)) {
          wrongFail++;
          failures.push(`${skill.id} L${level}: "${exercise.exprText}" — התפיסה "${wrong.id}" מייצרת תשובה נכונה`);
          continue;
        }
        // 3. ...וחייבת להיות מאובחנת (לא בהכרח לאותו id, אם שתי תפיסות מתלכדות)
        const fake = wrong.roots
          ? { ok: false, reason: 'value', roots: wrong.roots }
          : { ok: false, reason: 'value', value: wrong.rf };
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
  for (let level = 1; level <= MASTERY_TOP_LEVEL; level++) {
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

/** מדמה רצף תשובות במיומנות אחת, עם הרמה שהמנוע היה מגיש בכל צעד. */
function drill(state, skillId, results) {
  for (const correct of results) {
    const level = levelFor(state, skillId);
    state.skills[skillId] = updateSkill(state.skills[skillId], correct, level);
  }
  return state.skills[skillId];
}

let sk = drill(st, 'monomial-mult', [true, true]);
ok('שתי תשובות נכונות מספיקות ל-p גבוה', sk.p >= MASTERY_THRESHOLD, `p=${sk.p.toFixed(3)}`);
ok('אבל שתיים אינן "נשלט" — חסרים ניסיונות', !isMastered(st, 'monomial-mult'),
  `attempts=${sk.attempts}, topLevel=${sk.maxCorrectLevel}`);

sk = drill(st, 'monomial-mult', [true, true]);
ok('גם ארבע נכונות אינן מספיקות — הסולם עוד לא הגיע לראש', !isMastered(st, 'monomial-mult'),
  `attempts=${sk.attempts}, topLevel=${sk.maxCorrectLevel}`);

sk = drill(st, 'monomial-mult', [true, true]);
ok(`שש נכונות כולל רמה ${MASTERY_TOP_LEVEL} — נשלט`, isMastered(st, 'monomial-mult'),
  `p=${sk.p.toFixed(3)}, attempts=${sk.attempts}, topLevel=${sk.maxCorrectLevel}`);
ok('הראיה נרשמה ברמה הגבוהה', sk.maxCorrectLevel >= MASTERY_TOP_LEVEL);

// הבאג שתוקן: אי אפשר להיקבע כשולט בלי לפתור תרגיל ברמה הגבוהה
const stx = emptyState();
stx.skills['sq-sum'] = { p: 0.99, attempts: 20, correct: 20, streak: 20, maxCorrectLevel: 2 };
ok(`p גבוה בלי ראיה ברמה ${MASTERY_TOP_LEVEL} אינו שליטה`, !isMastered(stx, 'sq-sum'));
ok('...והמנוע מגיש את הרמה הבאה בסולם כדי לסגור את הפער', levelFor(stx, 'sq-sum') === 3);
stx.skills['sq-sum'].maxCorrectLevel = MASTERY_TOP_LEVEL;
ok('אחרי תשובה נכונה ברמה הגבוהה — נשלט', isMastered(stx, 'sq-sum'));

// הסולם: כל הרמות מוגשות בפועל, אחת אחרי השנייה, בלי דילוג
const reachable = [];
let probe = emptyState();
for (let i = 0; i < MASTERY_TOP_LEVEL + 2; i++) {
  const lvl = levelFor(probe, 'monomial-mult');
  reachable.push(lvl);
  probe.skills['monomial-mult'] = updateSkill(probe.skills['monomial-mult'], true, lvl);
}
ok(`הסולם עולה 1 → … → ${MASTERY_TOP_LEVEL} בלי לדלג`,
  reachable.slice(0, MASTERY_TOP_LEVEL).join(',') === [1, 2, 3, 4, 5].slice(0, MASTERY_TOP_LEVEL).join(','),
  `רמות: ${reachable.join(',')}`);
ok('אין קפיצה של יותר מרמה אחת בכל צעד',
  reachable.every((l, i) => i === 0 || l - reachable[i - 1] <= 1), `רמות: ${reachable.join(',')}`);
ok('כל הרמות נגישות בפועל', new Set(reachable).size === MASTERY_TOP_LEVEL,
  `רמות: ${reachable.join(',')}`);

// כישלון ברמה מסוימת לא מקדם הלאה
const stuck = emptyState();
stuck.skills['sq-sum'] = updateSkill(stuck.skills['sq-sum'], true, 1);
for (let i = 0; i < 3; i++) {
  stuck.skills['sq-sum'] = updateSkill(stuck.skills['sq-sum'], false, levelFor(stuck, 'sq-sum'));
}
ok('כישלון חוזר ברמה 2 לא מקדם לרמה 3', levelFor(stuck, 'sq-sum') <= 2,
  `רמה=${levelFor(stuck, 'sq-sum')}, topLevel=${stuck.skills['sq-sum'].maxCorrectLevel}`);

let sk2 = updateSkill(sk, false, 3);
ok('טעות אחת אחרי שליטה לא מאפסת', sk2.p > 0.5, `p=${sk2.p.toFixed(3)}`);
let sk3 = updateSkill(emptyState().skills['sq-sum'], true, 1);
ok('תשובה נכונה אחת לא מספיקה', sk3.p < MASTERY_THRESHOLD, `p=${sk3.p.toFixed(3)}`);

ok('שליטה ביסוד פותחת את הבאה', isUnlocked(st, 'distribute-mono'));

// תאימות לאחור: מצב שנשמר לפני שהוסף השדה החדש
const legacy = normalizeState({ skills: { 'monomial-mult': { p: 0.95, attempts: 9, correct: 9, streak: 9 } } });
ok('מצב ישן מקבל ברירת מחדל לשדה חדש',
  legacy.skills['monomial-mult'].maxCorrectLevel === 0);
ok('מצב ישן שומר על הערכים שהיו', legacy.skills['monomial-mult'].p === 0.95);
ok('מצב ישן מקבל את כל המיומנויות', Object.keys(legacy.skills).length === SKILLS.length);

ok('התקדמות לא מגיעה ל-100% בלי שליטה בפועל', overallProgress(stx) < 1);

// -------------------------------------------------------------- חשיפת שלבים
group('חשיפת שלבים ע"י המורה');
resetReveals();
ok('בלי החלטת מורה - שני השלבים הראשונים פתוחים',
  revealedStages().join(' | ') === STAGES_REVEALED_BY_DEFAULT.join(' | '),
  revealedStages().join(' | '));
ok('...ולכן מיומנות בשלב הרביעי אינה גלויה', !isSkillRevealed('symmetric-values'));
ok('...ומיומנות בשלב השני כן', isSkillRevealed('sq-sum'));

const rv = emptyState();
rv.skills['monomial-mult'] = { p: 0.99, attempts: 9, correct: 9, streak: 9, maxCorrectLevel: 5 };
rv.skills['distribute-mono'] = { p: 0.99, attempts: 9, correct: 9, streak: 9, maxCorrectLevel: 5 };
ok('מיומנות בשלב שנחשף ושקדם-הדרישות שלה נשלטות - פתוחה',
  isUnlocked(rv, 'distribute-binom'));

setReveals(STAGES.map(s => ({ stage: s, revealed: s !== 'יסודות' })));
ok('הסתרת שלב מוציאה אותו מהמפה', !revealedStages().includes('יסודות'));
ok('...והמיומנויות שבו אינן פתוחות יותר', !isUnlocked(rv, 'distribute-mono'));
ok('...אבל ההתקדמות עצמה נשמרת במלואה',
  rv.skills['distribute-mono'].p === 0.99 && rv.skills['distribute-mono'].attempts === 9);

setReveals(STAGES.map(s => ({ stage: s, revealed: true })));
ok('חשיפה מחדש מחזירה את המצב בדיוק כפי שהיה', isUnlocked(rv, 'distribute-mono'));

// המכנה של אחוז ההתקדמות הוא רק מה שנחשף
setReveals([{ stage: 'יסודות', revealed: true }]);
const only = emptyState();
for (const id of ['monomial-mult', 'distribute-mono', 'distribute-binom']) {
  only.skills[id] = { p: 0.99, attempts: 9, correct: 9, streak: 9, maxCorrectLevel: MASTERY_TOP_LEVEL };
}
ok('שליטה בכל מה שנחשף = 100%, ולא שליש', overallProgress(only) === 1,
  `${Math.round(overallProgress(only) * 100)}%`);

setReveals(STAGES.map(s => ({ stage: s, revealed: false })));
ok('כשאין שום שלב פתוח אין מה להגיש', selectNextSkill(emptyState()).skillId === null);
ok('...והתקדמות היא 0 ולא NaN', overallProgress(emptyState()) === 0);

setReveals([{ stage: 'פירוק לגורמים', revealed: true }]);
ok('שלב שנחשף בלי הבסיס שלו - גלוי אבל נעול',
  isSkillRevealed('factor-common') && !isUnlocked(emptyState(), 'factor-common'));

resetReveals();

// -------------------------------------------------------------- שימור התקדמות
// הדרישה: התקדמות של תלמיד/ה חייבת לשרוד שנה שלמה. כל בדיקה כאן מתארת דרך
// ממשית שבה היא הייתה יכולה להימחק.
group('שימור התקדמות לאורך השנה');

const workedState = (over) => {
  const s = emptyState();
  s.skills['monomial-mult'] = { p: 0.97, attempts: 12, correct: 11, streak: 4, maxCorrectLevel: 5 };
  s.skills['sq-sum'] = { p: 0.8, attempts: 5, correct: 4, streak: 2, maxCorrectLevel: 3 };
  s.history = [
    { at: 1000, skillId: 'monomial-mult', level: 1, correct: true, misconceptionId: null },
    { at: 2000, skillId: 'sq-sum', level: 2, correct: false, misconceptionId: 'sq-no-middle' },
  ];
  s.misconceptions = { 'sq-no-middle': { skillId: 'sq-sum', strength: 0.6, seen: 2, lastAt: 2000 } };
  return Object.assign(s, over);
};

const year = workedState();
const blank = emptyState();
ok('מצב ריק שנשלח אחרי תקלה אינו מוחק עבודה',
  mergeStates(year, blank).skills['monomial-mult'].attempts === 12);
ok('...וגם בכיוון ההפוך', mergeStates(blank, year).skills['monomial-mult'].attempts === 12);
ok('...וההיסטוריה נשמרת', mergeStates(blank, year).history.length === 2);

// שני מכשירים: בבית נפתרו תרגילים, ובכיתה נפתרו אחרים
const home = workedState();
home.skills['sq-sum'] = { p: 0.95, attempts: 9, correct: 8, streak: 3, maxCorrectLevel: 4 };
home.history = [...home.history, { at: 3000, skillId: 'sq-sum', level: 3, correct: true, misconceptionId: null }];
const school = workedState();
school.skills['sq-diff'] = { p: 0.7, attempts: 3, correct: 2, streak: 1, maxCorrectLevel: 2 };
school.history = [...school.history, { at: 2500, skillId: 'sq-diff', level: 1, correct: true, misconceptionId: null }];

const both = mergeStates(home, school);
ok('עבודה משני מכשירים מצטרפת, ולא מתחלפת',
  both.skills['sq-sum'].attempts === 9 && both.skills['sq-diff'].attempts === 3,
  JSON.stringify({ sum: both.skills['sq-sum'].attempts, diff: both.skills['sq-diff'].attempts }));
ok('...וההיסטוריה מאוחדת לפי זמן',
  both.history.map(h => h.at).join(',') === '1000,2000,2500,3000', both.history.map(h => h.at).join(','));
ok('...ואותו אירוע אינו נספר פעמיים', both.history.filter(h => h.at === 1000).length === 1);
ok('רמת הראיה הגבוהה ביותר נשמרת', both.skills['sq-sum'].maxCorrectLevel === 4);
ok('המיזוג סימטרי במונים',
  JSON.stringify(mergeStates(school, home).skills['sq-sum']) === JSON.stringify(both.skills['sq-sum']));

ok('מיזוג לעולם אינו מקטין ניסיונות', (() => {
  for (const [x, y] of [[year, blank], [blank, year], [home, school], [school, home]]) {
    const m = mergeStates(x, y);
    for (const id of Object.keys(m.skills)) {
      const a = x.skills?.[id]?.attempts || 0, b = y.skills?.[id]?.attempts || 0;
      if (m.skills[id].attempts < Math.max(a, b)) return false;
    }
  }
  return true;
})());

ok('תפיסה מוטעית שמורה עם הספירה הגבוהה',
  mergeStates(year, { ...blank, misconceptions: { 'sq-no-middle': { skillId: 'sq-sum', strength: 0.3, seen: 5, lastAt: 5000 } } })
    .misconceptions['sq-no-middle'].seen === 5);
ok('מכסת שאלות: אותו יום - הספירה הגבוהה',
  mergeStates({ ...blank, tutorUsage: { date: '2026-10-04', count: 3 } },
    { ...blank, tutorUsage: { date: '2026-10-04', count: 7 } }).tutorUsage.count === 7);
ok('מכסת שאלות: יום חדש מנצח',
  mergeStates({ ...blank, tutorUsage: { date: '2026-10-04', count: 9 } },
    { ...blank, tutorUsage: { date: '2026-10-05', count: 1 } }).tutorUsage.date === '2026-10-05');

ok('היסטוריה ארוכה נגזמת ושומרת את האחרונים', (() => {
  const many = { ...blank, history: Array.from({ length: 500 }, (_, i) => ({ at: i, skillId: 'sq-sum', level: 1, correct: true })) };
  const m = mergeStates(many, blank);
  return m.history.length === HISTORY_LIMIT && m.history[m.history.length - 1].at === 499;
})());

ok('מצב ממוזג עובר נרמול ונשאר תקין',
  Object.keys(normalizeState(mergeStates(home, school)).skills).length === SKILLS.length);

// -------------------------------------------------------------- כתיבת חזקות
// הסימן ^ לעולם לא נשאר בשדה: הוא רק מפעיל "מצב חזקה", וממנו והלאה כל ספרה
// נכתבת בכתב עילי. הבדיקות מדמות אירועי קלט אמיתיים של הדפדפן.
group('כתיבת חזקות בשדה התשובה');

function makeField() {
  const host = document.createElement('div');
  host.innerHTML = `${symbolBar()}<input class="answer-input" type="text">`;
  const input = host.querySelector('input');
  wireSymbolBar(host, input);
  return { host, input };
}
function typeInto(input, text) {
  for (const ch of text) {
    const caret = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, caret) + ch + input.value.slice(caret);
    input.setSelectionRange(caret + 1, caret + 1);
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true }));
  }
  return input.value;
}
function backspace(input) {
  const caret = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, caret - 1) + input.value.slice(caret);
  input.setSelectionRange(caret - 1, caret - 1);
  input.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
  return input.value;
}
const powerButton = (host) => host.querySelector('[data-power]');

{
  const { input } = makeField();
  ok('^ אינו נשאר בשדה, והספרה הופכת לעילית', typeInto(input, '9x^4') === '9x⁴', input.value);
}
{
  const { input } = makeField();
  ok('חזקה דו-ספרתית', typeInto(input, 'x^12') === 'x¹²', input.value);
}
{
  const { input } = makeField();
  ok('תו שאינו ספרה מסיים את מצב החזקה', typeInto(input, 'x^2+3x') === 'x²+3x', input.value);
}
{
  const { host, input } = makeField();
  powerButton(host).click();
  typeInto(input, '4');
  ok('כפתור xⁿ מפעיל מצב חזקה בלי להקליד תו', input.value === '⁴', input.value);
  ok('...והכפתור מסומן כפעיל', powerButton(host).getAttribute('aria-pressed') === 'true');
  typeInto(input, 'x');
  ok('...והסימון מתבטל כשהמצב מסתיים', powerButton(host).getAttribute('aria-pressed') === 'false');
}
{
  const { input } = makeField();
  typeInto(input, '5x^4');
  backspace(input);
  ok('מחיקת ספרת החזקה משאירה את מצב החזקה פעיל', typeInto(input, '7') === '5x⁷', input.value);
}
{
  const { input } = makeField();
  typeInto(input, '5x^4');
  backspace(input); backspace(input);
  ok('מחיקה מעבר לחזקה מסיימת את המצב', typeInto(input, '7') === '57', input.value);
}
{
  const { input } = makeField();
  input.value = '3x^2 + x^10';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
  ok('הדבקה של טקסט עם ^ מנורמלת לכתב עילי', input.value === '3x² + x¹⁰', input.value);
}
{
  const { input } = makeField();
  ok('התשובה שנכתבת בכתב עילי נבדקת נכון',
    checkAnswer(typeInto(input, '9X^4'), evalPoly('9x^4'), 'expand').ok, input.value);
}

// -------------------------------------------------------------- ייבוא תלמידים
group('ייבוא תלמידים מ-Excel');
ok('תאריך טקסט DD/MM/YYYY', parseDob('07/03/2011') === '070311');
ok('תאריך ISO', parseDob('2011-12-24') === '241211');
ok('מספר סידורי של Excel', parseDob(40609) === '070311', parseDob(40609));
ok('מערכת התאריכים של 1904', parseDob(39147, true) === '070311', parseDob(39147, true));
ok('31/02 אינו תאריך', parseDob('31/02/2011') === null);
ok('מספר קטן אינו תאריך', parseDob(12) === null);
ok('כיתה עם גרש: ט\'1 → ט1', normalizeGrade("ט'1") === 'ט1');
ok('כיתה עם רווח: ט\' 2 → ט2', normalizeGrade("ט' 2") === 'ט2');

const fetchFile = async (name, type) => {
  const res = await fetch(`./fixtures/${name}`);
  return new File([await res.arrayBuffer()], name, { type });
};

const xlsxSheet = await readSpreadsheet(await fetchFile('students.xlsx'));
ok('קובץ xlsx אמיתי נקרא', xlsxSheet.rows.length >= 10, `${xlsxSheet.rows.length} שורות`);
ok('נקרא הגיליון הראשון לפי הסדר, לא האחרון שנוצר',
  String(xlsxSheet.rows[0]?.[0] || '').startsWith('רשימת תלמידים'));

const imp = buildImport(xlsxSheet, [{ username: 'demo', displayName: 'תלמיד/ה לדוגמה' }]);
const byName = (list, n) => list.find(r => r.displayName === n);
ok('שורת הכותרת נמצאה גם אחרי שורות פתיחה', imp.mode === 'derived' && !imp.error, imp.error || imp.mode);
ok('נועה כהן: שם משתמש וסיסמה לפי הכלל',
  byName(imp.valid, 'נועה כהן')?.username === 'נועה482' && byName(imp.valid, 'נועה כהן')?.password === '070311',
  JSON.stringify(byName(imp.valid, 'נועה כהן')));
ok('ת.ז שמתחילה ב-0 ותאריך כטקסט',
  byName(imp.valid, 'איתי לוי')?.username === 'איתי671' && byName(imp.valid, 'איתי לוי')?.password === '151110',
  JSON.stringify(byName(imp.valid, 'איתי לוי')));
ok('אותו שם פרטי ואותן ספרות - מקבל סיומת',
  byName(imp.valid, 'נועה מזרחי')?.username === 'נועה482_2', byName(imp.valid, 'נועה מזרחי')?.username);
ok('הכיתה נשמרת עם המקבילה', byName(imp.valid, 'נועה מזרחי')?.grade === 'ט2');
ok('שורה ריקה מדולגת בשקט', !imp.invalid.some(r => r.excelRow === 7));
ok('חסר תאריך לידה - נדחה עם סיבה', /תאריך/.test(byName(imp.invalid, 'דניאל פרץ')?.reason || ''));
ok('תלמיד שמופיע פעמיים - נדחה', /פעמיים/.test(imp.invalid.find(r => r.excelRow === 9)?.reason || ''),
  JSON.stringify(imp.invalid));
ok('תאריך שלא קיים - נדחה', !!byName(imp.invalid, 'יעל אברהם'));
ok('שורה בלי שם - נדחית', imp.invalid.some(r => r.excelRow === 11), JSON.stringify(imp.invalid));
ok('בדיוק שלושה נוצרים מהקובץ', imp.valid.length === 3, imp.valid.map(v => v.username).join(', '));
ok('מספר ת.ז אינו נשלח הלאה', imp.valid.every(v => !('idNumber' in v)));

// ייבוא חוזר של אותו קובץ אינו יוצר כפילויות
const again = buildImport(xlsxSheet, imp.valid.map(v => ({ username: v.username, displayName: v.displayName })));
ok('ייבוא חוזר - כולם מזוהים כקיימים', again.valid.length === 0 && again.existing.length === 3,
  `חדשים ${again.valid.length}, קיימים ${again.existing.length}`);

const csvSheet = await readSpreadsheet(await fetchFile('students-1255.csv', 'text/csv'));
const csvImp = buildImport(csvSheet);
ok('CSV בקידוד Windows-1255 נקרא כעברית', byName(csvImp.valid, 'רון דהן')?.username === 'רון987',
  JSON.stringify(csvImp.valid[0] || csvImp.error));
ok('פסיק בתוך מרכאות אינו מפצל עמודה', !!byName(csvImp.valid, 'שירה, מיכל גבאי'),
  csvImp.valid.map(v => v.displayName).join(' | '));

const creds = buildImport({ rows: [
  ['שם מלא', 'כיתה', 'שם משתמש', 'סיסמה'],
  ['רוני אלון', 'ט3', 'roni', 'abcd1'],
  ['גיל בר', 'ט3', 'gil bar', 'x1234'],
  ['מאיה', 'ט3', 'demo', 'zzzz9'],
] }, [{ username: 'demo', displayName: 'תלמיד/ה לדוגמה' }]);
ok('קובץ עם פרטי כניסה מוכנים - נלקחים כמו שהם',
  creds.mode === 'credentials' && creds.valid[0]?.username === 'roni' && creds.valid[0]?.password === 'abcd1',
  JSON.stringify(creds));
ok('שם משתמש עם רווח נדחה', creds.invalid.some(r => /רווח/.test(r.reason)));
ok('שם משתמש תפוס נדחה ולא מקבל סיומת', creds.invalid.some(r => /תפוס/.test(r.reason)));

const missingCols = buildImport({ rows: [['שם', 'טלפון'], ['x', '1']] });
ok('קובץ בלי העמודות הנדרשות - הודעה ברורה', /ת\.ז|כיתה/.test(missingCols.error || ''), missingCols.error);

let xlsError = '';
try { await readSpreadsheet(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])], 'old.xls')); }
catch (e) { xlsError = e.message; }
ok('קובץ xls ישן - מבקש לשמור כ-xlsx', /xlsx/.test(xlsError), xlsError);

// התבנית שהמורה מורידה מהמסך - ריקה וממולאת
const blankRes = await fetch('../templates/students-template.xlsx');
const blankTpl = buildImport(await readSpreadsheet(new File([await blankRes.arrayBuffer()], 'template.xlsx')));
ok('התבנית הריקה מזוהה (בלי שגיאת עמודות)', !blankTpl.error && blankTpl.valid.length === 0, blankTpl.error);
const filledTpl = buildImport(await readSpreadsheet(await fetchFile('template-filled.xlsx')));
ok('תבנית ממולאת נקלטת, עם ת.ז שמתחילה ב-0',
  filledTpl.valid.length === 1 && filledTpl.valid[0].username === 'שקד678' && filledTpl.valid[0].password === '090411',
  JSON.stringify(filledTpl.valid[0] || filledTpl.error || filledTpl.invalid));

const credCsv = credentialsCsv([{ grade: 'ט1', displayName: 'נועה "הגדולה" כהן', username: 'נועה482', password: '070311' }]);
ok('קובץ פרטי הכניסה נפתח נכון בעברית ב-Excel',
  credCsv.startsWith('﻿') && credCsv.includes('"נועה ""הגדולה"" כהן"'));

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
