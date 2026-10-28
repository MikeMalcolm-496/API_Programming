// Session + API helper for login / password change / dashboard / item-detail.
// Wrapped in an IIFE so it can load alongside app.js (which declares its own API_BASE).
(() => {
  const meta = document.querySelector('meta[name="api-base"]');
  const base = (['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? `http://${window.location.hostname}:5000`
    : (meta?.content || 'https://api-programming.onrender.com')).replace(/\/+$/, '');

  const TOKEN_KEY = 'lf_token';
  const USER_KEY = 'lf_user';
  const read = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const drop = (k) => { try { window.localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };

  const token = () => read(TOKEN_KEY);
  const user = () => { try { return JSON.parse(read(USER_KEY)); } catch (e) { return null; } };
  const isStaff = (u = user()) => Boolean(u) && (u.role === 'security' || u.role === 'admin');
  const saveSession = (t, u) => { write(TOKEN_KEY, t); write(USER_KEY, JSON.stringify(u)); };
  const logout = () => { drop(TOKEN_KEY); drop(USER_KEY); };

  async function api(path, { method = 'GET', json, form } = {}) {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form; // browser sets the multipart boundary itself
    }
    const response = await fetch(`${base}${path}`, { method, headers, body });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && token()) {
        logout();
        throw new Error('Your session has expired. Please log in again.');
      }
      throw new Error(payload?.message || `Request failed with status ${response.status}.`);
    }
    return payload;
  }

  // Tiny DOM builder; strings become text nodes, so nothing is ever parsed as HTML.
  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }

  const formatCategory = (c) => String(c).split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const formatDateTime = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  function renderNav() {
    const nav = document.getElementById('navLinks') || document.querySelector('.nav-links');
    if (!nav || nav.dataset.lfNav) return;
    nav.dataset.lfNav = '1';
    const u = user();
    if (u && token()) {
      const onDash = window.location.pathname.endsWith('dashboard.html');
      const logoutBtn = h('button', { class: 'btn btn-outline', type: 'button' }, 'Logout');
      logoutBtn.addEventListener('click', () => { logout(); window.location.href = 'index.html'; });
      if (u.mustChangePassword) {
        nav.append(
          h('li', {}, h('a', { href: 'change-password.html' }, 'Change password')),
          h('li', {}, h('span', { class: 'user-greeting' }, `Hi, ${String(u.fullName).split(' ')[0]}`), logoutBtn)
        );
      } else {
        nav.append(
          h('li', {}, h('a', { href: 'dashboard.html', class: onDash ? 'active' : null }, 'Dashboard')),
          h('li', {}, h('span', { class: 'user-greeting' }, `Hi, ${String(u.fullName).split(' ')[0]}`), logoutBtn)
        );
      }
    } else {
      nav.append(h('li', {}, h('a', { href: 'login.html', class: 'btn btn-outline' }, 'Login')));
    }
  }
  document.addEventListener('DOMContentLoaded', renderNav);

  window.LF = { api, h, token, user, isStaff, saveSession, logout, formatCategory, formatDateTime };
})();
