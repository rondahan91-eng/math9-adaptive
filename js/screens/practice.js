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
import { renderExpr } from '../math/render.js';
import { diagnose } from '../learn/diagnose.js';
import {
  selectNextSkill, levelFor, updateSkill, recordMisconception,
  decayMisconceptions, isMastered,
} from '../learn/mastery.js';
import { CONFIG } from '../config.js';
import { escapeHtml, symbolBar, wireSymbolBar, progressBar } from '../ui.js';
import { requestTutor } from '../tutor.js';

export function renderPractice(root, ctx, params = {}) {
  const round = { done: 0, correct: 0, forcedSkill: params.skillId || null };
  let ex = null;      // התרגיל הנוכחי
  let attempts = 0;   // ניסיונות בתרגיל הנוכחי
  let settled = false; // האם התרגיל כבר נסגר (נכון / נחשף הפתרון)
  let scored = false;  // האם כבר עדכנּו את מודל השליטה עבור התרגיל הזה
  let lastResult = null;
  let lastMisconception = null;
  let typed = ''; // מה שהתלמיד/ה הקליד/ה - נשמר בין רינדורים כדי שלא ייעלם

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
    const choice = round.forcedSkill
      ? { skillId: round.forcedSkill, reason: 'chosen' }
      : selectNextSkill(ctx.state);
    const level = levelFor(ctx.state, choice.skillId);
    const seed = (Date.now() ^ (round.done * 2654435761)) >>> 0;
    ex = { ...generateExercise(choice.skillId, level, seed), reason: choice.reason };
    attempts = 0;
    settled = false;
    scored = false;
    lastResult = null;
    lastMisconception = null;
    typed = '';
    paint();
  }

  function paint(feedbackHtml = '', tutorHtml = '') {
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

        <p style="margin:.6rem 0 0">${escapeHtml(ex.prompt)}</p>
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
            ${!settled && attempts > 0 && ctx.tutor.available
              ? '<button type="button" class="ghost" data-hint>רמז</button>' : ''}
          </div>
        </form>

        <div id="feedback">${feedbackHtml}</div>
        <div id="tutor">${tutorHtml}</div>
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
    card.querySelector('[data-hint]')?.addEventListener('click', askTutor);
    card.querySelector('[data-lesson]').addEventListener('click',
      () => ctx.navigate('lesson', { skillId: ex.skillId }));
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
        <span class="muted">אפשר לכתוב חזקה כ-x^2, וכפל אפשר לכתוב פשוט כ-3x או (x+1)(x-2).</span>
      </div>`);
      return;
    }

    attempts++;
    const misId = diagnose(ex, result);
    lastMisconception = misId;

    if (!scored) {
      scored = true;
      ctx.state.skills[ex.skillId] = updateSkill(ctx.state.skills[ex.skillId], result.ok);
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
        ${renderExpr(ex.exprText)} = ${renderExpr(ex.answerText)}
        ${mastered ? '<br><span class="badge ok">המיומנות הזו נשלטת</span>' : ''}
      </div>`);
      return;
    }

    const info = misId ? misconception(misId) : null;
    paint(`<div class="feedback err">
      <strong>${escapeHtml(info ? info.label : 'זה עדיין לא נכון')}</strong>
      ${result.message ? escapeHtml(result.message) : 'בדקו שוב את הצעד שבו יש את הטעות.'}
      ${attempts >= 2 ? `<br><span class="muted">רמז לכלל: ${escapeHtml(ex.rule || '')}</span>` : ''}
    </div>`);
  }

  function reveal() {
    if (settled) return;
    settled = true;
    if (!scored) {
      scored = true;
      ctx.state.skills[ex.skillId] = updateSkill(ctx.state.skills[ex.skillId], false);
      ctx.save();
    }
    paint(`<div class="feedback warn">
      <strong>הפתרון</strong>
      ${renderExpr(ex.exprText)} = ${renderExpr(ex.answerText)}
      <br><span class="muted">${escapeHtml(ex.rule || '')}</span>
    </div>`);
    if (ctx.tutor.available) askTutor('explain');
  }

  function advance() {
    round.done++;
    if (round.done >= CONFIG.EXERCISES_PER_ROUND) return finishRound();
    nextExercise();
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

  // -------------------------------------------------------------- המורה הפרטי
  async function askTutor(stage = 'hint') {
    const tutorBox = card.querySelector('#tutor');
    tutorBox.innerHTML = `<div class="tutor loading">המורה הפרטי חושב…</div>`;
    const res = await requestTutor({
      exercise: ex,
      studentAnswer: typed,
      misconceptionId: lastMisconception,
      stage: typeof stage === 'string' ? stage : 'hint',
      attempts,
      studentName: ctx.user.displayName,
    });
    if (!res.available) {
      tutorBox.innerHTML = hintUnavailableHtml(res.reason);
      return;
    }
    tutorBox.innerHTML = `<div class="tutor">
      <div class="tutor-label">מורה פרטי</div>
      ${escapeHtml(res.text).replace(/\n+/g, '<br>')}
    </div>`;
  }

  function hintUnavailableHtml(reason) {
    return `<p class="muted" style="margin-top:.6rem">
      המורה הפרטי אינו זמין כרגע${reason ? ` — ${escapeHtml(reason)}` : ''}.
    </p>`;
  }
}
