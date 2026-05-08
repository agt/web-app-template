let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth();
  if (!currentUser) return;

  document.getElementById('user-name').textContent  = currentUser.full_name;
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role').textContent  = currentUser.role;

  if (currentUser.role === 'admin') {
    document.getElementById('admin-link').classList.remove('hidden');
  }

  document.getElementById('logout-btn').addEventListener('click', logout);

  setupNav();
  await Promise.all([loadEquipment(), loadMyCheckouts()]);
});

// ── Navigation ────────────────────────────────────────────────────────────

function setupNav() {
  document.querySelectorAll('.nav-link[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(btn.dataset.section).classList.add('active');
    });
  });
}

// ── Equipment ─────────────────────────────────────────────────────────────

async function loadEquipment() {
  const grid  = document.getElementById('equipment-grid');
  const count = document.getElementById('eq-count');
  grid.innerHTML = '<p class="text-muted text-sm">Loading…</p>';

  try {
    const items = await apiGet('/equipment');
    count.textContent = items.length;

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open" aria-hidden="true"></i>
          <p>No equipment found</p>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(eq => equipmentCard(eq)).join('');

    grid.querySelectorAll('.checkout-btn').forEach(btn => {
      btn.addEventListener('click', () => openCheckoutModal(
        Number(btn.dataset.id),
        btn.dataset.name,
        Number(btn.dataset.max),
        btn,           // 2.4.3: pass trigger so focus returns on close
      ));
    });
  } catch (err) {
    grid.innerHTML = `<p class="text-muted">Error: ${err.message}</p>`;
  }
}

function equipmentCard(eq) {
  // 1.1.1: decorative placeholder icon gets aria-hidden
  const iconCls = eq.is_available ? '' : 'unavailable';
  const actions = eq.is_available
    ? `<button class="btn btn-primary btn-sm checkout-btn"
         data-id="${eq.id}" data-name="${escHtml(eq.name)}" data-max="${eq.max_checkout_days}">
         <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>Check Out
       </button>`
    : `<span class="text-sm text-muted">
         <i class="fa-solid fa-user" aria-hidden="true"></i>
         ${escHtml(eq.active_checkout_user || '')}
       </span>`;

  // 1.1.1: photo gets the equipment name as alt; decorative icon gets aria-hidden
  const photo = eq.image_url
    ? `<img class="equipment-card-img" src="${eq.image_url}" alt="${escHtml(eq.name)}">`
    : '';
  const headerIcon = eq.image_url
    ? ''
    : `<div class="eq-icon ${iconCls}" aria-hidden="true">
         <i class="fa-solid fa-microchip"></i>
       </div>`;

  // 1.1.1: location pin icon is decorative
  const locationHtml = eq.location
    ? `<p class="eq-location">
         <i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escHtml(eq.location)}
       </p>`
    : '';

  return `
    <div class="equipment-card" role="listitem">
      ${photo}
      <div class="equipment-card-header">
        ${headerIcon}
        <div>
          <strong>${escHtml(eq.name)}</strong>
          ${availBadge(eq.is_available)}
        </div>
      </div>
      <div class="equipment-card-body">
        ${eq.description ? `<p class="eq-desc">${escHtml(eq.description)}</p>` : ''}
        ${locationHtml}
      </div>
      <div class="equipment-card-footer">
        ${actions}
      </div>
    </div>`;
}

// ── Checkout modal ────────────────────────────────────────────────────────

let pendingCheckoutId = null;
let pendingMaxDays    = 7;

function openCheckoutModal(id, name, maxDays, triggerEl) {
  pendingCheckoutId = id;
  pendingMaxDays    = maxDays || 7;
  document.getElementById('checkout-eq-name').textContent = name;
  document.getElementById('checkout-notes').value = '';

  const slider = document.getElementById('checkout-duration');
  const valEl  = document.getElementById('checkout-duration-val');
  slider.min   = 1;
  slider.max   = pendingMaxDays;
  slider.value = pendingMaxDays;
  valEl.textContent = `${pendingMaxDays} day${pendingMaxDays !== 1 ? 's' : ''}`;

  // Wire up the slider live update (re-attach each open to avoid stale handlers)
  slider.oninput = () => {
    valEl.textContent = `${slider.value} day${slider.value != 1 ? 's' : ''}`;
  };

  document.getElementById('checkout-duration-row').classList.toggle('hidden', pendingMaxDays === 1);

  hideAlert(document.getElementById('checkout-alert'));
  // 2.4.3 / 4.1.2: openModal moves focus and installs focus trap + Escape handler
  openModal('checkout-modal', triggerEl);
}

function closeCheckoutModal() {
  closeModal('checkout-modal');
  pendingCheckoutId = null;
}

// Backdrop click dismisses the modal
document.getElementById('checkout-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCheckoutModal();
});

document.getElementById('cancel-checkout').addEventListener('click', closeCheckoutModal);

document.getElementById('confirm-checkout').addEventListener('click', async () => {
  const btn   = document.getElementById('confirm-checkout');
  const alert = document.getElementById('checkout-alert');
  hideAlert(alert);
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin" aria-hidden="true"></i> Checking out…';

  try {
    const duration = Number(document.getElementById('checkout-duration').value);
    await apiPost('/checkouts', {
      equipment_id: pendingCheckoutId,
      notes: document.getElementById('checkout-notes').value,
      duration_days: duration,
    });
    closeCheckoutModal();
    await Promise.all([loadEquipment(), loadMyCheckouts()]);

    // Switch to My Checkouts tab
    document.querySelector('.nav-link[data-section="my-checkouts"]').click();
  } catch (err) {
    showAlert(alert, err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>Confirm';
  }
});

// ── My checkouts ──────────────────────────────────────────────────────────

async function loadMyCheckouts() {
  const tbody = document.getElementById('my-checkouts-body');
  tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Loading…</td></tr>';

  try {
    const rows = await apiGet('/checkouts/me');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-sm">No checkouts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td><strong>${escHtml(c.equipment_name)}</strong></td>
        <td>${fmtDate(c.checkout_date)}</td>
        <td>${fmtDate(c.due_date)}</td>
        <td>${c.return_date ? fmtDate(c.return_date) : '—'}</td>
        <td>${statusBadge(c.status)}</td>
        <td>
          ${c.status !== 'returned'
            ? `<button class="btn btn-sm btn-secondary return-btn" data-id="${c.id}"
                 aria-label="Return ${escHtml(c.equipment_name)}">
                 <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Return
               </button>`
            : ''}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.return-btn').forEach(btn => {
      btn.addEventListener('click', () => returnEquipment(Number(btn.dataset.id)));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Error: ${err.message}</td></tr>`;
  }
}

async function returnEquipment(checkoutId) {
  try {
    await apiPost(`/checkouts/${checkoutId}/return`, {});
    await Promise.all([loadEquipment(), loadMyCheckouts()]);
  } catch (err) {
    alert(err.message);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
