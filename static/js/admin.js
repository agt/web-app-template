let allUsers = [];
let pendingPhotoFile = null;   // photo staged in Add mode before equipment ID exists

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return; }

  document.getElementById('user-name').textContent  = user.full_name;
  document.getElementById('user-email').textContent = user.email;

  document.getElementById('logout-btn').addEventListener('click', logout);

  setupNav();
  await loadStats();
  await loadUsers();
  loadSection('equipment');
});

// ── Navigation ────────────────────────────────────────────────────────────

function setupNav() {
  document.querySelectorAll('.nav-link[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      btn.classList.add('active');
      loadSection(btn.dataset.section);
    });
  });

  // Stat tiles navigate to their section and highlight the matching nav link
  document.querySelectorAll('.stat-card[data-section]').forEach(tile => {
    tile.addEventListener('click', () => {
      const target = tile.dataset.section;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const navBtn = document.querySelector(`.nav-link[data-section="${target}"]`);
      if (navBtn) navBtn.classList.add('active');
      loadSection(target);
    });
  });
}

async function loadSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`section-${name}`);
  if (el) el.classList.add('active');

  if (name === 'equipment') await loadEquipment();
  else if (name === 'checkouts') await loadAllCheckouts();
  else if (name === 'users') await loadUsers();
}

// ── Stats ────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const s = await apiGet('/admin/stats');
    document.getElementById('stat-equipment').textContent  = s.total_equipment;
    document.getElementById('stat-active').textContent     = s.active_checkouts;
    document.getElementById('stat-overdue').textContent    = s.overdue_checkouts;
    document.getElementById('stat-users').textContent      = s.total_users;
  } catch (_) {}
}

// ── Equipment ─────────────────────────────────────────────────────────────

async function loadEquipment() {
  const tbody = document.getElementById('equipment-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-sm">Loading…</td></tr>';

  try {
    const items = await apiGet('/equipment');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-sm">No equipment yet.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(eq => `
      <tr>
        <td><strong>${escHtml(eq.name)}</strong></td>
        <td class="text-sm text-muted">${escHtml(eq.description)}</td>
        <td class="text-sm">${escHtml(eq.location)}</td>
        <td>${availBadge(eq.is_available)}</td>
        <td>
          <div class="flex gap-1">
            <!-- 1.1.1: aria-label names icon-only buttons -->
            <button class="btn btn-icon edit-eq-btn"
              aria-label="Edit ${escHtml(eq.name)}" data-id="${eq.id}">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
            </button>
            <button class="btn btn-icon policy-btn"
              aria-label="Checkout policy for ${escHtml(eq.name)}"
              data-id="${eq.id}" data-name="${escHtml(eq.name)}">
              <i class="fa-solid fa-sliders" aria-hidden="true"></i>
            </button>
            ${eq.is_available
              ? `<button class="btn btn-icon admin-checkout-btn"
                   aria-label="Check out ${escHtml(eq.name)} on behalf of a user"
                   data-id="${eq.id}" data-name="${escHtml(eq.name)}"
                   data-max="${eq.max_checkout_days}">
                   <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>
                 </button>`
              : ''}
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.edit-eq-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditEquipment(Number(btn.dataset.id), btn));
    });
    tbody.querySelectorAll('.policy-btn').forEach(btn => {
      btn.addEventListener('click', () => openPolicyModal(Number(btn.dataset.id), btn.dataset.name, btn));
    });
    tbody.querySelectorAll('.admin-checkout-btn').forEach(btn => {
      btn.addEventListener('click', () => openAdminCheckoutModal(
        Number(btn.dataset.id), btn.dataset.name, Number(btn.dataset.max), btn,
      ));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
  }
}

// ── Add Equipment modal ───────────────────────────────────────────────────

document.getElementById('add-equipment-btn').addEventListener('click', (e) => {
  document.getElementById('eq-modal-title').textContent = 'Add Equipment';
  document.getElementById('eq-form').reset();
  document.getElementById('eq-id').value = '';
  hideAlert(document.getElementById('eq-alert'));
  document.getElementById('eq-active-row').classList.add('hidden');
  document.getElementById('eq-photo-section').classList.remove('hidden'); // always show
  pendingPhotoFile = null;
  resetPhotoPreview();
  openModal('eq-modal', e.currentTarget);
});

