// ============================================================
//  auth.js  — Inventario AWP  v2.2
//  ► OAuth callback llega al frontend (GitHub Pages), no a GAS
//  ► localStorage para persistir sesión entre F5 y tabs
//  ► Compatible con todos los pages: can(), getSession(), setSession(),
//    getToken(), getPerfil(), getNombre(), clearSession()
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'awp_inventory_session';

  // Permisos por perfil
  const PERMISOS = {
    Admin:           ['materiales.read','materiales.create','materiales.update','materiales.delete',
                      'familias.read','familias.create','familias.update','familias.delete',
                      'ubicaciones.read','ubicaciones.create','ubicaciones.update','ubicaciones.delete',
                      'usuarios.read','usuarios.create','usuarios.update','usuarios.delete'],
    MatCoord:        ['materiales.read','materiales.create','materiales.update',
                      'familias.read','familias.create','familias.update',
                      'ubicaciones.read','ubicaciones.create','ubicaciones.update'],
    Almacenero:      ['materiales.read'],
    QAQC:            ['materiales.read'],
    Planner:         ['materiales.read'],
    FieldEng:        ['materiales.read'],
    ViewerCliente:   ['materiales.read'],
    ViewerGerencia:  ['materiales.read'],
  };

  // ─────────────────────────────────────────────────────────────
  //  Sesión — read/write
  // ─────────────────────────────────────────────────────────────

  function _loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _saveSession(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  // setSession: llamado por login.js después de exchangeToken
  // tokenData tiene forma: { token, nombre, perfil, email, usuario_id, expires_in }
  function setSession(tokenData) {
    _saveSession({
      token:      tokenData.token,
      usuario_id: tokenData.usuario_id,
      email:      tokenData.email,
      nombre:     tokenData.nombre,
      perfil:     tokenData.perfil,
      expiresAt:  Date.now() + ((tokenData.expires_in || 28800) * 1000),
    });
  }

  // getSession: usado por admin.js para comparar usuario_id
  function getSession() {
    return _loadSession();
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('oauth_state');
  }

  // getToken: usado por api.js para inyectar el token en cada request
  function getToken() {
    return _loadSession()?.token || null;
  }

  // ─────────────────────────────────────────────────────────────
  //  Datos del usuario
  // ─────────────────────────────────────────────────────────────

  function getPerfil() {
    return _loadSession()?.perfil || 'viewer';
  }

  function getNombre() {
    const s = _loadSession();
    return s?.nombre || s?.email || 'Usuario';
  }

  function getCurrentUser() {
    return _loadSession();
  }

  // ─────────────────────────────────────────────────────────────
  //  Permisos
  //  Usado en materiales.js y admin.js: Auth.can('materiales.create')
  // ─────────────────────────────────────────────────────────────

  function can(permiso) {
    const perfil = getPerfil();
    const perms  = PERMISOS[perfil] || [];
    return perms.includes(permiso);
  }

  // ─────────────────────────────────────────────────────────────
  //  Autenticación
  // ─────────────────────────────────────────────────────────────

  function isAuthenticated() {
    const session = _loadSession();
    if (!session || !session.token) return false;
    if (Date.now() > session.expiresAt) {
      clearSession();
      return false;
    }
    return true;
  }

  // requireAuth: llamado por router.js en cada ruta protegida
  async function requireAuth() {
    if (!isAuthenticated()) {
      Router.navigate('login');
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  //  OAuth callback
  //  Llamado por router.js cuando detecta ?code= en la URL.
  //  NOTA: login.js tiene su propio flujo con startLogin() que
  //  llama API.getAuthUrl() y luego Pages.authCallback() procesa
  //  el code. handleCallback() es el handler alternativo para
  //  cuando el router detecta el callback antes de cargar las páginas.
  // ─────────────────────────────────────────────────────────────

  async function handleCallback() {
    const searchParams = new URLSearchParams(window.location.search);
    const code  = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (!code && !error) return false;

    // Limpiar URL antes de procesar
    const clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);

    if (error) {
      // Navegar a login con el error
      window.location.hash = '#/login?error=' + encodeURIComponent(error);
      return true;
    }

    if (code) {
      // Navegar a la ruta authCallback del router (la maneja Pages.authCallback)
      window.location.hash = '#/auth/callback?code=' + encodeURIComponent(code);
      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────────────────────────
  //  API pública
  // ─────────────────────────────────────────────────────────────
  return {
    // Sesión
    setSession,       // login.js: Auth.setSession(tokenData)
    getSession,       // admin.js: Auth.getSession()
    clearSession,     // app.js: Auth.clearSession()
    getToken,         // api.js: Auth.getToken()

    // Info usuario
    getPerfil,        // app.js, dashboard.js, admin.js
    getNombre,        // app.js, dashboard.js
    getCurrentUser,

    // Permisos
    can,              // materiales.js, admin.js: Auth.can('permiso')

    // Auth flow
    isAuthenticated,
    requireAuth,
    handleCallback,   // router.js
  };
})();
