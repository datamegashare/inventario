// ============================================================
//  auth.js  — Inventario AWP  v2.1
//  Maneja sesión en el frontend.
//  ► El callback de Google llega AQUÍ (GitHub Pages), no a GAS.
//  ► Usa localStorage para persistir la sesión entre F5 y tabs.
//  ► Expone métodos de compatibilidad: getPerfil, getNombre, clearSession
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'awp_inventory_session';
  const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Revalidar cada 5 min

  // ─────────────────────────────────────────────────────────────
  //  login()
  //  Pide la authUrl al backend y redirige al usuario a Google.
  // ─────────────────────────────────────────────────────────────
  async function login() {
    try {
      _showAuthLoading('Iniciando sesión con Google...');

      const result = await API.call('getAuthUrl');

      if (!result.success || !result.authUrl) {
        throw new Error(result.error || 'No se pudo obtener la URL de autenticación');
      }

      sessionStorage.setItem('oauth_state', result.state);
      window.location.href = result.authUrl;

    } catch (err) {
      _hideAuthLoading();
      console.error('[Auth] Error en login:', err);
      _showError('Error iniciando sesión: ' + err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  handleCallback()
  //  Procesa el ?code= que Google envía de vuelta al frontend.
  // ─────────────────────────────────────────────────────────────
  async function handleCallback() {
    const urlParams   = _getUrlParams();
    const code        = urlParams.get('code');
    const state       = urlParams.get('state');
    const error       = urlParams.get('error');

    if (!code && !error) return false;

    if (error) {
      console.warn('[Auth] Google retornó error OAuth:', error);
      _showError('Autenticación cancelada: ' + error);
      _cleanUrl();
      Router.navigate('login');
      return true;
    }

    // Validar state (CSRF)
    const savedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');

    if (!savedState || savedState !== state) {
      console.error('[Auth] State mismatch — posible ataque CSRF');
      _showError('Error de seguridad. Por favor intentá de nuevo.');
      _cleanUrl();
      Router.navigate('login');
      return true;
    }

    _showAuthLoading('Verificando credenciales...');

    try {
      const result = await API.call('exchangeToken', { code, state });

      if (!result.success) {
        throw new Error(result.error || 'Error intercambiando token');
      }

      _saveSession({
        sessionId: result.sessionId,
        user:      result.user,
        expiresAt: result.expiresAt,
        cachedAt:  Date.now(),
      });

      console.log('[Auth] Sesión iniciada para:', result.user.email);
      _cleanUrl();
      Router.navigate('dashboard');

    } catch (err) {
      console.error('[Auth] Error en exchangeToken:', err);
      _showError('Error completando autenticación: ' + err.message);
      _cleanUrl();
      Router.navigate('login');
    }

    _hideAuthLoading();
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  //  logout() / clearSession()
  // ─────────────────────────────────────────────────────────────
  async function logout() {
    const session = _loadSession();
    if (session?.sessionId) {
      try { await API.call('logout', { sessionId: session.sessionId }); }
      catch (e) { console.warn('[Auth] Error notificando logout:', e); }
    }
    clearSession();
    Router.navigate('login');
  }

  // clearSession: alias sincrónico que usa app.js en el botón de logout
  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('oauth_state');
  }

  // ─────────────────────────────────────────────────────────────
  //  isAuthenticated() / requireAuth()
  // ─────────────────────────────────────────────────────────────
  async function isAuthenticated() {
    const session = _loadSession();
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      clearSession();
      return false;
    }

    const needsRevalidation =
      (Date.now() - session.cachedAt) > SESSION_CHECK_INTERVAL_MS ||
      (session.expiresAt - Date.now()) < 30 * 60 * 1000;

    if (needsRevalidation) {
      try {
        const result = await API.call('validateSession', { sessionId: session.sessionId });
        if (!result.valid) {
          clearSession();
          return false;
        }
        _saveSession({ ...session, user: result.user, expiresAt: result.expiresAt, cachedAt: Date.now() });
      } catch (err) {
        console.warn('[Auth] No se pudo revalidar, usando sesión local:', err.message);
      }
    }

    return true;
  }

  async function requireAuth() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      Router.navigate('login');
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  //  Getters de datos de usuario
  //  Métodos que usa app.js: getPerfil(), getNombre()
  //  Métodos nuevos: getCurrentUser(), getSessionId()
  // ─────────────────────────────────────────────────────────────
  function getCurrentUser() {
    return _loadSession()?.user || null;
  }

  function getSessionId() {
    return _loadSession()?.sessionId || null;
  }

  // Compatibilidad con app.js
  function getPerfil() {
    return _loadSession()?.user?.role || 'viewer';
  }

  function getNombre() {
    const user = _loadSession()?.user;
    return user?.name || user?.email || 'Usuario';
  }

  // ─────────────────────────────────────────────────────────────
  //  HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────────
  function _saveSession(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Auth] localStorage no disponible, usando sessionStorage');
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  function _loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _getUrlParams() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('code') || searchParams.get('error')) return searchParams;
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx !== -1) return new URLSearchParams(hash.substring(qIdx + 1));
    return searchParams;
  }

  function _cleanUrl() {
    const clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  }

  function _showAuthLoading(message) {
    let overlay = document.getElementById('_auth_overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '_auth_overlay';
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(15,23,42,0.85);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;backdrop-filter:blur(4px);
      `;
      overlay.innerHTML = `
        <div style="text-align:center;color:#fff;font-family:system-ui">
          <div style="width:40px;height:40px;border:3px solid #4f46e5;border-top-color:transparent;
                      border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
          <p id="_auth_overlay_msg" style="font-size:14px;opacity:0.9">${message}</p>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(overlay);
    }
    const el = document.getElementById('_auth_overlay_msg');
    if (el) el.textContent = message;
  }

  function _hideAuthLoading() {
    document.getElementById('_auth_overlay')?.remove();
  }

  function _showError(msg) {
    if (typeof Notifications !== 'undefined' && Notifications.error) {
      Notifications.error(msg);
    } else {
      alert(msg);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  return {
    login,
    handleCallback,
    logout,
    clearSession,       // app.js: Auth.clearSession()
    isAuthenticated,
    requireAuth,
    getCurrentUser,
    getSessionId,
    getPerfil,          // app.js: Auth.getPerfil()
    getNombre,          // app.js: Auth.getNombre()
  };
})();
