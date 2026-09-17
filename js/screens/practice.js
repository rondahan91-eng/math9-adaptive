// ==========================================================================
// practice.js - לולאת התרגול: שאלה → תשובה → אבחון → משוב
// ==========================================================================
// סדר האירועים חשוב, וזו הנקודה שבה המערכת שונה מלומדה שמבוססת על AI:
//   1. המנוע המתמטי פוסק אם התשובה נכונה - בוודאות, לא בהערכה.
//   2. האבחון משווה את התשובה לתשובות שהגנרטור חישב מראש לכל תפיסה מוטעית.
//   3. מודל השליטה מתעדכן (רק על הניסיון הראשון בכל תרגיל).
//   4. רק עכשיו, ורק אם התלמיד ביקש, ה-AI מנסח רמז - עם כל זה כהקשר.

import { SKILL_BY_ID } from '../curriculum/skills.js';
import { generateExercise } from '../curriculum/generators.js';
import { misconception } from '../curriculum/misconceptions.js';
import { checkAnswer, checkRoots } from '../math/check.js';
import { renderExpr, renderInline } from '../math/render.js';
import { diagnose } from '../learn/diagnose.js';
import {
  selectNextSkill, levelFor, updateSkill, recordMisconception,
  decayMisconceptions, isMastered,
} from '../learn/mastery.js';
import { isSkillRevealed } from '../learn/reveals.js';
import { CONFIG } from '../config.js';
import { escapeHtml, symbolBar, wireSymbolBar, progressBar } from '../ui.js';
import { askTutor } from '../tutor.js';
import {
  newThread, pushQuestion, pushAnswer, dropLastQuestion, threadFull,
  preparedQuestions, questionsLeft, recordQuestion, refundQuestion, TURNS_PER_EXERCISE,
} from '../learn/conversation.js';

