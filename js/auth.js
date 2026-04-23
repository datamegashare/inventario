// ============================================================
// auth.js — Manejo de sesión en el frontend
// USA sessionStorage en lugar de localStorage (compatible con GitHub Pages)
// ============================================================

const Auth = (() => {
  const TOKEN_KEY   = 'awp_token';
  const SESSION_KEY = 'awp_session';

  function getToken()   { return sessionStorage.getItem(TOKEN_KEY); }
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  function setSession(tokenData) {
    sessionStorage.setItem(TOKEN_KEY, tokenData.token);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      usuario_id: tokenData.usuario_id,
      email:      tokenData.email,
      nombre:     tokenData.nombre,
      perfil:     tokenData.perfil,
      expires_at: Date.now() + (tokenData.expires_in * 1000)
    }));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
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
