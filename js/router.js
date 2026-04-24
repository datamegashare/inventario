// ============================================================
//  router.js  — Inventario AWP  v2.0
//  Hash-based SPA router con soporte para OAuth callback.
//  
//  IMPORTANTE: Al cargar la app, PRIMERO verifica si la URL
//  contiene ?code= (callback de Google OAuth) y lo procesa
//  ANTES de cualquier navegación normal.
// ============================================================

const Router = (() => {
  const routes = {};
  let currentRoute = null;
  let _initialized = false;

  // ─────────────────────────────────────────────────────────────
  //  Registro de rutas
  // ─────────────────────────────────────────────────────────────
  function register(path, handler) {
    routes[path] = handler;
  }

  // ─────────────────────────────────────────────────────────────
  //  Navegación programática
  // ─────────────────────────────────────────────────────────────
  function navigate(path) {
    window.location.hash = '#' + path;
  }

  // ─────────────────────────────────────────────────────────────
  //  Inicialización
  //  Se llama una vez al arrancar la app.
  //  Orden de operaciones:
  //  1. Detectar si hay ?code= → OAuth callback → Auth.handleCallback()
  //  2. Si no hay callback, resolver ruta actual del hash
  // ─────────────────────────────────────────────────────────────
  async function init() {
    if (_initialized) return;
    _initialized = true;

    // ── 1. ¿Es un OAuth callback? ────────────────────────────
    // Google redirige a: https://datamegashare.github.io/inventario/?code=xxx&state=yyy
    // Los params vienen en window.location.search (antes del #)
    const searchParams = new URLSearchParams(window.location.search);
    const isOAuthCallback = searchParams.has('code') || searchParams.has('error');

    if (isOAuthCallback) {
      console.log('[Router] Detectado OAuth callback — procesando...');
      // Auth.handleCallback() limpia la URL y navega al destino correcto
      const handled = await Auth.handleCallback();
      if (handled) return; // El callback se encargó de la navegación
    }

    // ── 2. Escuchar cambios de hash ──────────────────────────
    window.addEventListener('hashchange', _resolveRoute);

    // ── 3. Resolver ruta inicial ─────────────────────────────
    await _resolveRoute();
  }

  // ─────────────────────────────────────────────────────────────
  //  Resolución de rutas
  // ─────────────────────────────────────────────────────────────
  async function _resolveRoute() {
    const path = _getCurrentPath();
    console.log('[Router] Navegando a:', path);

    // Ruta pública: /login
    if (path === '/login') {
      await _runHandler('/login');
      return;
    }

    // Todas las demás rutas requieren autenticación
    const authenticated = await Auth.requireAuth();
    if (!authenticated) return; // requireAuth() ya navegó a /login

    // Resolver ruta exacta o wildcard
    const handler = routes[path] || routes['*'];
    if (handler) {
      currentRoute = path;
      await handler(path);
    } else {
      console.warn('[Router] Ruta no encontrada:', path);
      navigate('/dashboard');
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
    if (!hash || hash === '#' || hash === '#/') return '/dashboard';
    
    // Eliminar query params del hash si los hubiera (ej: #/path?foo=bar)
    const path = hash.replace(/^#/, '').split('?')[0];
    return path.startsWith('/') ? path : '/' + path;
  }

  // ─────────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  return {
    register,
    navigate,
    init,
    get current() { return currentRoute; },
  };
})();
