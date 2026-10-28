// Dashboard: security/admin view (post items, review claims, my items) and student view (my claims).
(() => {
  const { h } = LF;
  const $ = (id) => document.getElementById(id);
  const securityBox = $('securityDashboard');
  const studentBox = $('studentDashboard');
  if (!securityBox || !studentBox) return;

  const me = LF.user();
  if (!me || !LF.token()) { window.location.href = 'login.html'; return; }
  if (me.mustChangePassword) { window.location.href = 'change-password.html'; return; }

  const empty = (text) => h('p', { class: 'text-muted' }, text);
  const errorLine = (e) => h('p', { class: 'error-message', role: 'alert' }, e.message);
  const render = (container, nodes) => container.replaceChildren(...nodes);
  const handleAuthLoss = () => { if (!LF.token()) window.location.href = 'login.html'; };
  const badge = (status) => h('span', { class: `item-status status-${status}` }, status);
  const threadLink = (i) => h('a', { href: `item-detail.html?id=${encodeURIComponent(i.itemId)}&inquiry=${encodeURIComponent(i.inquiryId)}` },
    LF.isStaff(me) ? 'Review claim, messages & Strathbites verification' : 'Open item & messages');

  // ---------- Student ----------
  async function loadMyClaims() {
    const box = $('myClaimsContainer');
    try {
      const claims = await LF.api('/inquiries/my');
      render(box, claims.length ? claims.map((c) => h('div', { class: 'inquiry-card' },
        h('div', { class: 'inquiry-info' },
          h('h4', {}, c.itemTitle),
          h('p', {}, c.claimDescription),
          h('p', {}, `Submitted ${LF.formatDateTime(c.createdAt)}`),
          threadLink(c)),
        badge(c.status))) : [empty("You haven't made any claims yet.")]);
    } catch (e) { render(box, [errorLine(e)]); handleAuthLoss(); }
  }

  function initStudentStrathbitesAccount() {
    const form = $('strathbitesAccountForm');
    const input = $('studentStrathbitesUserId');
    const error = $('strathbitesAccountError');
    const status = $('strathbitesAccountStatus');
    const saveButton = $('saveStrathbitesAccount');
    const unlinkButton = $('unlinkStrathbitesAccount');

    input.value = me.strathbitesUserId ?? '';
    unlinkButton.hidden = me.strathbitesUserId === null || me.strathbitesUserId === undefined;

    const saveLink = async (strathbitesUserId) => {
      error.hidden = true;
      status.hidden = true;
      saveButton.disabled = true;
      unlinkButton.disabled = true;
      try {
        const updatedUser = await LF.api('/auth/me', {
          method: 'PATCH',
          json: { strathbitesUserId },
        });
        LF.saveSession(LF.token(), updatedUser);
        me.strathbitesUserId = updatedUser.strathbitesUserId;
        input.value = updatedUser.strathbitesUserId ?? '';
        unlinkButton.hidden = updatedUser.strathbitesUserId === null;
        status.textContent = updatedUser.strathbitesUserId === null
          ? 'Your Strathbites account has been unlinked.'
          : 'Your Strathbites account is linked. Staff can now verify eligible claims.';
        status.hidden = false;
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        handleAuthLoss();
      } finally {
        saveButton.disabled = false;
        unlinkButton.disabled = false;
      }
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.reportValidity()) return;
      const userId = input.valueAsNumber;
      if (!Number.isSafeInteger(userId) || userId < 1) {
        error.textContent = 'Enter a valid positive whole-number Strathbites user ID.';
        error.hidden = false;
        return;
      }
      await saveLink(userId);
    });

    unlinkButton.addEventListener('click', () => saveLink(null));
  }

  // ---------- Staff ----------
  async function loadReviewQueue() {
    const box = $('inquiriesContainer');
    try {
      const rows = await LF.api('/inquiries?status=pending');
      render(box, rows.length ? rows.map((c) => {
        const decide = (status) => async (event) => {
          event.currentTarget.disabled = true;
          try { await LF.api(`/inquiries/${c.inquiryId}/status`, { method: 'PATCH', json: { status } }); }
          catch (e) { window.alert(e.message); }
          loadReviewQueue();
          loadMyItems();
        };
        return h('div', { class: 'inquiry-card' },
          h('div', { class: 'inquiry-info' },
            h('h4', {}, `${c.itemTitle} — claimed by ${c.claimantName}`),
            h('p', {}, c.claimDescription),
            threadLink(c)),
          h('div', { class: 'inquiry-actions' },
            h('button', { class: 'btn btn-success', type: 'button', onclick: decide('approved') }, 'Approve'),
            h('button', { class: 'btn btn-danger', type: 'button', onclick: decide('rejected') }, 'Reject')));
      }) : [empty('No inquiries to review.')]);
    } catch (e) { render(box, [errorLine(e)]); handleAuthLoss(); }
  }

  const STATUSES = ['unclaimed', 'pending-verification', 'claimed'];
  async function loadMyItems() {
    const box = $('myItemsContainer');
    try {
      const items = await LF.api('/my/found-items');
      render(box, items.length ? items.map((item) => {
        const select = h('select', { 'aria-label': `Status for ${item.title}` },
          STATUSES.map((s) => h('option', { value: s, selected: s === item.status }, s)));
        select.addEventListener('change', async () => {
          select.disabled = true;
          try { await LF.api(`/staff/found-items/${item.itemId}/status`, { method: 'PATCH', json: { status: select.value } }); }
          catch (e) { window.alert(e.message); }
          loadMyItems();
        });
        return h('div', { class: 'inquiry-card' },
          h('div', { class: 'inquiry-info' },
            h('h4', {}, item.title),
            h('p', {}, `${item.location} · ${LF.formatCategory(item.category)}`),
            h('a', { href: `item-detail.html?id=${encodeURIComponent(item.itemId)}` }, 'View item')),
          select);
      }) : [empty("You haven't posted any items yet.")]);
    } catch (e) { render(box, [errorLine(e)]); handleAuthLoss(); }
  }

  function initPostForm() {
    const form = $('postItemForm');
    const error = $('postItemError');
    const success = $('postItemSuccess');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      success.hidden = true;
      const files = Array.from($('itemImages').files);
      if (files.length > 5) { error.textContent = 'Please choose at most 5 images.'; error.hidden = false; return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const item = await LF.api('/staff/found-items', {
          method: 'POST',
          json: {
            title: $('itemTitle').value,
            category: $('itemCategory').value,
            location: $('itemLocation').value,
            dateFound: $('itemDate').value,
            description: $('itemDescription').value,
          },
        });
        let note = 'Item posted.';
        if (files.length) {
          const data = new FormData();
          files.forEach((f) => data.append('files', f));
          try { await LF.api(`/found-items/${item.itemId}/images`, { method: 'POST', form: data }); }
          catch (e) { note = `Item posted, but the images could not be uploaded: ${e.message}`; }
        }
        success.textContent = note;
        success.hidden = false;
        form.reset();
        loadMyItems();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        handleAuthLoss();
      } finally {
        button.disabled = false;
      }
    });
  }

  function initAdminUsers() {
    if (me.role !== 'admin') return;
    const section = $('adminAccountsSection');
    const form = $('adminCreateUserForm');
    const error = $('adminCreateUserError');
    const result = $('adminCreateUserResult');
    section.hidden = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      result.hidden = true;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const created = await LF.api('/auth/admin/users', {
          method: 'POST',
          json: {
            fullName: $('adminUserFullName').value,
            email: $('adminUserEmail').value,
            role: $('adminUserRole').value,
            studentId: $('adminUserStudentId').value || undefined,
            strathbitesUserId: $('adminUserStrathbitesId').value
              ? Number($('adminUserStrathbitesId').value) : undefined,
          },
        });
        result.replaceChildren(
          h('p', {}, `Account created for ${created.user.fullName} (${created.user.email}).`),
          h('p', {}, 'Give this temporary password to the user in person:'),
          h('p', {}, h('code', {}, created.temporaryPassword)),
          h('p', {}, 'They must change it when they first log in.')
        );
        result.hidden = false;
        form.reset();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
  }

  $('dashboardRoleInfo').textContent = me.role === 'admin'
    ? 'Administrator Dashboard'
    : LF.isStaff(me) ? 'Security Staff Dashboard' : 'Student Dashboard';
  if (LF.isStaff(me)) {
    securityBox.hidden = false;
    initAdminUsers();
    initPostForm();
    loadReviewQueue();
    loadMyItems();
  } else {
    studentBox.hidden = false;
    initStudentStrathbitesAccount();
    loadMyClaims();
  }
})();
