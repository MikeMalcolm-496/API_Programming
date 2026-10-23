// Strathbites integration on the item page (security/admin only).
//
// The browser NEVER calls Strathbites directly. It calls OUR server:
//   GET /inquiries/{inquiryId}/verify      verify a real claim on this item
//   GET /claims/verify?userId=&locationId=&lostDate=   manual check
// and our server (lib/strathbites.js) calls the three Strathbites endpoints.
//
// To show the calls in the browser: open DevTools (F12)
//   - Console tab: every check prints a "[Strathbites]" group with the
//     Strathbites URLs our server called, their status codes and timings.
//   - Network tab: filter by "verify" to see our request and the JSON reply.
(() => {
  const anchor = document.getElementById('inquirySection');
  if (!anchor || !window.LF) return;
  if (!LF.isStaff()) return; // order history is personal data: staff only
  const { h } = LF;
  const itemId = new URLSearchParams(window.location.search).get('id');
  if (!itemId) return;

  const extractCafe = (text) => ((String(text || '').match(/\bcafe-\d+\b/i) || [])[0] || '').toLowerCase();

  // ---------- browser console logging ----------
  function logToConsole(label, ourUrl, data) {
    try {
      console.groupCollapsed(`%c[Strathbites] ${label}`, 'color:#0b7a3e;font-weight:bold');
      console.log('Our API call (browser -> Lost & Found server):', ourUrl);
      const calls = data && (data.partnerCalls || (data.verification && data.verification.partnerCalls));
      if (calls) {
        console.log('Strathbites calls (Lost & Found server -> Strathbites):');
        console.table(calls.map((c) => ({ endpoint: c.endpoint, status: c.status, ms: c.ms, url: c.url })));
      }
      console.log('Full response:', data);
      console.groupEnd();
    } catch (e) { /* console unavailable */ }
  }

  async function callOurApi(path, label) {
    try {
      const data = await LF.api(path);
      logToConsole(label, path, data);
      return data;
    } catch (e) {
      logToConsole(`${label} (failed)`, path, { error: e.message });
      throw e;
    }
  }

  // ---------- rendering ----------
  const stat = (value, label) => h('div', { style: 'padding:12px;border:1px solid #ddd;border-radius:8px;min-width:130px' },
    h('div', { style: 'font-size:22px;font-weight:600' }, String(value)),
    h('div', { class: 'text-muted' }, label));

  const CRED_COLOR = { high: '#0b7a3e', medium: '#a86b00', low: '#b3261e' };
  function renderVerification(v) {
    return h('div', {},
      h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin:12px 0' },
        stat(v.orderCount, `orders at ${v.locationId}`),
        stat(v.presentOnLostDate === null ? 'n/a' : (v.presentOnLostDate ? 'Yes' : 'No'), v.lostDate ? `ordered there on ${v.lostDate}` : 'present on lost date'),
        stat(v.isFirstTimeUser ? 'Yes' : 'No', 'first-time visitor'),
        stat(v.lastOrderDate ? LF.formatDateTime(v.lastOrderDate) : 'None', 'last order here'),
        h('div', { style: `padding:12px;border-radius:8px;min-width:130px;color:#fff;background:${CRED_COLOR[v.credibility] || '#555'}` },
          h('div', { style: 'font-size:22px;font-weight:600;text-transform:uppercase' }, v.credibility),
          h('div', {}, 'claim credibility'))),
      h('ul', {}, ...v.reasons.map((r) => h('li', {}, r))),
      ...v.ordersAtLocation.slice(0, 5).map((o) =>
        h('p', { class: 'text-muted', style: 'margin:2px 0' }, `Order ${o.orderId} · ${LF.formatDateTime(o.timestamp)}`)),
      h('p', { class: 'text-muted', style: 'font-size:12px;margin-top:8px' },
        `Source: Strathbites API, ${v.partnerCalls.length} calls. Details in the browser console (F12).`));
  }

  // ---------- section 1: claims on this item ----------
  const claimsBox = h('div', {});
  const claimsCard = h('div', { class: 'inquiry-section', style: 'margin-top:24px' },
    h('h3', {}, 'Verify claims with Strathbites'),
    h('p', { class: 'text-muted' }, 'Checks each claimant\'s Strathbites order history for the cafeteria where this item was found, on the day it was found.'),
    claimsBox);

  async function loadClaims() {
    claimsBox.replaceChildren(h('p', {}, 'Loading claims…'));
    let claims;
    try { claims = await LF.api(`/found-items/${encodeURIComponent(itemId)}/inquiries`); }
    catch (e) { claimsBox.replaceChildren(h('p', { class: 'error-message' }, e.message)); return; }
    if (!claims.length) { claimsBox.replaceChildren(h('p', { class: 'text-muted' }, 'No claims on this item yet.')); return; }
    claimsBox.replaceChildren(...claims.map((c) => {
      const out = h('div', {});
      const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Verify with Strathbites');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.replaceChildren(h('p', {}, 'Checking with Strathbites…'));
        try {
          const d = await callOurApi(`/inquiries/${encodeURIComponent(c.inquiryId)}/verify`, `claim by ${c.claimantName}`);
          out.replaceChildren(
            h('p', { class: 'text-muted' }, `Strathbites user ${d.claimant.strathbitesUserId} · ${d.verification.locationId} · found ${d.item.dateFound}`),
            renderVerification(d.verification));
        } catch (e) {
          out.replaceChildren(h('p', { class: 'error-message', role: 'alert' }, e.message || 'Partner data is unavailable right now.'));
        }
        btn.disabled = false;
      });
      return h('div', { style: 'border-top:1px solid #eee;padding:12px 0' },
        h('p', {}, h('strong', {}, c.claimantName), ` (${c.status}): `, c.claimDescription), btn, out);
    }));
  }

  // ---------- section 2: manual check ----------
  const userInput = h('input', { id: 'sbUserId', type: 'text', value: '3', 'aria-label': 'Strathbites user ID', style: 'padding:8px;border-radius:6px;border:1px solid #ccc;width:110px' });
  const locInput = h('input', { id: 'sbLocation', type: 'text', value: 'cafe-3', 'aria-label': 'Strathbites location ID', style: 'padding:8px;border-radius:6px;border:1px solid #ccc;width:120px' });
  const dateInput = h('input', { id: 'sbDate', type: 'date', 'aria-label': 'Date lost', style: 'padding:8px;border-radius:6px;border:1px solid #ccc' });
  const button = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Check');
  const result = h('div', { style: 'margin-top:12px' });
  const form = h('form', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
    h('label', { for: 'sbUserId' }, 'Strathbites user'), userInput,
    h('label', { for: 'sbLocation' }, 'Cafeteria'), locInput,
    h('label', { for: 'sbDate' }, 'Date'), dateInput, button);
  const manualCard = h('div', { class: 'inquiry-section', style: 'margin-top:16px' },
    h('h3', {}, 'Manual Strathbites check'), form, result);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    result.replaceChildren(h('p', {}, 'Checking with Strathbites…'));
    try {
      const q = new URLSearchParams({ userId: userInput.value.trim(), locationId: locInput.value.trim() });
      if (dateInput.value) q.set('lostDate', dateInput.value);
      const d = await callOurApi(`/claims/verify?${q}`, `manual check user ${userInput.value.trim()}`);
      result.replaceChildren(renderVerification(d));
    } catch (e) {
      result.replaceChildren(h('p', { class: 'error-message', role: 'alert' }, e.message || 'Partner data is unavailable right now.'));
    }
    button.disabled = false;
  });

  anchor.after(claimsCard, manualCard);
  loadClaims();

  // Prefill cafeteria and date from the item record.
  LF.api(`/found-items/${encodeURIComponent(itemId)}`).then((item) => {
    const cafe = extractCafe(item.location);
    if (cafe) locInput.value = cafe;
    if (item.dateFound) dateInput.value = String(item.dateFound).slice(0, 10);
  }).catch(() => {});
})();
