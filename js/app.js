// ============================================================
// app.js — Bootstrap de la SPA
// ============================================================


// ─── LAYOUT ─────────────────────────────────────────────────

function renderLayout(pageTitle, activeNav) {
  const perfil = Auth.getPerfil();
  const nombre = Auth.getNombre();

  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
            <rect width="40" height="40" rx="8" fill="#1a4a7a"/>
            <path d="M8 28L16 12L24 22L28 16L32 28H8Z" fill="#4a9fe0" opacity="0.8"/>
            <circle cx="28" cy="14" r="4" fill="#7dd3fc"/>
          </svg>
          <div>
            <div class="logo-name">AWP Inventory</div>
            <div class="logo-ver">Etapa 1</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a href="#/dashboard" class="nav-item ${activeNav==='dashboard'?'nav-active':''}">
            <span class="nav-icon">⊞</span><span>Dashboard</span>
          </a>
          <a href="#/materiales" class="nav-item ${activeNav==='materiales'?'nav-active':''}">
            <span class="nav-icon">📦</span><span>Materiales</span>
          </a>
          ${['Admin','MatCoord'].includes(perfil) ? `
          <a href="#/admin" class="nav-item ${activeNav==='admin'?'nav-active':''}">
            <span class="nav-icon">⚙</span><span>Administración</span>
          </a>` : ''}
        </nav>

        <div class="sidebar-footer">
          <div class="user-chip">
            <div class="user-avatar">${nombre.charAt(0).toUpperCase()}</div>
            <div>
              <div class="user-name">${UI.escHtml(nombre)}</div>
              <div class="user-role">${UI.escHtml(perfil)}</div>
            </div>
          </div>
          <button class="btn-logout" id="btn-logout" title="Cerrar sesión">⏻</button>
        </div>
      </aside>

      <main class="main-area">
        <div class="main-inner" id="page-content"></div>
      </main>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', () => {
    UI.confirm('¿Cerrar sesión?', () => {
      Auth.clearSession();
      Router.navigate('login');
    });
  });
}

// ─── ROUTING ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Router.on('login',          Pages.login);
  Router.on('auth/callback',  Pages.authCallback);
  Router.on('dashboard',      Pages.dashboard);
  Router.on('materiales',     Pages.materiales);
  Router.on('admin',          Pages.admin);
  Router.on('404', () => {
    document.getElementById('app').innerHTML = `
      <div class="full-center">
        <h2>Página no encontrada</h2>
        <a href="#/dashboard" class="btn btn-primary">Ir al inicio</a>
      </div>
    `;
  });

  Router.init();
});
