// ============================================================
// app.js — Bootstrap de la SPA  v2.0 213
// ── Etapa 2: rutas recepciones, ncr, series agregadas ────────
// ============================================================

// ─── LAYOUT ─────────────────────────────────────────────────

function renderLayout(pageTitle, activeNav) {
  const perfil = Auth.getPerfil();
  const nombre = Auth.getNombre();

  // Ítems de nav visibles según perfil
  // Regla: cada entrada define qué perfiles pueden verla.
  // Grupos de navegación con separadores visuales
  const navGroups = [
    {
      label: 'Principal',
      items: [
        { id: 'dashboard',   href: '#/dashboard',   icon: '▣', label: 'Dashboard',
          perfiles: ['Admin','MatCoord','Almacenero','QAQC','Planner','FieldEng','ViewerCliente','ViewerGerencia'] },
        { id: 'materiales',  href: '#/materiales',  icon: '◫', label: 'Materiales',
          perfiles: ['Admin','MatCoord','Almacenero','QAQC','Planner','FieldEng','ViewerCliente','ViewerGerencia'] },
        { id: 'recepciones', href: '#/recepciones', icon: '↓', label: 'Recepciones',
          perfiles: ['Admin','MatCoord','Almacenero','QAQC'] },
      ]
    },
    {
      label: 'QAQC',
      items: [
        { id: 'ncr',    href: '#/ncr',    icon: '!', label: 'NCR',
          perfiles: ['Admin','MatCoord','QAQC'] },
        { id: 'series', href: '#/series', icon: '≡', label: 'Trazabilidad',
          perfiles: ['Admin','MatCoord','Almacenero','QAQC','Planner','FieldEng'] },
      ]
    },
    {
      label: 'Admin',
      items: [
        { id: 'admin', href: '#/admin', icon: '⚙', label: 'Administración',
          perfiles: ['Admin','MatCoord'] },
      ]
    },
  ];
  // Aplanar para compatibilidad con lógica existente
  const navItems = navGroups.flatMap(g => g.items);

  const navHtml = navGroups.map(group => {
    const visibles = group.items.filter(item => item.perfiles.includes(perfil));
    if (!visibles.length) return '';
    const items = visibles.map(item => `
      <a href="${item.href}" class="nav-item ${activeNav === item.id ? 'nav-active' : ''}">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
      </a>`).join('');
    return `<div class="nav-group">${group.label}</div>${items}`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
            <rect width="36" height="36" rx="9" fill="#1a4a7a"/>
            <rect x="8" y="16" width="6" height="12" rx="1.5" fill="#7dd3fc" opacity=".9"/>
            <rect x="15" y="11" width="6" height="17" rx="1.5" fill="#4a9fe0"/>
            <rect x="22" y="8" width="6" height="20" rx="1.5" fill="#93c5fd" opacity=".8"/>
          </svg>
          <div>
            <div class="logo-name">DMS Inventario</div>
            <div class="logo-ver">v2.0 · Etapa 2</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          ${navHtml}
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
  // ── Etapa 1 ───────────────────────────────────────────────
  Router.on('login',         Pages.login);
  Router.on('auth/callback', Pages.authCallback);
  Router.on('dashboard',     Pages.dashboard);
  Router.on('materiales',    Pages.materiales);
  Router.on('admin',         Pages.admin);

  // ── Etapa 2 ───────────────────────────────────────────────
  // Recepciones — rutas con sub-paths
  // El router no soporta :params dinámicos, se registran las variantes explícitamente
  // y se pasa el segmento como { id } al handler
  Router.on('recepciones',        Pages.recepciones);
  Router.on('recepciones/nueva',  (p) => Pages.recepciones({ ...p, id: 'nueva' }));

  // Para recepciones/:id dinámico el router no matchea — usamos hashchange manual
  // Ver _initRecepcionesDetalle() más abajo

  Router.on('ncr',           Pages.ncr);
  Router.on('series',        Pages.series);

  // Interceptar rutas dinámicas tipo recepciones/:id antes del 404
  // El router no soporta :params, se resuelve acá con el hash crudo
  Router.on('404', () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('recepciones/')) {
      const id = hash.replace('recepciones/', '').split('?')[0];
      if (id) { Pages.recepciones({ id }); return; }
    }
    if (hash.startsWith('ncr')) {
      const qs = hash.includes('?') ? hash.split('?')[1] : '';
      const params = {};
      if (qs) new URLSearchParams(qs).forEach((v,k) => { params[k] = v; });
      Pages.ncr(params); return;
    }
    document.getElementById('app').innerHTML = `
      <div class="full-center">
        <h2>Página no encontrada</h2>
        <a href="#/dashboard" class="btn btn-primary">Ir al inicio</a>
      </div>
    `;
  });

  Router.init();

  // Warm-up GAS cada 25 min para evitar cold start
  function gasWarmup() {
    if (!Auth.isAuthenticated()) return;
    fetch(window.APP_CONFIG?.GAS_URL || '', {
      method: 'POST',
      body: (() => {
        const f = new FormData();
        f.append('payload', JSON.stringify({ action: 'health' }));
        return f;
      })(),
      redirect: 'follow',
    }).catch(() => {});
  }
  setTimeout(() => {
    gasWarmup();
    setInterval(gasWarmup, 25 * 60 * 1000);
  }, 5 * 60 * 1000);
});
