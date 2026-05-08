const API_BASE = '/api';
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getToken() { return localStorage.getItem('lab_token'); }
function setToken(t) { localStorage.setItem('lab_token', t); }
function clearToken() { localStorage.removeItem('lab_token'); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    return;
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.detail || `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join('; ') : msg);
  }

  return data;
}

function apiGet(path)         { return apiFetch(path); }
function apiPost(path, body)  { return apiFetch(path, { method: 'POST',  body: JSON.stringify(body) }); }
function apiPut(path, body)   { return apiFetch(path, { method: 'PUT',   body: JSON.stringify(body) }); }
function apiDelete(path)      { return apiFetch(path, { method: 'DELETE' }); }

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const map = {
    active:   ['badge-primary', 'fa-circle-dot',   'Active'],
    returned: ['badge-success', 'fa-circle-check',  'Returned'],
    overdue:  ['badge-danger',  'fa-circle-exclamation', 'Overdue'],
  };
  const [cls, icon, label] = map[status] || ['badge-secondary', 'fa-circle', status];
  // 1.1.1: icon is decorative — badge text already conveys meaning
  return `<span class="badge ${cls}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}</span>`;
}

function availBadge(available) {
  // 1.1.1: icons are decorative — text conveys meaning
  return available
    ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>Available</span>`
    : `<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>Checked Out</span>`;
}

function showAlert(el, msg, type = 'danger') {
  el.className = `alert alert-${type}`;
  // 1.1.1: icon is decorative alongside the text
  el.innerHTML = `<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${msg}`;
  el.classList.remove('hidden');
}

// ── 2.1.1 / 2.4.3 / 4.1.2: Modal management ──────────────────────────────
// Handles focus movement, focus trap, Escape key, and focus return on close.

const _FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function _getFocusable(el) {
  return [...el.querySelectorAll(_FOCUSABLE)].filter(
    n => !n.closest('[hidden]') && !n.closest('.hidden') && getComputedStyle(n).display !== 'none'
  );
}

/**
 * Open a modal, move focus into it, and install a focus trap + Escape handler.
 * @param {string}      modalId   — id of the .modal-backdrop element
 * @param {Element|null} triggerEl — element that opened the modal (focus returns here on close)
 */
function openModal(modalId, triggerEl) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal._trigger = triggerEl || document.activeElement;
  modal.classList.remove('hidden');

  // Move focus to the first focusable element inside the modal
  const els = _getFocusable(modal);
  if (els.length) els[0].focus();

  modal._keyHandler = (e) => {
    if (e.key === 'Escape') { closeModal(modalId); return; }
    if (e.key !== 'Tab') return;
    const focusable = _getFocusable(modal);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', modal._keyHandler);
}

/**
 * Close a modal, remove the key handler, and return focus to the trigger.
 * @param {string} modalId
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('hidden');
  if (modal._keyHandler) {
    document.removeEventListener('keydown', modal._keyHandler);
    modal._keyHandler = null;
  }
  if (modal._trigger) {
    modal._trigger.focus();
    modal._trigger = null;
  }
}

function hideAlert(el) { el.classList.add('hidden'); }

async function requireAuth() {
  const token = getToken();
  if (!token) { window.location.href = '/login.html'; return null; }
  try {
    return await apiGet('/auth/me');
  } catch {
    clearToken();
    window.location.href = '/login.html';
    return null;
  }
}

function logout() {
  clearToken();
  window.location.href = '/login.html';
}
