document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    window.location.href = '/dashboard.html';
    return;
  }

  const form  = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  const btn   = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alert);
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Signing in…';

    try {
      const { access_token } = await apiPost('/auth/login', {
        email:    form.email.value.trim(),
        password: form.password.value,
      });
      setToken(access_token);
      const user = await apiGet('/auth/me');
      window.location.href = user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    } catch (err) {
      showAlert(alert, err.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
    }
  });
});
