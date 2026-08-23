// ==========================================================================
// lesson.js - עמוד ההסבר של מיומנות
// ==========================================================================

import { SKILL_BY_ID } from '../curriculum/skills.js';
import { lessonFor } from '../curriculum/lessons.js';
import { isUnlocked, isMastered, MASTERY_THRESHOLD } from '../learn/mastery.js';
import { renderInline } from '../math/render.js';
import { escapeHtml, progressBar } from '../ui.js';

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
