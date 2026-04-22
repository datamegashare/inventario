// ============================================================
// auth.js — Manejo de sesión en el frontend
// ============================================================

const Auth = (() => {
  const TOKEN_KEY   = 'awp_token';
  const SESSION_KEY = 'awp_session';

  function getToken()   { return localStorage.getItem(TOKEN_KEY); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  function setSession(tokenData) {
    localStorage.setItem(TOKEN_KEY, tokenData.token);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      usuario_id: tokenData.usuario_id,
      email:      tokenData.email,
      nombre:     tokenData.nombre,
      perfil:     tokenData.perfil,
      expires_at: Date.now() + (tokenData.expires_in * 1000)
    }));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    const session = getSession();
    if (!session) return false;
    if (Date.now() > session.expires_at) { clearSession(); return false; }
    return true;
  }

  function getPerfil() { return getSession()?.perfil || null; }
  function getNombre() { return getSession()?.nombre || ''; }
  function getEmail()  { return getSession()?.email || ''; }

  /** Verifica permisos */
  function can(action) {
    const perfil = getPerfil();
    if (!perfil) return false;
    const perms = {
      Admin:         ['*'],
      MatCoord:      ['materiales.*', 'familias.*', 'ubicaciones.*', 'usuarios.read'],
      Almacenero:    ['materiales.read', 'materiales.create'],
      QAQC:          ['materiales.read'],
      Planner:       ['materiales.read'],
      FieldEng:      ['materiales.read'],
      ViewerCliente: ['materiales.read'],
      ViewerGerencia:['materiales.read']
    };
    const allowed = perms[perfil] || [];
    return allowed.includes('*') || allowed.includes(action) ||
           allowed.some(p => p.endsWith('.*') && action.startsWith(p.replace('.*', '.')));
  }

  return { getToken, getSession, setSession, clearSession, isLoggedIn, getPerfil, getNombre, getEmail, can };
})();
