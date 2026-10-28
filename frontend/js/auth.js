// Login and first-login password change.
(() => {
  const $ = (id) => document.getElementById(id);
  const showError = (el, msg) => { el.textContent = msg; el.hidden = false; };

  const loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('loginError');
      const button = loginForm.querySelector('button[type="submit"]');
      error.hidden = true;
      button.disabled = true;
      try {
        const data = await LF.api('/auth/login', {
          method: 'POST',
          json: { email: $('email').value, password: $('password').value },
        });
        LF.saveSession(data.token, data.user);
        window.location.href = data.user.mustChangePassword ? 'change-password.html' : 'dashboard.html';
      } catch (e) {
        showError(error, e.message);
      } finally {
        button.disabled = false;
      }
    });
  }

  const changePasswordForm = $('changePasswordForm');
  if (changePasswordForm) {
    const error = $('changePasswordError');
    const success = $('changePasswordSuccess');
    const button = changePasswordForm.querySelector('button[type="submit"]');
    if (!LF.token()) {
      showError(error, 'Log in with the temporary password provided by the administrator first.');
      button.disabled = true;
    }

    changePasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      success.hidden = true;
      if ($('newPassword').value !== $('confirmNewPassword').value) {
        showError(error, 'Passwords do not match.');
        return;
      }
      button.disabled = true;
      try {
        const data = await LF.api('/auth/change-password', {
          method: 'POST',
          json: { password: $('newPassword').value },
        });
        LF.saveSession(data.token, data.user);
        success.textContent = 'Password changed. Your account is ready.';
        success.hidden = false;
        window.location.href = 'dashboard.html';
      } catch (e) {
        showError(error, e.message);
        button.disabled = false;
      }
    });
  }
})();
