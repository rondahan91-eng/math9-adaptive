// ==========================================================================
// dashboard.js - מסך המורה
// ==========================================================================
// השאלה שמורה באמת שואלת היא לא "מי קיבל כמה" אלא "על מה לעבור מחר בכיתה".
// לכן הדוח הראשי כאן הוא התפיסות המוטעות הנפוצות ביותר בכיתה, ואחריו
// המיומנויות שהכי הרבה תלמידים תקועים בהן.

import { api } from '../api.js';
import { SKILLS, SKILL_BY_ID } from '../curriculum/skills.js';
import { misconception } from '../curriculum/misconceptions.js';
import {
  normalizeState, overallProgress, isMastered, isUnlocked,
  MISCONCEPTION_ACTIVE, MASTERY_THRESHOLD,
} from '../learn/mastery.js';
import { escapeHtml, progressBar, fmtPercent, timeAgo, toast } from '../ui.js';
import { CONFIG } from '../config.js';

export function renderDashboard(root, ctx) {
  root.innerHTML = `<div class="card"><p class="muted">טוען נתוני כיתה…</p></div>`;

  api.fetchClassProgress()
    .then(rows => paint(root, ctx, rows))
    .catch(err => {
      toast(err.message || 'שגיאה בטעינת הנתונים', 'err');
      root.innerHTML = `<div class="card"><p class="muted">לא הצלחתי לטעון את נתוני הכיתה.</p></div>`;
    });
}

function paint(root, ctx, rows) {
  const students = rows.map(r => ({ ...r, state: normalizeState(r.state) }));
  const withData = students.filter(s => s.state.history?.length || Object.values(s.state.skills).some(x => x.attempts > 0));

  // -------- ריכוז תפיסות מוטעות
  const misTally = {};
  for (const s of students) {
    for (const [id, m] of Object.entries(s.state.misconceptions || {})) {
      if (m.strength < MISCONCEPTION_ACTIVE) continue;
      if (!misTally[id]) misTally[id] = { count: 0, skillId: m.skillId, names: [] };
      misTally[id].count++;
      misTally[id].names.push(s.displayName);
    }
  }
  const misRows = Object.entries(misTally).sort((a, b) => b[1].count - a[1].count);

  // -------- מיומנויות תקועות: פתוחות אבל לא נשלטות
  const stuck = SKILLS.map(skill => {
    const open = students.filter(s => isUnlocked(s.state, skill.id));
    const mastered = open.filter(s => isMastered(s.state, skill.id));
    return { skill, open: open.length, mastered: mastered.length };
  }).filter(r => r.open > 0 && r.mastered < r.open)
    .sort((a, b) => (b.open - b.mastered) - (a.open - a.mastered));

  root.innerHTML = `
    <div class="card">
      <h1>מעקב כיתה</h1>
      <p class="muted" style="margin:0">
        ${students.length} תלמידים רשומים · ${withData.length} התחילו לתרגל
        ${CONFIG.TUTOR_ENABLED && !ctx.tutor.available
          ? ' · <span class="badge warn">המורה הפרטי לא זמין</span>' : ''}
      </p>
    </div>

    <div class="card">
      <h2>מה לעבור עליו בכיתה</h2>
      ${misRows.length === 0
        ? '<p class="muted" style="margin:0">אין עדיין תפיסות מוטעות פעילות. הן יופיעו כאן ברגע שתלמידים יתחילו לתרגל.</p>'
        : `<table>
            <thead><tr><th>התפיסה המוטעית</th><th>נושא</th><th>תלמידים</th></tr></thead>
            <tbody>
              ${misRows.map(([id, row]) => {
                const info = misconception(id);
                const skill = SKILL_BY_ID[row.skillId];
                return `<tr>
                  <td>${escapeHtml(info ? info.forTeacher : id)}</td>
                  <td class="muted">${escapeHtml(skill ? skill.title : '—')}</td>
                  <td><strong>${row.count}</strong>
                      <span class="muted">${escapeHtml(row.names.slice(0, 4).join(', '))}${row.names.length > 4 ? '…' : ''}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
    </div>

    <div class="card">
      <h2>מיומנויות שהכיתה תקועה בהן</h2>
      ${stuck.length === 0
        ? '<p class="muted" style="margin:0">אין נתונים עדיין.</p>'
        : `<table>
            <thead><tr><th>מיומנות</th><th>נשלטת אצל</th><th></th></tr></thead>
            <tbody>${stuck.slice(0, 6).map(r => `
              <tr>
                <td>${escapeHtml(r.skill.title)}</td>
                <td>${r.mastered} מתוך ${r.open}</td>
                <td style="width:35%">${progressBar(r.mastered / r.open, r.mastered === r.open)}</td>
              </tr>`).join('')}</tbody>
          </table>`}
    </div>

    <div class="card">
      <h2>תלמידים</h2>
      <table>
        <thead><tr><th>שם</th><th>כיתה</th><th>התקדמות</th><th>נשלטו</th><th>פעילות אחרונה</th></tr></thead>
        <tbody>
          ${students.map(s => {
            const masteredCount = SKILLS.filter(sk => isMastered(s.state, sk.id)).length;
            return `<tr>
              <td>${escapeHtml(s.displayName || s.studentId)}</td>
              <td class="muted">${escapeHtml(s.grade || '—')}</td>
              <td style="width:28%">
                ${progressBar(overallProgress(s.state))}
                <span class="muted">${fmtPercent(overallProgress(s.state))}</span>
              </td>
              <td>${masteredCount}/${SKILLS.length}</td>
              <td class="muted">${escapeHtml(timeAgo(s.updatedAt))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
