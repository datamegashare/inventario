// ============================================================
// pages/login.js — Pantalla de login OAuth 213
// ============================================================

Pages.login = async function(params) {
  const app = document.getElementById('app');

  // Manejar error de OAuth
  if (params.error) {
    app.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="#1a4a7a"/>
              <path d="M8 28L16 12L24 22L28 16L32 28H8Z" fill="#4a9fe0" opacity="0.8"/>
              <circle cx="28" cy="14" r="4" fill="#7dd3fc"/>
            </svg>
            <span>DMS Inventario</span>
          </div>
          <div class="alert alert-error">
            <strong>Error de autenticación:</strong> ${UI.escHtml(params.error)}
          </div>
          <button class="btn btn-primary btn-full" id="btn-retry">Intentar nuevamente</button>
        </div>
      </div>
    `;
    document.getElementById('btn-retry').addEventListener('click', startLogin);
    return;
  }

  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#1a4a7a"/>
            <path d="M8 28L16 12L24 22L28 16L32 28H8Z" fill="#4a9fe0" opacity="0.8"/>
            <circle cx="28" cy="14" r="4" fill="#7dd3fc"/>
          </svg>
          <span>DMS Inventario</span>
        </div>
        <h1 class="login-title">Sistema de Inventario de Materiales</h1>
        <p class="login-subtitle">Ingresá con tu cuenta de Google corporativa para continuar.</p>
        <button class="btn btn-google" id="btn-login">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Ingresar con Google
        </button>
        <p class="login-note">Solo usuarios autorizados. Contacte al administrador si no puede acceder.</p>
      </div>
      <div class="login-version">DMS Inventario v1.0 — Etapa 1</div>
    </div>
  `;

  document.getElementById('btn-login').addEventListener('click', startLogin);
};

async function startLogin() {
  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirigiendo...'; }
  try {
    const { auth_url } = await API.getAuthUrl();
    window.location.href = auth_url;
  } catch (err) {
    UI.toast('Error al iniciar sesión: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">...</svg> Ingresar con Google`; }
  }
}

// Callback de OAuth
Pages.authCallback = async function(params) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="full-center"><div class="spinner"></div><p>Completando autenticación...</p></div>`;

  if (!params.code) {
    UI.toast('Código de autorización no recibido', 'error');
    Router.navigate('login');
    return;
  }

  try {
    const tokenData = await API.exchangeToken(params.code);
    Auth.setSession(tokenData);
    UI.toast(`Bienvenido, ${tokenData.nombre}`, 'success');
    Router.navigate('dashboard');
  } catch (err) {
    Auth.clearSession();
    Router.navigate('login?error=' + encodeURIComponent(err.message));
  }
};
