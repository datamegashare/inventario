// ============================================================
//  router.js  — Inventario AWP  v2.1
//  Hash-based SPA router con soporte para OAuth callback.
//  Compatible con app.js: expone Router.on() además de Router.register()
// ============================================================

const Router = (() => {
  const routes = {};
  let currentRoute = null;
  let _initialized = false;

  // ─── Registro de rutas ──────────────────────────────────────
  // Acepta rutas con o sin slash: 'dashboard' y '/dashboard' son lo mismo
  function register(path, handler) {
    const normalized = _normalize(path);
    routes[normalized] = handler;
  }

  // Alias compatible con la versión anterior (app.js usa Router.on)
  function on(path, handler) {
    register(path, handler);
  }

  // ─── Navegación programática ────────────────────────────────
  function navigate(path) {
    const normalized = _normalize(path);
    window.location.hash = '#/' + normalized.replace(/^\//, '');
  }

  // ─── Inicialización ─────────────────────────────────────────
  async function init() {
    if (_initialized) return;
    _initialized = true;

    // 1. ¿Es un OAuth callback? (Google redirige con ?code= en la URL)
    const searchParams = new URLSearchParams(window.location.search);
    const isOAuthCallback = searchParams.has('code') || searchParams.has('error');

    if (isOAuthCallback) {
      console.log('[Router] Detectado OAuth callback — procesando...');
      const handled = await Auth.handleCallback();
      if (handled) return;
    }

    // 2. Escuchar cambios de hash
    window.addEventListener('hashchange', _resolveRoute);

    // 3. Resolver ruta inicial
    await _resolveRoute();
  }

  // ─── Resolución de rutas ────────────────────────────────────
  async function _resolveRoute() {
    const path = _getCurrentPath();
    console.log('[Router] Navegando a:', path);

    // Rutas públicas
    if (path === 'login' || path === 'auth/callback') {
      await _runHandler(path);
      return;
    }

    // Rutas protegidas
    const authenticated = await Auth.requireAuth();
    if (!authenticated) return;

    const handler = routes[path] || routes['404'];
    if (handler) {
      currentRoute = path;
      await handler(path);
    } else {
      const fallback = routes['404'];
      if (fallback) fallback(path);
      else navigate('dashboard');
    }
  }

  async function _runHandler(path) {
    const handler = routes[path];
    if (handler) {
      currentRoute = path;
      await handler(path);
    }
  }

  function _getCurrentPath() {
    const hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/') return 'dashboard';
    // Eliminar #/ del inicio y query params del final
    return hash.replace(/^#\/?/, '').split('?')[0];
  }

  function _normalize(path) {
    return path.replace(/^\//, ''); // quitar slash inicial si existe
  }

  // ─── API pública ────────────────────────────────────────────
  return {
    on,           // app.js usa Router.on()
    register,     // alias moderno
    navigate,
    init,
    get current() { return currentRoute; },
  };
})();
