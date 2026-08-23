// ==========================================================================
// lesson.js - עמוד ההסבר של מיומנות
// ==========================================================================

import { SKILL_BY_ID } from '../curriculum/skills.js';
import { lessonFor } from '../curriculum/lessons.js';
import { isUnlocked, isMastered, MASTERY_THRESHOLD } from '../learn/mastery.js';
import { renderInline } from '../math/render.js';
import { escapeHtml, progressBar } from '../ui.js';
import { askAboutLesson } from '../tutor.js';
import {
  newThread, pushQuestion, pushAnswer, dropLastQuestion, threadFull,
  preparedQuestions, questionsLeft, recordQuestion,
} from '../learn/conversation.js';

export function renderLesson(root, ctx, params) {
  const skill = SKILL_BY_ID[params.skillId];
  if (!skill) { ctx.navigate('home'); return; }
  const lesson = lessonFor(skill.id);
  const s = ctx.state.skills[skill.id] || { p: 0, attempts: 0, correct: 0 };
  const unlocked = isUnlocked(ctx.state, skill.id);

  root.innerHTML = `
    <button class="ghost small" data-back>← חזרה למפה</button>
    <div class="card" style="margin-top:.6rem">
      <div class="spread">
        <div>
          <h1 style="margin-bottom:.2rem">${escapeHtml(skill.title)}</h1>
          <p class="muted" style="margin:0">${escapeHtml(skill.stage)}</p>
        </div>
        ${isMastered(ctx.state, skill.id) ? '<span class="badge ok">נשלט</span>' : ''}
      </div>
      ${progressBar(s.p / MASTERY_THRESHOLD, isMastered(ctx.state, skill.id))}
      ${lesson ? `<p style="margin-top:.9rem;margin-bottom:0">${escapeHtml(lesson.intro)}</p>` : ''}
    </div>

    ${lesson ? `<div class="card stack">${lesson.body.map(renderBlock).join('')}</div>` : ''}

    <div id="lesson-tutor"></div>

    <div class="card">
      ${unlocked
        ? `<button class="primary" data-practice>לתרגל את ${escapeHtml(skill.title)}</button>`
        : `<p class="muted" style="margin:0">כדי לתרגל את הנושא הזה צריך קודם לשלוט ב:
             ${skill.prereqs.map(p => escapeHtml(SKILL_BY_ID[p].title)).join(', ')}.
             אפשר לקרוא את ההסבר כבר עכשיו.</p>`}
    </div>`;

  root.querySelector('[data-back]').addEventListener('click', () => ctx.navigate('home'));
  root.querySelector('[data-practice]')
    ?.addEventListener('click', () => ctx.navigate('practice', { skillId: skill.id }));

  wireLessonTutor(root.querySelector('#lesson-tutor'), ctx, skill);
}

// -------------------------------------------------------------- מורה פרטי בשיעור
/**
 * בשיעור אין ניסיון שקדם לשאלה, ולכן אין כאן את הכלל "חייבים לנסות קודם" —
 * הוא שייך לתרגול. השאלות כאן הן על ההסבר עצמו.
 */
function wireLessonTutor(host, ctx, skill) {
  if (!host || !ctx.tutor.available) return;
  const thread = newThread();
  let busy = false;
  let error = '';

  const questions = () => preparedQuestions({ context: 'lesson' });

  function paint() {
    const left = questionsLeft(ctx.state);
    const messages = thread.view.map(m => m.role === 'user'
      ? `<div class="tutor-q">${escapeHtml(m.label)}</div>`
      : `<div class="tutor-a">${m.html}</div>`).join('');

    let actions;
    if (busy) actions = '<div class="tutor-busy">המורה הפרטי חושב…</div>';
    else if (left <= 0) actions = '<div class="tutor-note">נגמרו השאלות להיום. המכסה מתחדשת מחר.</div>';
    else if (threadFull(thread)) actions = '<div class="tutor-note">הגעתם למקסימום השאלות בעמוד הזה.</div>';
    else actions = `<div class="tutor-actions">${questions()
      .map(q => `<button type="button" class="small" data-ask="${escapeHtml(q.id)}">${escapeHtml(q.label)}</button>`)
      .join('')}</div>`;

    host.innerHTML = `<div class="tutor">
      <div class="tutor-label">שאלה על השיעור</div>
      ${messages}
      ${error ? `<div class="tutor-note err">${escapeHtml(error)}</div>` : ''}
      ${actions}
      ${left > 0 && !busy ? `<div class="tutor-meta">נותרו ${left} שאלות היום</div>` : ''}
    </div>`;

    host.querySelectorAll('[data-ask]').forEach(btn => {
      btn.addEventListener('click', () => ask(btn.dataset.ask));
    });
  }

  async function ask(id) {
    if (busy || questionsLeft(ctx.state) <= 0 || threadFull(thread)) return;
    const question = questions().find(q => q.id === id);
    if (!question) return;

    error = '';
    busy = true;
    pushQuestion(thread, question.text, question.label);
    recordQuestion(ctx.state);
    ctx.save();
    paint();

    const res = await askAboutLesson({
      skillId: skill.id,
      rule: skill.short,
      thread,
      studentName: ctx.user.displayName,
    });

    busy = false;
    if (res.available) pushAnswer(thread, res.text, res.html);
    else { dropLastQuestion(thread); error = res.reason || 'המורה הפרטי אינו זמין כרגע.'; }
    paint();
  }

  paint();
}

function renderBlock(block) {
  switch (block.type) {
    case 'text':
      return `<p class="lesson-block">${escapeHtml(block.text)}</p>`;
    case 'formula':
      return `<div class="formula lesson-block">
        ${renderInline(block.text)}
        ${block.note ? `<div class="note">${escapeHtml(block.note)}</div>` : ''}
      </div>`;
    case 'example':
      // "שלב 1:" בשורה נפרדת ולא מספור אוטומטי של <ol>: בשלבים עצמם מופיעים
      // זוגות מספרים כמו (1,12) (2,6), ומספר עם נקודה לידם מבלבל.
      return `<div class="example lesson-block">
        <div>${renderInline(block.question)}</div>
        <div class="steps">
          ${block.steps.map((s, i) => `
            <div class="step">
              <span class="step-label">שלב ${i + 1}:</span>
              <span class="step-body">${renderInline(s)}</span>
            </div>`).join('')}
        </div>
        <div class="result">= ${renderInline(block.answer)}</div>
      </div>`;
    case 'warning':
      return `<div class="note-warn lesson-block">
        <strong>${escapeHtml(block.title)}</strong>
        <span>${renderInline(block.text)}</span>
      </div>`;
    default:
      return '';
  }
}
