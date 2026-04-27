// ============================================================
//  auth.js  — Inventario AWP  v2.3  (revisión completa)
//  Responsabilidades:
//  - Guardar/leer sesión en localStorage
//  - Exponer exactamente lo que usan app.js, pages/*.js
//  - handleCallback: solo redirige, Pages.authCallback hace el exchange
// ============================================================

const Auth = (() => {
  const KEY = 'awp_inv_session';

  // Permisos por perfil — igual que el sistema original
  const PERMS = {
    Admin: [
      'materiales.read','materiales.create','materiales.update','materiales.delete',
      'familias.read','familias.create','familias.update','familias.delete',
      'ubicaciones.read','ubicaciones.create','ubicaciones.update','ubicaciones.delete',
      'usuarios.read','usuarios.create','usuarios.update','usuarios.delete',
      // Etapa 2
      'recepciones.read','recepciones.create','recepciones.update','recepciones.delete',
      'items.create','items.update','items.aprobar','items.delete',
      'ncr.read','ncr.create','ncr.update',
      'series.read','stock.read','movimientos.read',
    ],
    MatCoord: [
      'materiales.read','materiales.create','materiales.update',
      'familias.read','familias.create','familias.update',
      'ubicaciones.read','ubicaciones.create','ubicaciones.update',
      // Etapa 2
      'recepciones.read','recepciones.create',
      'items.create','items.aprobar',
      'ncr.read','ncr.update',
      'series.read','stock.read','movimientos.read',
    ],
    Almacenero: [
      'materiales.read',
      // Etapa 2
      'recepciones.read','recepciones.create',
      'items.create','items.update','items.delete',
      'ncr.read',
      'series.read','stock.read','movimientos.read',
    ],
    QAQC: [
      'materiales.read',
      // Etapa 2
      'recepciones.read',
      'items.aprobar',
      'ncr.read','ncr.create','ncr.update',
      'series.read','stock.read','movimientos.read',
    ],
    Planner:        ['materiales.read','series.read','stock.read','movimientos.read'],
    FieldEng:       ['materiales.read','series.read','stock.read','movimientos.read'],
    ViewerCliente:  ['materiales.read','recepciones.read','series.read','stock.read'],
    ViewerGerencia: ['materiales.read','recepciones.read','series.read','stock.read','movimientos.read'],
  };

  // ─── Storage ────────────────────────────────────────────────
  function _save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch(e) { sessionStorage.setItem(KEY, JSON.stringify(data)); }
  }
  function _load() {
    try {
      const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ─── Sesión pública ─────────────────────────────────────────

  // login.js: Auth.setSession(tokenData)
  // tokenData viene de API.exchangeToken → ya normalizado a { token, nombre, perfil, email }
  function setSession(tokenData) {
    _save({
      token:      tokenData.token,
      usuario_id: tokenData.usuario_id || '',
      email:      tokenData.email      || '',
      nombre:     tokenData.nombre     || tokenData.email || 'Usuario',
      perfil:     tokenData.perfil     || 'viewer',
      expiresAt:  Date.now() + ((tokenData.expires_in || 28800) * 1000),
    });
  }

  // admin.js: Auth.getSession()?.usuario_id
  function getSession() { return _load(); }

  // app.js: Auth.clearSession()
  function clearSession() {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  }

  // api.js: Auth.getToken()
  function getToken() { return _load()?.token || null; }

  // app.js, dashboard.js, admin.js: Auth.getPerfil()
  function getPerfil() { return _load()?.perfil || 'viewer'; }

  // app.js, dashboard.js: Auth.getNombre()
  function getNombre() { return _load()?.nombre || 'Usuario'; }

  // materiales.js, admin.js: Auth.can('permiso')
  function can(permiso) {
    return (PERMS[getPerfil()] || []).includes(permiso);
  }

  // ─── Autenticación ──────────────────────────────────────────

  function isAuthenticated() {
    const s = _load();
    if (!s?.token) return false;
    if (Date.now() > s.expiresAt) { clearSession(); return false; }
    return true;
  }

  async function requireAuth() {
    if (!isAuthenticated()) { Router.navigate('login'); return false; }
    return true;
  }

  // ─── OAuth callback ─────────────────────────────────────────
  // Llamado por router.js cuando detecta ?code= ANTES de setear el hash.
  // En v2.3 el router ya convierte los ?params al hash directamente,
  // así que este método ya no se usa — se mantiene por compatibilidad.
  async function handleCallback() {
    return false; // router.js v2.3 lo maneja internamente
  }

  return {
    setSession, getSession, clearSession, getToken,
    getPerfil, getNombre, can,
    isAuthenticated, requireAuth,
    handleCallback,
  };
})();
