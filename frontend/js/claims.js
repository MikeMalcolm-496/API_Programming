// item-detail.html extras: photos, claims, and the claim message thread.
// app.js still renders the item itself from the contract fields.
(async () => {
  const { h } = LF;
  const $ = (id) => document.getElementById(id);
  const claimSection = $('inquirySection');
  if (!claimSection) return;

  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id');
  const inquiryParam = params.get('inquiry');
  if (!itemId) return;

  const me = LF.user();
  const loggedIn = Boolean(me && LF.token());
  const claimForm = $('claimForm');
  const claimInfo = $('claimMessage');
  const itemClaims = $('itemClaims');
  const setInfo = (...nodes) => { claimInfo.replaceChildren(...nodes); claimInfo.hidden = false; };

  // ---- photos (public) ----
  try {
    const images = await LF.api(`/found-items/${encodeURIComponent(itemId)}/images`);
    if (images.length) {
      $('itemImages').replaceChildren(...images.map((img) =>
        h('img', { class: 'item-image', src: img.url, alt: 'Photo of the found item', loading: 'lazy' })));
      $('itemImages').hidden = false;
    }
  } catch (e) { /* photos are optional; the item itself still shows */ }

  // ---- message thread ----
  const messagesSection = $('messagesSection');
  const messagesBox = $('messagesContainer');
  async function openThread(inquiryId) {
    messagesSection.hidden = false;
    async function load() {
      try {
        const msgs = await LF.api(`/inquiries/${inquiryId}/messages`);
        messagesBox.replaceChildren(...(msgs.length ? msgs.map((m) =>
          h('div', { class: `message ${m.senderId === me.id ? 'message-own' : 'message-other'}` },
            h('div', {}, m.message),
            h('div', { class: 'message-meta' }, `${m.senderName} · ${LF.formatDateTime(m.sentAt)}`)))
          : [h('p', { class: 'text-muted' }, 'No messages yet.')]));
        messagesBox.scrollTop = messagesBox.scrollHeight;
      } catch (e) { messagesBox.replaceChildren(h('p', { class: 'error-message', role: 'alert' }, e.message)); }
    }
    const form = $('messageForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = $('messageInput');
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          await LF.api(`/inquiries/${inquiryId}/messages`, { method: 'POST', json: { message: text } });
          input.value = '';
          await load();
        } catch (e) { window.alert(e.message); }
        input.disabled = false;
        input.focus();
      });
    }
    await load();
  }

  // ---- who is looking? ----
  if (!loggedIn) {
    claimForm.hidden = true;
    setInfo('Want to claim this item? ', h('a', { href: 'login.html' }, 'Log in'), ' or ', h('a', { href: 'register.html' }, 'register'), ' first.');
    return;
  }

  if (LF.isStaff(me)) {
    claimSection.querySelector('h3').textContent = 'Claims & Strathbites verification';
    try {
      const claims = await LF.api(`/found-items/${encodeURIComponent(itemId)}/inquiries`);
      if (!claims.length) { itemClaims.textContent = 'No claims have been submitted for this item yet.'; }
      else {
        itemClaims.replaceChildren(...claims.map((c) => h('p', {},
          `${c.claimantName} (${c.status})${c.approvedByName ? ` — approved by ${c.approvedByName}` : ''}: `,
          h('a', { href: `item-detail.html?id=${encodeURIComponent(itemId)}&inquiry=${encodeURIComponent(c.inquiryId)}` }, 'open messages'))));
      }
    } catch (e) { itemClaims.textContent = e.message; }
  }

  async function refreshMyClaim() {
    let mine = [];
    try { mine = (await LF.api('/inquiries/my')).filter((c) => c.itemId === itemId); }
    catch (e) { setInfo(e.message); return; }
    const active = mine.find((c) => c.status !== 'rejected');
    claimForm.hidden = Boolean(active);
    if (active) {
      setInfo(`Your claim is ${active.status}. Reviewers will contact you here.`);
      openThread(active.inquiryId);
    } else if (mine.length) {
      setInfo('Your previous claim was rejected. You can submit a new one with more detail.');
    }
  }
  claimForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = claimForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await LF.api(`/found-items/${encodeURIComponent(itemId)}/inquiries`, {
        method: 'POST', json: { claimDescription: $('claimDescription').value },
      });
      $('claimDescription').value = '';
      await refreshMyClaim();
    } catch (e) { setInfo(e.message); }
    button.disabled = false;
  });
  refreshMyClaim();
  if (inquiryParam) openThread(inquiryParam);
})();
