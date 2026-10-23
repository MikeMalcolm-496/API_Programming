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

  const registerForm = $('registerForm');
  if (registerForm) {
    const role = $('role');
    const staffGroup = $('staffCodeGroup');
    const sbGroup = $('strathbitesGroup');
    const syncRole = () => {
      staffGroup.hidden = role.value === 'student';
      if (sbGroup) sbGroup.hidden = role.value !== 'student';
    };
    role.addEventListener('change', syncRole);
    syncRole();

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('registerError');
      const success = $('registerSuccess');
      const button = registerForm.querySelector('button[type="submit"]');
      error.hidden = true;
      success.hidden = true;
      if ($('password').value !== $('confirmPassword').value) {
        showError(error, 'Passwords do not match.');
        return;
      }
      button.disabled = true;
      try {
        await LF.api('/auth/register', {
          method: 'POST',
          json: {
            fullName: $('fullName').value,
            email: $('email').value,
            password: $('password').value,
            role: role.value,
            studentId: $('studentId').value || undefined,
            staffCode: role.value === 'student' ? undefined : $('staffCode').value,
            strathbitesUserId: role.value === 'student' && $('strathbitesUserId') && $('strathbitesUserId').value
              ? Number($('strathbitesUserId').value) : undefined,
          },
        });
        success.textContent = 'Account created. Redirecting to login...';
        success.hidden = false;
        window.setTimeout(() => { window.location.href = 'login.html'; }, 1200);
      } catch (e) {
        showError(error, e.message);
        button.disabled = false;
      }
    });
  }
})();
