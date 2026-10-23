// Week 10 integration: on an item's page, check a claimant against the
// Strathbites API (cafeteria orders) through OUR server's /claims/verify route.
// The browser never calls Strathbites directly.
(() => {
  const anchor = document.getElementById('inquirySection');
  if (!anchor || !window.LF) return;
  const { h } = LF;

  const userInput = h('input', { id: 'sbUserId', type: 'text', value: '3', 'aria-label': 'Claimant Strathbites user ID', style: 'padding:8px;border-radius:6px;border:1px solid #ccc;width:120px' });
  const locInput = h('input', { id: 'sbLocation', type: 'text', value: 'cafe-3', 'aria-label': 'Cafeteria where the item was lost', style: 'padding:8px;border-radius:6px;border:1px solid #ccc;width:140px' });
  const button = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Check with Strathbites');
  const result = h('div', { style: 'margin-top:12px' });

  const form = h('form', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
    h('label', { for: 'sbUserId' }, 'Claimant ID'), userInput,
    h('label', { for: 'sbLocation' }, 'Cafeteria'), locInput, button);

  const card = h('div', { class: 'inquiry-section', style: 'margin-top:24px' },
    h('h3', {}, 'Verify claimant with Strathbites'),
    h('p', { class: 'text-muted' }, 'Was the claimant at the cafeteria where this item was found? Data comes live from the Strathbites ordering API.'),
    form, result);
  anchor.after(card);

  // Prefill the cafeteria if the item was found at one (e.g. "cafe-2").
  setTimeout(() => {
    const loc = (document.getElementById('itemLocation')?.textContent || '').trim();
    if (/^cafe-\d+$/i.test(loc)) locInput.value = loc.toLowerCase();
  }, 800);

  const stat = (value, label) => h('div', { style: 'padding:12px;border:1px solid #ddd;border-radius:8px;min-width:130px' },
    h('div', { style: 'font-size:22px;font-weight:600' }, String(value)),
    h('div', { class: 'text-muted' }, label));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    result.replaceChildren(h('p', {}, 'Checking with Strathbites…'));
    try {
      const q = new URLSearchParams({ userId: userInput.value.trim(), locationId: locInput.value.trim() });
      const d = await LF.api(`/claims/verify?${q}`);
      const verdict = d.orderCount > 0
        ? `Claimant has ordered at ${d.locationId} ${d.orderCount} time(s). Credibility: ${d.credibility}.`
        : `Claimant has never ordered at ${d.locationId}. Credibility: low.`;
      result.replaceChildren(
        h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px' },
          stat(d.orderCount, `orders at ${d.locationId}`),
          stat(d.isFirstTimeUser ? 'Yes' : 'No', 'first-time visitor'),
          stat(d.lastOrderDate ? LF.formatDateTime(d.lastOrderDate) : 'None', 'last order here'),
          stat(d.credibility, 'claim credibility')),
        h('p', { class: 'info-message' }, verdict),
        ...d.ordersAtLocation.slice(0, 5).map((o) =>
          h('p', { class: 'text-muted' }, `Order ${o.orderId} · ${LF.formatDateTime(o.timestamp)}`)));
    } catch (e) {
      result.replaceChildren(h('p', { class: 'error-message', role: 'alert' }, e.message || 'Partner data is unavailable right now.'));
    }
    button.disabled = false;
  });
})();
