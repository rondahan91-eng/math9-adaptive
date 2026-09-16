// ==========================================================================
// content.js - מסך המורה: מה פתוח לתלמידים
// ==========================================================================
// המסך הזה שולט בשכבה אחת בלבד - מה *קיים* בעולם של התלמיד/ה. הסדר בתוך
// מה שנפתח נשאר אוטומטי לפי קדם-דרישות, ואינו ניתן לעקיפה: זו ההגנה על
// סדר הלמידה, ולא מגבלה טכנית.

import { api } from '../api.js';
import { SKILLS, STAGES } from '../curriculum/skills.js';
import { setReveals, revealedStages } from '../learn/reveals.js';
import { escapeHtml, toast } from '../ui.js';

export function renderContent(root, ctx) {
  root.innerHTML = `<div class="card"><p class="muted">טוען…</p></div>`;

  api.fetchReveals()
    .then(rows => { setReveals(rows); paint(root, ctx); })
    .catch(err => {
      const oldBackend = /פעולה לא מוכרת/.test(err?.message || '');
      root.innerHTML = `<div class="card">
        <h1>תוכן וחשיפה</h1>
        ${oldBackend ? `
          <p>השרת עדיין מריץ גרסה ישנה של <code>Code.gs</code> ואינו מכיר את החשיפה.</p>
          <p class="muted">בינתיים התלמידים רואים את ברירת המחדל:
          <strong>${escapeHtml(revealedStages().join(' · '))}</strong>.</p>
          <p class="muted">כדי להפעיל את המסך הזה: להדביק מחדש את
          <code>backend/Code.gs</code> ואז Deploy → Manage deployments → ✏️ → New version.</p>`
        : `<p class="muted">${escapeHtml(err.message || 'לא הצלחתי לטעון את מצב החשיפה.')}</p>`}
      </div>`;
      if (!oldBackend) toast(err.message || 'שגיאה בטעינת מצב החשיפה', 'err');
    });
}

/**
 * שלב שקדם-הדרישות שלו יושבות בשלב מוסתר יישאר נעול גם אחרי שייחשף.
 * מזהירים, לא חוסמים - המורה מכירה את הכיתה.
 */
function blockedBy(stage) {
  const open = new Set(revealedStages());
  if (!open.has(stage)) return [];
  const inStage = new Set(SKILLS.filter(s => s.stage === stage).map(s => s.id));
  const missing = new Set();
  for (const skill of SKILLS) {
    if (skill.stage !== stage) continue;
    for (const p of skill.prereqs) {
      if (inStage.has(p)) continue;
      const prereq = SKILLS.find(s => s.id === p);
      if (prereq && !open.has(prereq.stage)) missing.add(prereq.stage);
    }
  }
  return [...missing];
}

function paint(root, ctx) {
  const open = new Set(revealedStages());

  root.innerHTML = `
    <div class="card">
      <h1>תוכן וחשיפה</h1>
      <p class="muted" style="margin:0">
        מה שמסומן כאן נראה לתלמידים. מה שלא — לא מופיע אצלם במפה בכלל.
        <strong>הסתרה אינה מוחקת התקדמות</strong>: היא מעלימה את השלב מהמפה,
        וחשיפה מחדש מחזירה את המצב במלואו.
      </p>
    </div>

    <div class="card">
      <h2>שלבי הספר</h2>
      <table>
        <thead><tr><th>שלב</th><th>מיומנויות</th><th>מצב</th><th></th></tr></thead>
        <tbody>
          ${STAGES.map(stage => {
            const count = SKILLS.filter(s => s.stage === stage).length;
            const on = open.has(stage);
            const blocked = blockedBy(stage);
            return `<tr>
              <td>
                <strong>${escapeHtml(stage)}</strong>
                ${blocked.length ? `<br><span class="muted">תלוי ב-${
                  blocked.map(escapeHtml).join(', ')} — כל עוד השלב הזה מוסתר, המיומנויות כאן יישארו נעולות</span>` : ''}
              </td>
              <td class="muted">${count}</td>
              <td>${on ? '<span class="badge ok">פתוח</span>' : '<span class="badge">מוסתר</span>'}</td>
              <td><button class="small${on ? '' : ' primary'}"
                          data-stage="${escapeHtml(stage)}"
                          data-next="${on ? 'hide' : 'show'}">${on ? 'הסתרה' : 'פתיחה'}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>מה התלמידים רואים עכשיו</h2>
      ${open.size === 0
        ? '<p class="muted" style="margin:0">שום דבר. המפה שלהם ריקה.</p>'
        : `<div class="stack">${revealedStages().map(stage => `
            <div>
              <div class="stage-title" style="margin-top:0">${escapeHtml(stage)}</div>
              <p class="muted" style="margin:0">${
                SKILLS.filter(s => s.stage === stage).map(s => escapeHtml(s.title)).join(' · ')
              }</p>
            </div>`).join('')}</div>`}
    </div>`;

  root.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stage = btn.dataset.stage;
      const want = btn.dataset.next === 'show';
      if (!want && !confirm(`להסתיר את "${stage}"?\n\nהשלב ייעלם מהמפה של התלמידים. ההתקדמות שלהם נשמרת, ופתיחה מחדש תחזיר הכול.`)) return;
      btn.disabled = true;
      btn.textContent = 'שומר…';
      try {
        const rows = await api.setReveal(stage, want, ctx.user.token);
        setReveals(rows);
        toast(want ? `"${stage}" נפתח לתלמידים` : `"${stage}" הוסתר`, 'ok');
        paint(root, ctx);
      } catch (err) {
        toast(err.message || 'השמירה נכשלה', 'err');
        paint(root, ctx);
      }
    });
  });
}