document.getElementById('eq-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('eq-modal');
});
document.getElementById('cancel-eq').addEventListener('click', () => closeModal('eq-modal'));

async function openEditEquipment(id, triggerEl) {
  pendingPhotoFile = null;   // edit mode uploads immediately, never uses pending file
  const items = await apiGet('/equipment');
  const eq = items.find(e => e.id === id);
  if (!eq) return;

  document.getElementById('eq-modal-title').textContent = 'Edit Equipment';
  document.getElementById('eq-id').value          = eq.id;
  document.getElementById('eq-name').value         = eq.name;
  document.getElementById('eq-description').value  = eq.description;
  document.getElementById('eq-location').value     = eq.location;
  document.getElementById('eq-is-active').checked  = eq.is_active;
  document.getElementById('eq-active-row').classList.remove('hidden');
  document.getElementById('eq-photo-section').classList.remove('hidden');

  // Photo preview
  const preview     = document.getElementById('photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  const removeBtn   = document.getElementById('remove-photo-btn');
  if (eq.image_url) {
    // 1.1.1: alt = equipment name so it describes the photo
    preview.alt = eq.name;
    preview.src = eq.image_url;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
  document.getElementById('photo-file-input').value = '';
  hideAlert(document.getElementById('photo-alert'));
  hideAlert(document.getElementById('eq-alert'));
  openModal('eq-modal', triggerEl);
}

document.getElementById('save-eq').addEventListener('click', async () => {
  const btn   = document.getElementById('save-eq');
  const alert = document.getElementById('eq-alert');
  const id    = document.getElementById('eq-id').value;
  hideAlert(alert);
  btn.disabled = true;

  const body = {
    name:        document.getElementById('eq-name').value.trim(),
    description: document.getElementById('eq-description').value.trim(),
    location:    document.getElementById('eq-location').value.trim(),
  };

  if (!body.name) {
    showAlert(alert, 'Name is required.');
    btn.disabled = false;
    return;
  }

  try {
    if (id) {
      body.is_active = document.getElementById('eq-is-active').checked;
      await apiPut(`/equipment/${id}`, body);
    } else {
      const created = await apiPost('/equipment', body);
      // Upload any photo the user staged before the equipment ID existed
      if (pendingPhotoFile) {
        const fd = new FormData();
        fd.append('file', pendingPhotoFile);
        await fetch(`/api/equipment/${created.id}/photo`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: fd,
        });
        pendingPhotoFile = null;
      }
    }
    closeModal('eq-modal');
    await Promise.all([loadEquipment(), loadStats()]);
  } catch (err) {
    showAlert(alert, err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── Policy modal ──────────────────────────────────────────────────────────

let policyEquipmentId = null;

async function openPolicyModal(equipmentId, name, triggerEl) {
  policyEquipmentId = equipmentId;
  document.getElementById('policy-eq-name').textContent = name;
  hideAlert(document.getElementById('policy-alert'));

  document.querySelectorAll('.day-checkbox').forEach(cb => { cb.checked = true; });
  document.getElementById('policy-max-days').value = 7;
  document.getElementById('allowed-all').checked = true;
  document.getElementById('allowed-specific-wrap').classList.add('hidden');
  populateAllowedUsersSelect();

  try {
    const policy = await apiGet(`/equipment/${equipmentId}/policy`);
    document.querySelectorAll('.day-checkbox').forEach(cb => {
      cb.checked = policy.days_of_week.includes(Number(cb.value));
    });
    document.getElementById('policy-max-days').value = policy.max_checkout_days;
    if (policy.allowed_users === 'all') {
      document.getElementById('allowed-all').checked = true;
      document.getElementById('allowed-specific-wrap').classList.add('hidden');
    } else {
      document.getElementById('allowed-specific').checked = true;
      document.getElementById('allowed-specific-wrap').classList.remove('hidden');
      const sel = document.getElementById('allowed-users-select');
      Array.from(sel.options).forEach(opt => {
        opt.selected = policy.allowed_users.includes(Number(opt.value));
      });
    }
  } catch (_) {}

  openModal('policy-modal', triggerEl);
}

function populateAllowedUsersSelect() {
  const sel = document.getElementById('allowed-users-select');
  sel.innerHTML = allUsers.filter(u => u.role === 'user').map(u =>
    `<option value="${u.id}">${escHtml(u.full_name)} (${escHtml(u.email)})</option>`
  ).join('');
}

document.querySelectorAll('[name="allowed-type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('allowed-specific-wrap').classList.toggle(
      'hidden', document.getElementById('allowed-all').checked
    );
  });
});

document.getElementById('policy-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('policy-modal');
});
document.getElementById('cancel-policy').addEventListener('click', () => closeModal('policy-modal'));

