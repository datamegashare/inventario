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
    const hash = window.location.hash.replace('#/', '') || 'dashboard';
    const [path, ...queryParts] = hash.split('?');
    const params = {};
    if (queryParts.length) {
      queryParts.join('?').split('&').forEach(p => {
        const [k, v] = p.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }

    // Protección de rutas
    const publicRoutes = ['login', 'auth/callback'];
    if (!publicRoutes.includes(path) && !Auth.isLoggedIn()) {
      navigate('login');
      return;
    }
    if (path === 'login' && Auth.isLoggedIn()) {
      navigate('dashboard');
      return;
    }

    const handler = routes[path] || routes['404'];
    if (handler) {
      currentRoute = path;
      handler(params);
    }
  }

  function init() {
    window.addEventListener('hashchange', resolve);
    resolve();
  }

  return { on, navigate, resolve, init, current: () => currentRoute };
})();
