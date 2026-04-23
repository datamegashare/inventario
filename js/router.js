// ============================================================
// router.js — Hash-based SPA router
// ============================================================

const Router = (() => {
  const routes = {};
  let currentRoute = null;

  function on(path, handler) { routes[path] = handler; }

  function navigate(path) {
    window.location.hash = '#/' + path.replace(/^#?\//, '');
  }

  function resolve() {
    // Leer el hash completo
    const fullHash = window.location.hash.replace(/^#\/?/, '') || '';

    // Separar path de query string
    const qIdx = fullHash.indexOf('?');
    const path  = qIdx === -1 ? fullHash : fullHash.substring(0, qIdx);
    const query = qIdx === -1 ? ''       : fullHash.substring(qIdx + 1);

    // Parsear params
    const params = {};
    if (query) {
      query.split('&').forEach(p => {
        const eIdx = p.indexOf('=');
        if (eIdx === -1) return;
        const k = decodeURIComponent(p.substring(0, eIdx));
        const v = decodeURIComponent(p.substring(eIdx + 1));
        params[k] = v;
      });
    }

    // Ruta por defecto
    const routePath = path || 'login';

    // Protección de rutas
    const publicRoutes = ['login', 'auth/callback'];
    if (!publicRoutes.includes(routePath) && !Auth.isLoggedIn()) {
      navigate('login');
      return;
    }
    if (routePath === 'login' && Auth.isLoggedIn()) {
      navigate('dashboard');
      return;
    }

    const handler = routes[routePath] || routes['404'];
    if (handler) {
      currentRoute = routePath;
      handler(params);
    }
  }

  function init() {
    window.addEventListener('hashchange', resolve);
    resolve();
  }

  return { on, navigate, resolve, init, current: () => currentRoute };
})();
