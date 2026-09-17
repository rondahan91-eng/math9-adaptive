// ==========================================================================
// students.js - מסך המורה: הוספת תלמידים וניהול חשבונות
// ==========================================================================
// הזרימה בנויה כך שאי אפשר ליצור חשבונות בטעות:
//   1. בחירת קובץ  ->  2. תצוגה מקדימה (מה ייווצר, מה כבר קיים, מה שגוי)
//   ->  3. אישור  ->  4. רשימת פרטי כניסה להדפסה
// שום דבר לא נשלח לשרת לפני האישור.

import { api } from '../api.js';
import { escapeHtml, toast } from '../ui.js';
import { readSpreadsheet } from '../students/xlsx.js';
import { buildImport, credentialsCsv } from '../students/importRules.js';

export function renderStudents(root, ctx) {
  const view = {
    students: null,     // מהשרת
    preview: null,      // תוצאת buildImport
    fileName: '',
    created: null,      // פרטי כניסה של מי שנוצר עכשיו - קיימים רק בזיכרון
    busy: false,
    filter: '',
  };

  const token = () => ctx.user.token;

  load();

  async function load() {
    root.innerHTML = `<div class="card"><p class="muted">טוען…</p></div>`;
    try {
      view.students = await api.listStudents(token());
      paint();
    } catch (err) {
      root.innerHTML = errorCard(err);
      root.querySelector('[data-relogin]')?.addEventListener('click', ctx.logout);
    }
  }

  // -------------------------------------------------------------- ציור
  function paint() {
    root.innerHTML = `
      <div class="card no-print">
        <h1>תלמידים</h1>
        <p class="muted" style="margin:0">${view.students.length} תלמידים רשומים במערכת.</p>
      </div>

      ${view.created ? createdCard() : ''}
      ${view.preview ? previewCard() : importCard()}
      <div class="no-print">${singleCard()}${listCard()}</div>`;
    wire();
  }

  function importCard() {
    return `
      <div class="card no-print">
        <h2>הוספה מקובץ Excel</h2>
        <p style="margin-top:0">מעלים את רשימת התלמידים כפי שיוצאה ממערכת בית הספר.
        העמודות הנדרשות: <strong>שם פרטי</strong>, <strong>שם משפחה</strong>,
        <strong>ת.ז</strong>, <strong>תאריך לידה</strong>, <strong>כיתה</strong>.
        <a href="templates/students-template.xlsx" download>הורדת תבנית Excel מוכנה</a>
        (עם גיליון הוראות).</p>
        <div class="note-warn" style="margin-bottom:.8rem">
          <strong>פרטי הכניסה נוצרים אוטומטית, כמו במערכת האלקטרוניקה:</strong><br>
          שם משתמש = שם פרטי + 3 הספרות האחרונות של ת.ז (למשל <span dir="ltr">נועה482</span>)<br>
          סיסמה = תאריך הלידה, שש ספרות (למשל 7 במרץ 2011 → <span dir="ltr">070311</span>)<br>
          <span class="muted">מספר תעודת הזהות לא נשמר במערכת - הוא משמש רק לחישוב שם המשתמש.
          קובץ שכבר כולל עמודות "שם משתמש" ו"סיסמה" ייקלט כמו שהוא.</span>
        </div>
        <label class="drop">
          <input type="file" accept=".xlsx,.csv,.tsv,.txt" data-file hidden>
          <strong>בחירת קובץ</strong>
          <span class="muted">xlsx או csv · הקובץ נקרא במחשב שלך ולא נשלח לפני האישור</span>
        </label>
      </div>`;
  }

  function previewCard() {
    const p = view.preview;
    const rows = (list, cols) => list.map(r => `<tr>${cols.map(c => `<td${c.ltr ? ' dir="ltr"' : ''}>${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
    const credCols = [
      { key: 'excelRow' }, { key: 'displayName' }, { key: 'grade' },
      { key: 'username', ltr: true }, { key: 'password', ltr: true },
    ];
    return `
      <div class="card no-print">
        <div class="spread">
          <h2 style="margin:0">תצוגה מקדימה · ${escapeHtml(view.fileName)}</h2>
          <button class="small ghost" data-cancel ${view.busy ? 'disabled' : ''}>ביטול</button>
        </div>
        <p class="muted">
          ${p.mode === 'credentials' ? 'פרטי הכניסה נלקחו מהקובץ עצמו.' : 'פרטי הכניסה חושבו לפי הכלל.'}
          שום דבר עוד לא נשמר.
        </p>
        <div class="row" style="gap:.5rem;margin-bottom:.8rem">
          <span class="badge ok">${p.valid.length} ייווצרו</span>
          ${p.existing.length ? `<span class="badge">${p.existing.length} כבר קיימים - ידולגו</span>` : ''}
          ${p.invalid.length ? `<span class="badge warn">${p.invalid.length} שורות עם בעיה</span>` : ''}
        </div>

        ${p.invalid.length ? `
          <h3>שורות שלא ייקלטו</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>שורה</th><th>שם</th><th>הבעיה</th></tr></thead>
            <tbody>${rows(p.invalid, [{ key: 'excelRow' }, { key: 'displayName' }, { key: 'reason' }])}</tbody>
          </table></div>
          <p class="muted">אפשר לתקן אותן בקובץ ולהעלות שוב - מי שכבר נוצר ידולג אוטומטית.</p>` : ''}

        ${p.valid.length ? `
          <h3>ייווצרו</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>שורה</th><th>שם</th><th>כיתה</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
            <tbody>${rows(p.valid, credCols)}</tbody>
          </table></div>
          <div class="row" style="margin-top:1rem">
            <button class="primary" data-confirm ${view.busy ? 'disabled' : ''}>
              ${view.busy ? 'יוצר חשבונות…' : `יצירת ${p.valid.length} חשבונות`}
            </button>
          </div>` : `<p><strong>אין תלמידים חדשים ליצירה בקובץ הזה.</strong></p>`}

        ${p.existing.length ? `
          <details style="margin-top:1rem"><summary class="muted">מי כבר קיים (${p.existing.length})</summary>
            <p class="muted">${p.existing.map(s => escapeHtml(`${s.displayName} (${s.username})`)).join(' · ')}</p>
          </details>` : ''}
      </div>`;
  }

  function createdCard() {
    const c = view.created;
    return `
      <div class="card creds">
        <div class="spread no-print">
          <h2 style="margin:0">נוצרו ${c.added.length} חשבונות</h2>
          <div class="row">
            <button class="small" data-print>הדפסה</button>
            <button class="small" data-download>שמירה כקובץ</button>
            <button class="small ghost" data-dismiss>סגירה</button>
          </div>
        </div>
        <p class="muted no-print">
          <strong>כדאי לשמור או להדפיס את הרשימה עכשיו.</strong> הסיסמאות לא נשמרות בשרת בצורה
          קריאה, ואחרי סגירת החלון אי אפשר להציג אותן שוב - רק לאפס.
        </p>
        ${c.skipped.length ? `<div class="note-warn no-print"><strong>${c.skipped.length} לא נוצרו:</strong>
          ${c.skipped.map(s => escapeHtml(`${s.username} — ${s.reason}`)).join(' · ')}</div>` : ''}
        <h2 class="print-only">מתמטיקה לכיתה ט׳ · פרטי כניסה</h2>
        <p class="print-only">כתובת: <span dir="ltr">${escapeHtml(location.origin + location.pathname)}</span></p>
        <div class="table-wrap"><table>
          <thead><tr><th>כיתה</th><th>שם</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
          <tbody>${c.added.map(s => `<tr>
            <td>${escapeHtml(s.grade)}</td><td>${escapeHtml(s.displayName)}</td>
            <td dir="ltr">${escapeHtml(s.username)}</td><td dir="ltr">${escapeHtml(s.password)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }

  function singleCard() {
    return `
      <div class="card">
        <h2>הוספת תלמיד/ה בודד/ת</h2>
        <form data-single class="grid-form">
          <label>שם מלא<input type="text" name="displayName" required></label>
          <label>כיתה<input type="text" name="grade" placeholder="ט1" required></label>
          <label>שם משתמש<input type="text" name="username" dir="ltr" required autocomplete="off"></label>
          <label>סיסמה<input type="text" name="password" dir="ltr" required minlength="4" autocomplete="off"></label>
          <div><button class="primary" type="submit">הוספה</button></div>
        </form>
      </div>`;
  }

  function listCard() {
    const q = view.filter.trim();
    const list = [...view.students]
      .filter(s => !q || `${s.displayName} ${s.username} ${s.grade}`.includes(q))
      .sort((a, b) => String(a.grade).localeCompare(String(b.grade), 'he')
        || String(a.displayName).localeCompare(String(b.displayName), 'he'));
    return `
      <div class="card">
        <div class="spread">
          <h2 style="margin:0">רשימת התלמידים</h2>
          <input type="text" data-filter placeholder="חיפוש שם, משתמש או כיתה"
                 value="${escapeHtml(view.filter)}" style="max-width:16rem">
        </div>
        ${list.length === 0 ? '<p class="muted">אין תלמידים להצגה.</p>' : `
          <div class="table-wrap"><table>
            <thead><tr><th>שם</th><th>כיתה</th><th>שם משתמש</th><th></th></tr></thead>
            <tbody>${list.map(s => `<tr>
              <td>${escapeHtml(s.displayName)}</td>
              <td>${escapeHtml(s.grade)}</td>
              <td dir="ltr">${escapeHtml(s.username)}</td>
              <td><button class="small ghost" data-reset="${escapeHtml(s.studentId)}">איפוס סיסמה</button></td>
            </tr>`).join('')}</tbody>
          </table></div>`}
      </div>`;
  }

  // -------------------------------------------------------------- פעולות
  function wire() {
    root.querySelector('[data-file]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const sheet = await readSpreadsheet(file);
        const result = buildImport(sheet, view.students);
        if (result.error) { toast(result.error, 'err'); return; }
        view.preview = result;
        view.fileName = file.name;
        paint();
      } catch (err) {
        toast(err.message || 'לא הצלחתי לקרוא את הקובץ', 'err');
      }
    });

    root.querySelector('[data-cancel]')?.addEventListener('click', () => {
      view.preview = null; paint();
    });

    root.querySelector('[data-confirm]')?.addEventListener('click', async () => {
      const valid = view.preview.valid;
      view.busy = true; paint();
      try {
        const res = await api.importStudents(
          valid.map(({ username, password, displayName, grade }) => ({ username, password, displayName, grade })),
          token());
        // הסיסמאות קיימות רק כאן, בצד הלקוח - מצמידים אותן למי שנוצר בפועל
        const byUser = new Map(valid.map(v => [v.username.toLowerCase(), v]));
        view.created = {
          added: res.added.map(a => ({ ...a, password: byUser.get(a.username.toLowerCase())?.password || '' })),
          skipped: res.skipped,
        };
        view.preview = null;
        view.students = await api.listStudents(token());
        toast(`נוצרו ${res.added.length} חשבונות`, 'ok');
      } catch (err) {
        toast(err.message || 'היצירה נכשלה', 'err');
      }
      view.busy = false;
      paint();
    });

    root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
    root.querySelector('[data-download]')?.addEventListener('click', () => {
      const blob = new Blob([credentialsCsv(view.created.added)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `פרטי-כניסה-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    root.querySelector('[data-dismiss]')?.addEventListener('click', () => {
      if (!confirm('לסגור את רשימת פרטי הכניסה?\n\nאחרי הסגירה אי אפשר להציג את הסיסמאות שוב.')) return;
      view.created = null; paint();
    });

    root.querySelector('[data-single]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      const username = String(data.username).trim();
      if (/\s/.test(username)) { toast('שם משתמש לא יכול להכיל רווחים', 'err'); return; }
      form.querySelector('button').disabled = true;
      try {
        const res = await api.importStudents([{
          username, password: String(data.password),
          displayName: String(data.displayName).trim(), grade: String(data.grade).trim(),
        }], token());
        if (res.skipped.length) throw new Error(`לא נוצר: ${res.skipped[0].reason}`);
        view.created = { added: [{ ...res.added[0], password: String(data.password) }], skipped: [] };
        view.students = await api.listStudents(token());
        toast('התלמיד/ה נוסף/ה', 'ok');
        paint();
      } catch (err) {
        toast(err.message || 'ההוספה נכשלה', 'err');
        form.querySelector('button').disabled = false;
      }
    });

    const filter = root.querySelector('[data-filter]');
    filter?.addEventListener('input', () => {
      view.filter = filter.value;
      const pos = filter.selectionStart;
      paint();
      const again = root.querySelector('[data-filter]');
      again.focus(); again.setSelectionRange(pos, pos);
    });

    root.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', async () => {
      const s = view.students.find(x => x.studentId === btn.dataset.reset);
      const password = prompt(`סיסמה חדשה עבור ${s.displayName} (${s.username}):`);
      if (password === null) return;
      if (password.trim().length < 4) { toast('הסיסמה קצרה מדי (לפחות 4 תווים)', 'err'); return; }
      btn.disabled = true;
      try {
        await api.resetPassword(s.studentId, password.trim(), token());
        toast(`הסיסמה של ${s.displayName} עודכנה`, 'ok');
      } catch (err) {
        toast(err.message || 'האיפוס נכשל', 'err');
      }
      btn.disabled = false;
    }));
  }
}

function errorCard(err) {
  const msg = err?.message || '';
  const oldBackend = /פעולה לא מוכרת/.test(msg);
  const expired = /התחברות/.test(msg);
  return `<div class="card">
    <h1>תלמידים</h1>
    ${oldBackend ? `
      <p>השרת עדיין מריץ גרסה ישנה של <code>Code.gs</code> ואינו מכיר את ניהול התלמידים.</p>
      <p class="muted">כדי להפעיל את המסך: להדביק מחדש את <code>backend/Code.gs</code>, ואז
      Deploy → Manage deployments → ✏️ → Version: <strong>New version</strong>.</p>`
    : expired ? `
      <p>${escapeHtml(msg)}</p>
      <button class="primary" data-relogin>יציאה והתחברות מחדש</button>`
    : `<p class="muted">${escapeHtml(msg || 'לא הצלחתי לטעון את רשימת התלמידים.')}</p>`}
  </div>`;
}
