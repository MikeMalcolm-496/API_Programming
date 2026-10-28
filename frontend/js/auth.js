// Login and register pages.
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
        window.location.href = 'dashboard.html';
      } catch (e) {
        showError(error, e.message);
      } finally {
        button.disabled = false;
      }
    });
  }

  const acceptInviteForm = $('acceptInviteForm');
  if (acceptInviteForm) {
    const token = new URLSearchParams(window.location.search).get('token');
    const error = $('inviteError');
    const success = $('inviteSuccess');
    const button = acceptInviteForm.querySelector('button[type="submit"]');
    if (!token) {
      showError(error, 'This invitation link is missing its token. Ask an administrator for a new link.');
      button.disabled = true;
    } else window.history.replaceState(null, '', window.location.pathname);

    acceptInviteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      success.hidden = true;
      if ($('password').value !== $('confirmPassword').value) {
        showError(error, 'Passwords do not match.');
        return;
      }
      button.disabled = true;
      try {
        await LF.api('/auth/accept-invite', {
          method: 'POST',
          json: { token, password: $('password').value },
        });
        success.textContent = 'Your account is active. You can now log in.';
        success.hidden = false;
        acceptInviteForm.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
      } catch (e) {
        showError(error, e.message);
        button.disabled = false;
      }
    });
  }
})();
