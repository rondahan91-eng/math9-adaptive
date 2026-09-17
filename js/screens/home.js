// ==========================================================================
// home.js - מפת היחידה: מה נשלט, מה פתוח, ומה עדיין נעול
// ==========================================================================
// המפה מציגה בפירוש למה מיומנות נעולה ואיזה קדם-דרישה חסר. תלמיד שרואה
// "נעול" בלי סיבה מרגיש שהמערכת שרירותית; תלמיד שרואה "צריך קודם לשלוט
// בחוק הפילוג" מבין את המבנה של החומר.

import { SKILLS, SKILL_BY_ID } from '../curriculum/skills.js';
import { revealedStages, isSkillRevealed } from '../learn/reveals.js';
import {
  isMastered, isUnlocked, overallProgress, MASTERY_THRESHOLD,
  activeMisconceptions, selectNextSkill,
} from '../learn/mastery.js';
import { misconception } from '../curriculum/misconceptions.js';
import { progressBar, escapeHtml, fmtPercent } from '../ui.js';
import { CONFIG } from '../config.js';

/**
 * מציגים אזהרה רק כשהתכונה *אמורה* לעבוד ולא עובדת. כשהיא כבויה בכוונה אין
 * מה להודיע - תווית "כבוי" קבועה רק מפרסמת תכונה שאינה קיימת.
 */
const tutorMisconfigured = (ctx) => CONFIG.TUTOR_ENABLED && !ctx.tutor.available;

export function renderHome(root, ctx) {
  const { state } = ctx;
  const next = selectNextSkill(state);
  const nextSkill = SKILL_BY_ID[next.skillId];
  const active = activeMisconceptions(state);

  root.innerHTML = `
    <div class="card">
      <div class="spread">
        <div>
          <h1>שלום, ${escapeHtml(ctx.user.displayName || '')}</h1>
          <p class="muted" style="margin:0">התקדמות ביחידה: ${fmtPercent(overallProgress(state))}</p>
        </div>
        <button class="primary" data-practice ${nextSkill ? '' : 'disabled'}>המשך לתרגל</button>
      </div>
      ${progressBar(overallProgress(state))}
      ${tutorMisconfigured(ctx) ? `<p class="muted" style="margin-top:.5rem;margin-bottom:0">
        <span class="badge warn">המורה הפרטי לא זמין</span>
        ${escapeHtml(ctx.tutor.reason || '')}
      </p>` : ''}
      <p class="muted" style="margin-top:.8rem;margin-bottom:0">
        ${!nextSkill
          ? 'אין כרגע חומר פתוח לתרגול.'
          : next.reason === 'remediation'
            ? `הצעד הבא: חזרה על <strong>${escapeHtml(nextSkill.title)}</strong> — יש שם נקודה שכדאי לסגור.`
            : next.reason === 'review'
              ? `שלטת בכל מה שנפתח עד כה. הצעד הבא הוא חזרה על <strong>${escapeHtml(nextSkill.title)}</strong>.`
              : `הצעד הבא: <strong>${escapeHtml(nextSkill.title)}</strong>`}
      </p>
    </div>

    ${active.length ? `
      <div class="card">
        <h2>נקודות שכדאי לסגור</h2>
        <div class="stack">
          ${active.map(m => {
            const info = misconception(m.id);
            const skill = SKILL_BY_ID[m.skillId];
            return `<div class="note-warn">
              <strong>${escapeHtml(info ? info.label : m.id)}</strong>
              <span class="muted">${escapeHtml(skill ? skill.title : '')} · הופיע ${m.seen} פעמים</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    <div id="map"></div>`;

  root.querySelector('[data-practice]').addEventListener('click', () => ctx.navigate('practice'));

  // שלב שלא נחשף אינו מוצג כלל - לא כ"נעול". תלמיד/ה לא אמור/ה לדעת שיש
  // שם חומר עד שהמורה תפתח אותו.
  const map = root.querySelector('#map');
  map.innerHTML = revealedStages().map(stage => {
    const inStage = SKILLS.filter(s => s.stage === stage);
    return `
      <div class="stage-title">${escapeHtml(stage)}</div>
      <div class="skill-grid">
        ${inStage.map(s => skillCard(state, s)).join('')}
      </div>`;
  }).join('') || `<div class="card"><p class="muted" style="margin:0">
      עדיין לא נפתח חומר לתרגול. ברגע שייפתח, הנושאים יופיעו כאן.
    </p></div>`;

  map.querySelectorAll('[data-skill]').forEach(btn => {
    btn.addEventListener('click', () => ctx.navigate('lesson', { skillId: btn.dataset.skill }));
  });
}

function skillCard(state, skill) {
  const s = state.skills[skill.id] || { p: 0, attempts: 0 };
  const unlocked = isUnlocked(state, skill.id);
  const mastered = isMastered(state, skill.id);
  const missing = skill.prereqs.filter(p => (state.skills[p]?.p ?? 0) < 0.7);
  const cls = mastered ? 'mastered' : unlocked ? '' : 'locked';
  return `
    <button class="skill-card ${cls}" data-skill="${escapeHtml(skill.id)}">
      <div class="title">${escapeHtml(skill.title)} ${mastered ? '<span class="badge ok">נשלט</span>' : ''}</div>
      <div class="sub">${escapeHtml(skill.short)}</div>
      ${progressBar(s.attempts ? s.p / MASTERY_THRESHOLD : 0, mastered)}
      ${!unlocked && missing.length ? `<div class="lock-note">${
        // קדם-דרישה שנמצאת בשלב שלא נחשף - אין טעם לנקוב בשמה, היא לא מופיעה
        // בשום מקום במפה ורק תיראה כמו הוראה בלתי אפשרית
        missing.some(id => !isSkillRevealed(id))
          ? 'נפתח אחרי חומר שעדיין לא נפתח'
          : `נפתח אחרי: ${missing.map(id => escapeHtml(SKILL_BY_ID[id].title)).join(', ')}`
      }</div>` : ''}
      ${unlocked && s.attempts ? `<div class="sub" style="margin-top:.3rem">${s.correct}/${s.attempts} נכונות</div>` : ''}
    </button>`;
}