document.getElementById('save-policy').addEventListener('click', async () => {
  const btn   = document.getElementById('save-policy');
  const alert = document.getElementById('policy-alert');
  hideAlert(alert);
  btn.disabled = true;

  const days = [];
  document.querySelectorAll('.day-checkbox:checked').forEach(cb => days.push(Number(cb.value)));
  const maxDays = Number(document.getElementById('policy-max-days').value);

  if (days.length === 0) {
    showAlert(alert, 'Select at least one allowed day.');
    btn.disabled = false;
    return;
  }
  if (!maxDays || maxDays < 1) {
    showAlert(alert, 'Max checkout days must be at least 1.');
    btn.disabled = false;
    return;
  }

  let allowedUsers = 'all';
  if (document.getElementById('allowed-specific').checked) {
    const sel = document.getElementById('allowed-users-select');
    allowedUsers = Array.from(sel.selectedOptions).map(o => Number(o.value));
    if (!allowedUsers.length) {
      showAlert(alert, 'Select at least one user, or choose "All users".');
      btn.disabled = false;
      return;
    }
  }

  try {
    await apiPut(`/equipment/${policyEquipmentId}/policy`, {
      days_of_week: days,
      max_checkout_days: maxDays,
      allowed_users: allowedUsers,
    });
    closeModal('policy-modal');
  } catch (err) {
    showAlert(alert, err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── Users ─────────────────────────────────────────────────────────────────

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-sm">Loading…</td></tr>';

  try {
    allUsers = await apiGet('/admin/users');
    if (!tbody) return;
    if (!allUsers.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-sm">No users.</td></tr>';
      return;
    }
    tbody.innerHTML = allUsers.map(u => `
      <tr>
        <td><strong>${escHtml(u.full_name)}</strong></td>
        <td>${escHtml(u.email)}</td>
        <td>${u.role === 'admin'
          ? '<span class="badge badge-admin"><i class="fa-solid fa-shield" aria-hidden="true"></i>Admin</span>'
          : '<span class="badge badge-secondary">User</span>'}</td>
        <td>${u.is_active
          ? '<span class="badge badge-success">Active</span>'
          : '<span class="badge badge-secondary">Inactive</span>'}</td>
        <td>
          <!-- 1.1.1: aria-label names the icon-only edit button -->
          <button class="btn btn-icon edit-user-btn"
            aria-label="Edit ${escHtml(u.full_name)}" data-id="${u.id}">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditUser(Number(btn.dataset.id), btn));
    });
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
  }
}

// ── Add/Edit User modal ───────────────────────────────────────────────────

document.getElementById('add-user-btn').addEventListener('click', (e) => {
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
  document.getElementById('user-password-hint').textContent = 'Required for new users.';
  document.getElementById('user-active-row').classList.add('hidden');
  hideAlert(document.getElementById('user-alert'));
  openModal('user-modal', e.currentTarget);
});

document.getElementById('user-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('user-modal');
});
document.getElementById('cancel-user').addEventListener('click', () => closeModal('user-modal'));

function openEditUser(id, triggerEl) {
  const u = allUsers.find(u => u.id === id);
  if (!u) return;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('user-id').value       = u.id;
  document.getElementById('user-email').value    = u.email;
  document.getElementById('user-fullname').value = u.full_name;
  document.getElementById('user-role').value     = u.role;
  document.getElementById('user-password').value = '';
  document.getElementById('user-password-hint').textContent = 'Leave blank to keep current password.';
  document.getElementById('user-is-active').checked = u.is_active;
  document.getElementById('user-active-row').classList.remove('hidden');
  hideAlert(document.getElementById('user-alert'));
  openModal('user-modal', triggerEl);
}

document.getElementById('save-user').addEventListener('click', async () => {
  const btn   = document.getElementById('save-user');
  const alert = document.getElementById('user-alert');
  const id    = document.getElementById('user-id').value;
  hideAlert(alert);
  btn.disabled = true;

  const body = {
    email:     document.getElementById('user-email').value.trim(),
    full_name: document.getElementById('user-fullname').value.trim(),
    role:      document.getElementById('user-role').value,
    password:  document.getElementById('user-password').value,
  };

  if (!body.email || !body.full_name) {
    showAlert(alert, 'Email and name are required.');
    btn.disabled = false;
    return;
  }

  try {
    if (id) {
      const upd = {
        full_name: body.full_name,
        role: body.role,
        is_active: document.getElementById('user-is-active').checked,
      };
      if (body.password) upd.password = body.password;
      await apiPut(`/admin/users/${id}`, upd);
    } else {
      if (!body.password) {
        showAlert(alert, 'Password is required.');
        btn.disabled = false;
        return;
      }
      await apiPost('/admin/users', body);
    }
    closeModal('user-modal');
    await loadUsers();
    await loadStats();
  } catch (err) {
    showAlert(alert, err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── All checkouts ─────────────────────────────────────────────────────────

async function loadAllCheckouts() {
  const tbody = document.getElementById('checkouts-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-sm">Loading…</td></tr>';

  try {
    const rows = await apiGet('/checkouts');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-sm">No checkouts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td><strong>${escHtml(c.equipment_name)}</strong></td>
        <td>${escHtml(c.user_full_name)}<br>
            <span class="text-muted text-sm">${escHtml(c.user_email)}</span></td>
        <td>${fmtDate(c.checkout_date)}</td>
        <td>${fmtDate(c.due_date)}</td>
        <td>${c.return_date ? fmtDate(c.return_date) : '—'}</td>
        <td>${statusBadge(c.status)}</td>
        <td>
          ${c.status !== 'returned'
            ? `<button class="btn btn-sm btn-secondary admin-return-btn" data-id="${c.id}"
                 aria-label="Return ${escHtml(c.equipment_name)} for ${escHtml(c.user_full_name)}">
                 <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Return
               </button>`
            : ''}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.admin-return-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await apiPost(`/checkouts/${btn.dataset.id}/return`, {});
          await Promise.all([loadAllCheckouts(), loadStats()]);
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${err.message}</td></tr>`;
  }
}

// ── Admin checkout on behalf of user ─────────────────────────────────────

let adminCheckoutEquipmentId = null;

function openAdminCheckoutModal(equipmentId, name, maxDays, triggerEl) {
  adminCheckoutEquipmentId = equipmentId;
  document.getElementById('admin-checkout-eq-name').textContent = name;
  hideAlert(document.getElementById('admin-checkout-alert'));
  document.getElementById('admin-checkout-notes').value = '';

  // Populate user selector from already-loaded allUsers list
  const sel = document.getElementById('admin-checkout-user');
  sel.innerHTML = '<option value="">— select a user —</option>' +
    allUsers.filter(u => u.is_active).map(u =>
      `<option value="${u.id}">${escHtml(u.full_name)} (${escHtml(u.email)})</option>`
    ).join('');

  const slider = document.getElementById('admin-checkout-duration');
  const valEl  = document.getElementById('admin-checkout-duration-val');
  slider.min   = 1;
  slider.max   = maxDays;
  slider.value = maxDays;
  valEl.textContent = `${maxDays} day${maxDays !== 1 ? 's' : ''}`;
  slider.oninput = () => {
    valEl.textContent = `${slider.value} day${slider.value != 1 ? 's' : ''}`;
  };

  document.getElementById('admin-checkout-duration-row')
    .classList.toggle('hidden', maxDays === 1);

  openModal('admin-checkout-modal', triggerEl);
}

document.getElementById('admin-checkout-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('admin-checkout-modal');
});
document.getElementById('cancel-admin-checkout').addEventListener('click',
  () => closeModal('admin-checkout-modal'));

document.getElementById('confirm-admin-checkout').addEventListener('click', async () => {
  const btn    = document.getElementById('confirm-admin-checkout');
  const alert  = document.getElementById('admin-checkout-alert');
  const userId = Number(document.getElementById('admin-checkout-user').value);
  hideAlert(alert);

  if (!userId) {
    showAlert(alert, 'Please select a user.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin" aria-hidden="true"></i> Checking out…';

  try {
    await apiPost('/checkouts', {
      equipment_id: adminCheckoutEquipmentId,
      user_id:      userId,
      duration_days: Number(document.getElementById('admin-checkout-duration').value),
      notes:        document.getElementById('admin-checkout-notes').value,
    });
    closeModal('admin-checkout-modal');
    await Promise.all([loadEquipment(), loadStats()]);
  } catch (err) {
    showAlert(alert, err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Confirm Checkout';
  }
});

// ── Photo upload ──────────────────────────────────────────────────────────

function resetPhotoPreview() {
  const preview     = document.getElementById('photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  const removeBtn   = document.getElementById('remove-photo-btn');
  if (preview.dataset.blobUrl) {
    URL.revokeObjectURL(preview.dataset.blobUrl);
    delete preview.dataset.blobUrl;
  }
  preview.src = '';
  preview.alt = '';
  preview.classList.add('hidden');
  placeholder.classList.remove('hidden');
  removeBtn.classList.add('hidden');
  document.getElementById('photo-file-input').value = '';
  hideAlert(document.getElementById('photo-alert'));
}

async function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const id          = document.getElementById('eq-id').value;
  const alertEl     = document.getElementById('photo-alert');
  const preview     = document.getElementById('photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  const removeBtn   = document.getElementById('remove-photo-btn');
  const eqName      = document.getElementById('eq-name').value.trim();
  hideAlert(alertEl);

  if (!id) {
    // ── ADD mode: no equipment ID yet — stage the file and show a local preview ──
    // Validate MIME client-side to give immediate feedback
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showAlert(alertEl, 'File must be JPEG, PNG, GIF, or WEBP.');
      input.value = '';
      return;
    }
    pendingPhotoFile = file;
    preview.alt = eqName || 'Equipment photo';
    // Revoke any previous blob URL to avoid memory leaks
    if (preview.dataset.blobUrl) URL.revokeObjectURL(preview.dataset.blobUrl);
    const blobUrl = URL.createObjectURL(file);
    preview.dataset.blobUrl = blobUrl;
    preview.src = blobUrl;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    removeBtn.classList.remove('hidden');
    return;
  }

  // ── EDIT mode: equipment already exists — upload immediately ──
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/equipment/${id}/photo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      showAlert(alertEl, err.detail || 'Upload failed');
      return;
    }
    const eq = await res.json();
    if (eq.image_url) {
      preview.alt = eqName || 'Equipment photo';
      preview.src = eq.image_url + '?t=' + Date.now();
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
      removeBtn.classList.remove('hidden');
    }
    await loadEquipment();
  } catch (err) {
    showAlert(alertEl, err.message);
  }
}

async function removePhoto() {
  const id      = document.getElementById('eq-id').value;
  const alertEl = document.getElementById('photo-alert');
  hideAlert(alertEl);

  if (!id) {
    // ADD mode: just discard the staged file
    pendingPhotoFile = null;
    resetPhotoPreview();
    return;
  }

  try {
    const res = await fetch(`/api/equipment/${id}/photo`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Delete failed' }));
      showAlert(alertEl, err.detail || 'Delete failed');
      return;
    }
    const preview     = document.getElementById('photo-preview');
    const placeholder = document.getElementById('photo-placeholder');
    const removeBtn   = document.getElementById('remove-photo-btn');
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
    document.getElementById('photo-file-input').value = '';
    await loadEquipment();
  } catch (err) {
    showAlert(alertEl, err.message);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
