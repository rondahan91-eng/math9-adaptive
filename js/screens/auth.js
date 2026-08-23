// ==========================================================================
// auth.js - מסך התחברות
// ==========================================================================

import { api } from '../api.js';
import { isDevMode } from '../config.js';
import { toast } from '../ui.js';

export function renderAuth(root, ctx, onLogin) {
  root.innerHTML = `
    <div class="center-page">
      <div class="card">
        <h1>מתמטיקה ט׳</h1>
        <p class="muted">כפל מקוצר ופירוק לגורמים — לומדה אדפטיבית</p>
        <form id="login-form" class="stack" style="margin-top:1rem">
          <div>
            <label for="u">שם משתמש</label>
            <input id="u" type="text" autocomplete="username" required>
          </div>
          <div>
            <label for="p">סיסמה</label>
            <input id="p" type="password" autocomplete="current-password" required>
          </div>
          <button class="primary" type="submit">כניסה</button>
        </form>
        ${isDevMode() ? `
          <p class="muted" style="margin-top:1rem;border-top:1px solid var(--border);padding-top:.8rem">
            מצב פיתוח מקומי. משתמשים לדוגמה:<br>
            מורה — <code>admin</code> / <code>admin123</code><br>
            תלמיד/ה — <code>demo</code> / <code>demo1234</code>
          </p>` : ''}
      </div>
    </div>`;

  const form = root.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'מתחבר…';
    try {
      const user = await api.authenticateUser(
        form.querySelector('#u').value,
        form.querySelector('#p').value,
      );
      await onLogin(user);
    } catch (err) {
      toast(err.message || 'ההתחברות נכשלה', 'err');
      btn.disabled = false;
      btn.textContent = 'כניסה';
    }
  });
}
