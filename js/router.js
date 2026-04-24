// ============================================================
//  router.js  — Inventario AWP  v2.3  (revisión completa)
//  - Router.on() compatible con app.js
//  - Pasa objeto params { code, tab, error, ... } a cada handler
//  - Detecta ?code= en URL para OAuth callback
// ============================================================

const Router = (() => {
  const routes   = {};
  let currentRoute = null;
  let _initialized = false;

  function on(path, handler)       { routes[_norm(path)] = handler; }
  function register(path, handler) { routes[_norm(path)] = handler; }

  function navigate(path) {
    window.location.hash = '#/' + _norm(path);
  }

  // ─── init ───────────────────────────────────────────────────
  async function init() {
    if (_initialized) return;
    _initialized = true;

    // ¿Google redirigió con ?code= en la query string (antes del #)?
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('code') || searchParams.has('error')) {
      console.log('[Router] Detectado OAuth callback — procesando...');
      // Mover los params al hash para que el router los pueda leer
      // y limpiar la query string fea de la URL
      const code  = searchParams.get('code')  || '';
      const state = searchParams.get('state') || '';
      const error = searchParams.get('error') || '';
      const clean = window.location.protocol + '//' +
                    window.location.host +
                    window.location.pathname;
      // Reemplazar URL limpia + mover params al hash
      const hashParams = error
        ? `#/auth/callback?error=${encodeURIComponent(error)}`
        : `#/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
      window.history.replaceState({}, document.title, clean + hashParams);
      // Caer al resolver normal — el hash ahora tiene la ruta correcta
    }

    window.addEventListener('hashchange', _resolveRoute);
    await _resolveRoute();
  }

  // ─── resolver ───────────────────────────────────────────────
  async function _resolveRoute() {
    const { path, params } = _parseHash();
    console.log('[Router] Navegando a:', path, params);

    // Rutas públicas
    if (path === 'login' || path === 'auth/callback') {
      await _run(path, params);
      return;
    }

    // Rutas protegidas
    const ok = await Auth.requireAuth();
    if (!ok) return;

    const handler = routes[path] || routes['404'];
    if (handler) {
      currentRoute = path;
      await handler(params);
    } else {
      navigate('dashboard');
    }
  }

  async function _run(path, params) {
    const handler = routes[path];
    if (handler) { currentRoute = path; await handler(params); }
  }

  // Parsea window.location.hash en { path, params }
  // Ej: "#/admin?tab=usuarios" → { path:"admin", params:{tab:"usuarios"} }
  function _parseHash() {
    const hash  = window.location.hash || '';
    const clean = hash.replace(/^#\/?/, '');          // quitar #/
    const qIdx  = clean.indexOf('?');
    const path   = qIdx === -1 ? clean : clean.slice(0, qIdx);
    const qs     = qIdx === -1 ? '' : clean.slice(qIdx + 1);
    const params = {};
    if (qs) {
      new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
    }
    return { path: path || 'dashboard', params };
  }

  function _norm(path) { return path.replace(/^\//, ''); }

  return { on, register, navigate, init,
           get current() { return currentRoute; } };
})();