export function renderPractice(root, ctx, params = {}) {
  const round = { done: 0, correct: 0, forcedSkill: params.skillId || null };
  let ex = null;      // התרגיל הנוכחי
  let attempts = 0;   // ניסיונות בתרגיל הנוכחי
  let settled = false; // האם התרגיל כבר נסגר (נכון / נחשף הפתרון)
  let scored = false;  // האם כבר עדכנּו את מודל השליטה עבור התרגיל הזה
  let lastResult = null;
  let lastMisconception = null;
  let typed = ''; // מה שהתלמיד/ה הקליד/ה - נשמר בין רינדורים כדי שלא ייעלם
  let thread = newThread();
  let tutorBusy = false;
  let tutorError = '';

  root.innerHTML = `
    <div class="spread" style="margin-bottom:.8rem">
      <button class="ghost small" data-back>← חזרה למפה</button>
      <span class="muted" id="round-info"></span>
    </div>
    <div id="ex-card"></div>`;

  root.querySelector('[data-back]').addEventListener('click', () => ctx.navigate('home'));
  const card = root.querySelector('#ex-card');
  const roundInfo = root.querySelector('#round-info');

  nextExercise();

  // -------------------------------------------------------------- זרימה
  function nextExercise() {
    const choice = round.forcedSkill && isSkillRevealed(round.forcedSkill)
      ? { skillId: round.forcedSkill, reason: 'chosen' }
      : selectNextSkill(ctx.state);
    // המורה יכולה להסתיר שלב באמצע סבב, והמיומנות שנבחרה עלולה להיעלם
    if (!choice.skillId) return nothingOpen();
    const level = levelFor(ctx.state, choice.skillId);
    const seed = (Date.now() ^ (round.done * 2654435761)) >>> 0;
    ex = { ...generateExercise(choice.skillId, level, seed), reason: choice.reason };
    attempts = 0;
    settled = false;
    scored = false;
    lastResult = null;
    lastMisconception = null;
    typed = '';
    thread = newThread(); // הקשר של תרגיל קודם מבלבל יותר משהוא עוזר
    tutorBusy = false;
    tutorError = '';
    paint();
  }

  function paint(feedbackHtml = '') {
    const skill = SKILL_BY_ID[ex.skillId];
    roundInfo.textContent = `תרגיל ${round.done + 1} · ${round.correct} נכונות בסבב`;

    card.innerHTML = `
      <div class="card">
        <div class="spread" style="margin-bottom:.4rem">
          <div>
            <span class="badge">${escapeHtml(skill.title)}</span>
            <span class="badge">רמה ${ex.level}</span>
            ${ex.reason === 'remediation' ? '<span class="badge warn">חזרה ממוקדת</span>' : ''}
          </div>
          <button class="ghost small" data-lesson>הסבר על הנושא</button>
        </div>

        <p style="margin:.6rem 0 0">${renderInline(ex.prompt)}</p>
        <span class="exercise-expr">${renderExpr(ex.exprText)}</span>

        <form id="answer-form" class="stack">
          <input class="answer-input" id="answer" type="text" autocomplete="off"
                 spellcheck="false" value="${escapeHtml(typed)}"
                 placeholder="${ex.mode === 'roots' ? 'למשל: 3, -5' : 'כתבו כאן את התשובה'}"
                 ${settled ? 'disabled' : ''}>
          ${settled ? '' : symbolBar()}
          <div class="row">
            ${settled
              ? `<button type="button" class="primary" data-next>תרגיל הבא</button>`
              : `<button type="submit" class="primary">בדיקה</button>
                 <button type="button" data-reveal>הראו לי את הפתרון</button>`}
          </div>
        </form>

        <div id="feedback">${feedbackHtml}</div>
        <div id="tutor">${tutorPanel()}</div>
      </div>`;

    const input = card.querySelector('#answer');
    if (!settled) {
      wireSymbolBar(card, input);
      input.addEventListener('input', () => { typed = input.value; });
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    card.querySelector('#answer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(input.value);
    });
    card.querySelector('[data-next]')?.addEventListener('click', advance);
    card.querySelector('[data-reveal]')?.addEventListener('click', reveal);
    card.querySelector('[data-lesson]').addEventListener('click',
      () => ctx.navigate('lesson', { skillId: ex.skillId }));
    card.querySelectorAll('[data-ask]').forEach(btn => {
      btn.addEventListener('click', () => ask(btn.dataset.ask));
    });
  }

  // -------------------------------------------------------------- מורה פרטי
  /**
   * שלב א': כפתורים בלבד, בלי שדה שאלה חופשי. רוב תלמידי ט׳ לא יודעים לנסח
   * שאלה מתמטית, והכפתורים הם ממילא הדרך העיקרית.
   */
  function currentQuestions() {
    return preparedQuestions({
      context: 'practice',
      misconceptionId: lastMisconception,
      attempts,
      settled,
    });
  }

  function tutorPanel() {
    if (!ctx.tutor.available) return '';
    if (attempts === 0 && !settled) return '';  // חייבים לנסות לפני ששואלים

    const left = questionsLeft(ctx.state);
    const messages = thread.view.map(m => m.role === 'user'
      ? `<div class="tutor-q">${escapeHtml(m.label)}</div>`
      : `<div class="tutor-a">${m.html}</div>`).join('');

    let actions = '';
    if (tutorBusy) {
      actions = '<div class="tutor-busy">המורה הפרטי חושב…</div>';
    } else if (left <= 0) {
      actions = '<div class="tutor-note">נגמרו השאלות להיום. המכסה מתחדשת מחר.</div>';
    } else if (threadFull(thread)) {
      actions = `<div class="tutor-note">הגעתם למקסימום השאלות בתרגיל הזה. אפשר להמשיך לתרגיל הבא או לקרוא את ההסבר.</div>`;
    } else {
      actions = `<div class="tutor-actions">${currentQuestions()
        .map(q => `<button type="button" class="small" data-ask="${escapeHtml(q.id)}">${escapeHtml(q.label)}</button>`)
        .join('')}</div>`;
    }

    return `<div class="tutor">
      <div class="tutor-label">מורה פרטי</div>
      ${messages}
      ${tutorError ? `<div class="tutor-note err">${escapeHtml(tutorError)}</div>` : ''}
      ${actions}
      ${left > 0 && !tutorBusy ? `<div class="tutor-meta">נותרו ${left} שאלות היום · ${TURNS_PER_EXERCISE - thread.asked} בתרגיל הזה</div>` : ''}
    </div>`;
  }

  async function ask(questionId) {
    if (tutorBusy || questionsLeft(ctx.state) <= 0 || threadFull(thread)) return;
    const question = currentQuestions().find(q => q.id === questionId);
    if (!question) return;

    tutorError = '';
    tutorBusy = true;
    pushQuestion(thread, question.text, question.label);
    recordQuestion(ctx.state);
    ctx.save();
    paint(card.querySelector('#feedback')?.innerHTML || '');

    const res = await askTutor({
      exercise: ex,
      thread,
      studentAnswer: typed,
      misconceptionId: lastMisconception,
      attempts,
      settled,
      studentName: ctx.user.displayName,
      studentId: ctx.user.studentId,
      contextKind: 'practice',
    });

    tutorBusy = false;
    if (res.available) {
      pushAnswer(thread, res.text, res.html);
    } else {
      dropLastQuestion(thread);
      // מבטלים את הספירה האופטימית רק אם השרת לא ספר בעצמו
      if (res.refundable) refundQuestion(ctx.state);
      tutorError = res.reason || 'המורה הפרטי אינו זמין כרגע.';
    }
    ctx.save();
    paint(card.querySelector('#feedback')?.innerHTML || '');
  }

  /**
   * ההצגה של הפתרון. ברוב התרגילים "השאלה = התשובה" הוא בדיוק מה שצריך,
   * אבל בזהויות סימטריות זה מטעה: שם השורה המלמדת היא דרך
   * החישוב עצמה, ולכן הגנרטור יכול לספק solutionText משלו.
   */
  function solutionLine() {
    return ex.solutionText
      ? renderExpr(ex.solutionText)
      : `${renderExpr(ex.exprText)} = ${renderExpr(ex.answerText)}`;
  }

  // -------------------------------------------------------------- בדיקה
  function submit(text) {
    if (settled) return;
    typed = text;
    const result = ex.mode === 'roots'
      ? checkRoots(text, ex.target)
      : checkAnswer(text, ex.target, ex.mode);
    lastResult = result;

    // שגיאת תחביר אינה טעות מתמטית - לא מענישים עליה במודל השליטה
    if (result.reason === 'parse') {
      paint(`<div class="feedback warn">
        <strong>לא הצלחתי לקרוא את מה שכתבת</strong>
        ${escapeHtml(result.message || '')}<br>
        <span class="muted">אפשר להיעזר בכפתורי הסמלים שמתחת לשדה.
        כפל אפשר לכתוב פשוט: 3x, או (x+1)(x-2).</span>
      </div>`);
      return;
    }

    attempts++;
    const misId = diagnose(ex, result);
    lastMisconception = misId;

    if (!scored) {
      scored = true;
      ctx.state.skills[ex.skillId] = updateSkill(ctx.state.skills[ex.skillId], result.ok, ex.level);
      if (result.ok) decayMisconceptions(ctx.state, ex.skillId);
      else if (misId) recordMisconception(ctx.state, misId, ex.skillId);
      ctx.state.history.push({
        at: Date.now(), skillId: ex.skillId, level: ex.level,
        correct: result.ok, misconceptionId: misId || null,
      });
      if (ctx.state.history.length > 300) ctx.state.history.splice(0, ctx.state.history.length - 300);
      ctx.save();
    } else if (!result.ok && misId) {
      recordMisconception(ctx.state, misId, ex.skillId);
      ctx.save();
    }

    if (result.ok) {
      settled = true;
      round.correct++;
      const mastered = isMastered(ctx.state, ex.skillId);
      paint(`<div class="feedback ok">
        <strong>${attempts === 1 ? 'נכון!' : 'נכון — כל הכבוד על ההתמדה'}</strong>
        ${solutionLine()}
        ${mastered ? '<br><span class="badge ok">המיומנות הזו נשלטת</span>' : ''}
      </div>`);
      return;
    }

    const info = misId ? misconception(misId) : null;
    paint(`<div class="feedback err">
      <strong>${escapeHtml(info ? info.label : 'זה עדיין לא נכון')}</strong>
      ${result.message ? escapeHtml(result.message) : 'בדקו שוב את הצעד שבו יש את הטעות.'}
      ${attempts >= 2 ? `<br><span class="muted">רמז לכלל: ${renderInline(ex.rule || '')}</span>` : ''}
    </div>`);
  }

  function reveal() {
    if (settled) return;
    settled = true;
    if (!scored) {
      scored = true;
      ctx.state.skills[ex.skillId] = updateSkill(ctx.state.skills[ex.skillId], false, ex.level);
      ctx.save();
    }
    paint(`<div class="feedback warn">
      <strong>הפתרון</strong>
      ${solutionLine()}
      <br><span class="muted">${renderInline(ex.rule || '')}</span>
    </div>`);
  }

  function advance() {
    round.done++;
    if (round.done >= CONFIG.EXERCISES_PER_ROUND) return finishRound();
    nextExercise();
  }

  function nothingOpen() {
    card.innerHTML = `
      <div class="card">
        <h1>אין כרגע חומר פתוח</h1>
        <p class="muted">עדיין לא נפתחו נושאים לתרגול, או שהנושא שתרגלת הוסתר.
        ההתקדמות שלך נשמרה במלואה.</p>
        <button class="primary" data-home>חזרה למפה</button>
      </div>`;
    card.querySelector('[data-home]').addEventListener('click', () => ctx.navigate('home'));
  }

  function finishRound() {
    card.innerHTML = `
      <div class="card">
        <h1>סיימת סבב</h1>
        <p>${round.correct} תשובות נכונות מתוך ${round.done}.</p>
        ${progressBar(round.correct / Math.max(1, round.done), round.correct === round.done)}
        <div class="row" style="margin-top:1rem">
          <button class="primary" data-again>סבב נוסף</button>
          <button data-home>חזרה למפה</button>
        </div>
      </div>`;
    card.querySelector('[data-again]').addEventListener('click', () => {
      round.done = 0; round.correct = 0; nextExercise();
    });
    card.querySelector('[data-home]').addEventListener('click', () => ctx.navigate('home'));
  }

}
