// ============================================================
//  auth.js  — Inventario AWP  v2.0
//  Maneja sesión en el frontend.
//  ► El callback de Google llega AQUÍ (GitHub Pages), no a GAS.
//  ► Usa localStorage para persistir la sesión entre F5 y tabs.
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'awp_inventory_session';
  const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Revalidar cada 5 min

  // ─── Estructura de sesión en localStorage ───────────────────
  // {
  //   sessionId: string,
  //   user: { email, name, picture, role },
  //   expiresAt: number (timestamp ms),
  //   cachedAt: number (timestamp ms),
  // }

  // ─────────────────────────────────────────────────────────────
  //  MÉTODOS PÚBLICOS
  // ─────────────────────────────────────────────────────────────

  /**
   * Inicia el flujo OAuth.
   * Pide la authUrl al backend y redirige al usuario a Google.
   */
  async function login() {
    try {
      _showAuthLoading('Iniciando sesión con Google...');
      
      const result = await API.call('getAuthUrl');
      
      if (!result.success || !result.authUrl) {
        throw new Error(result.error || 'No se pudo obtener la URL de autenticación');
      }
      
      // Guardar state en sessionStorage (solo para la duración del flujo OAuth)
      sessionStorage.setItem('oauth_state', result.state);
      
      // Redirigir a Google — Google redirigirá de vuelta a GitHub Pages con ?code=&state=
      window.location.href = result.authUrl;
      
    } catch (err) {
      _hideAuthLoading();
      console.error('[Auth] Error en login:', err);
      _showError('Error iniciando sesión: ' + err.message);
    }
  }

  /**
   * Procesa el callback OAuth cuando Google redirige de vuelta al frontend.
   * Lee ?code= y ?state= de la URL actual y los intercambia por una sesión.
   * 
   * @returns {Promise<boolean>} true si el callback fue procesado exitosamente
   */
  async function handleCallback() {
    // Leer parámetros de la URL (pueden venir como ?params o #/path?params)
    const urlParams = _getUrlParams();
    const code  = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    // Si no hay code ni error, no es un callback OAuth — no hacer nada
    if (!code && !error) return false;
    
    if (error) {
      console.warn('[Auth] Google retornó error OAuth:', error);
      _showError('Autenticación cancelada: ' + error);
      // Limpiar URL y mostrar login
      _cleanUrl();
      Router.navigate('/login');
      return true; // Fue un callback, aunque fallido
    }
    
    // Validar state (CSRF)
    const savedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');
    
    if (!savedState || savedState !== state) {
      console.error('[Auth] State mismatch — posible ataque CSRF');
      _showError('Error de seguridad en autenticación. Por favor intentá de nuevo.');
      _cleanUrl();
      Router.navigate('/login');
      return true;
    }
    
    // Mostrar loading mientras intercambiamos el code
    _showAuthLoading('Verificando credenciales...');
    
    try {
      const result = await API.call('exchangeToken', { code, state });
      
      if (!result.success) {
        throw new Error(result.error || 'Error intercambiando token');
      }
      
      // Guardar sesión en localStorage
      _saveSession({
        sessionId: result.sessionId,
        user:      result.user,
        expiresAt: result.expiresAt,
        cachedAt:  Date.now(),
      });
      
      console.log('[Auth] Sesión iniciada para:', result.user.email);
      
      // Limpiar la URL (eliminar ?code=&state= para que no queden visibles)
      _cleanUrl();
      
      // Navegar al dashboard
      Router.navigate('/dashboard');
      
    } catch (err) {
      console.error('[Auth] Error en exchangeToken:', err);
      _showError('Error completando autenticación: ' + err.message);
      _cleanUrl();
      Router.navigate('/login');
    }
    
    _hideAuthLoading();
    return true;
  }

  /**
   * Cierra la sesión del usuario.
   */
  async function logout() {
    const session = _loadSession();
    
    if (session?.sessionId) {
      // Notificar al backend (best effort — no bloquear si falla)
      try {
        await API.call('logout', { sessionId: session.sessionId });
      } catch (e) {
        console.warn('[Auth] Error notificando logout al backend:', e);
      }
    }
    
    _clearSession();
    Router.navigate('/login');
  }

  /**
   * Verifica si hay una sesión activa y válida.
   * 1. Chequea localStorage
   * 2. Si está próxima a expirar o pasó el intervalo de revalidación, valida con el backend
   * 
   * @returns {Promise<boolean>}
   */
  async function isAuthenticated() {
    const session = _loadSession();
    
    if (!session) return false;
    
    // Verificar expiración local
    if (Date.now() > session.expiresAt) {
      console.log('[Auth] Sesión expirada localmente');
      _clearSession();
      return false;
    }
    
    // Revalidar con el backend si pasó el intervalo o faltan menos de 30 min para expirar
    const needsRevalidation = 
      (Date.now() - session.cachedAt) > SESSION_CHECK_INTERVAL_MS ||
      (session.expiresAt - Date.now()) < 30 * 60 * 1000;
    
    if (needsRevalidation) {
      try {
        const result = await API.call('validateSession', { sessionId: session.sessionId });
        
        if (!result.valid) {
          console.log('[Auth] Sesión invalidada por el servidor:', result.reason);
          _clearSession();
          return false;
        }
        
        // Refrescar datos de sesión locales
        _saveSession({
          ...session,
          user:      result.user,
          expiresAt: result.expiresAt,
          cachedAt:  Date.now(),
        });
        
      } catch (err) {
        // Si el backend no responde, confiar en la sesión local (offline tolerance)
        console.warn('[Auth] No se pudo revalidar con el servidor, usando sesión local:', err.message);
      }
    }
    
    return true;
  }

  /**
   * Retorna el usuario actual desde localStorage (sin validar con el backend).
   * @returns {object|null} { email, name, picture, role } o null
   */
  function getCurrentUser() {
    const session = _loadSession();
    return session?.user || null;
  }

  /**
   * Retorna el sessionId actual.
   * @returns {string|null}
   */
  function getSessionId() {
    const session = _loadSession();
    return session?.sessionId || null;
  }

  /**
   * Punto de entrada del router — llamar en cada navegación protegida.
   * Si no hay sesión, redirige a /login.
   * 
   * @returns {Promise<boolean>} true si está autenticado
   */
  async function requireAuth() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      Router.navigate('/login');
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  //  HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────────

  function _saveSession(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Fallback a sessionStorage si localStorage no está disponible (modo incógnito)
      console.warn('[Auth] localStorage no disponible, usando sessionStorage:', e.message);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  function _loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) 
               || sessionStorage.getItem(STORAGE_KEY); // fallback
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('oauth_state');
  }

  /**
   * Lee los query params de la URL actual, sea ?code= o #/path?code=
   */
  function _getUrlParams() {
    // La URL puede ser:
    //   https://datamegashare.github.io/inventario/?code=xxx&state=yyy
    //   https://datamegashare.github.io/inventario/#/...?code=xxx&state=yyy
    
    // Intentar primero en search (params antes del hash)
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('code') || searchParams.get('error')) {
      return searchParams;
    }
    
    // Si el router usa hash, los params pueden estar después del hash
    const hash = window.location.hash;
    const hashQueryIndex = hash.indexOf('?');
    if (hashQueryIndex !== -1) {
      return new URLSearchParams(hash.substring(hashQueryIndex + 1));
    }
    
    return searchParams; // vacío
  }

  /**
   * Limpia los query params OAuth de la URL sin recargar la página.
   * Deja la URL limpia: https://datamegashare.github.io/inventario/
   */
  function _cleanUrl() {
    const cleanUrl = window.location.protocol + '//' + 
                     window.location.host + 
                     window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function _showAuthLoading(message) {
    // Intentar mostrar en el UI si existe el elemento, sino usar overlay genérico
    const el = document.getElementById('auth-loading-message');
    if (el) {
      el.textContent = message;
      el.closest('#auth-loading')?.classList.remove('hidden');
      return;
    }
    
    // Overlay genérico
    let overlay = document.getElementById('_auth_overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '_auth_overlay';
      overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,0.85);
        display:flex; align-items:center; justify-content:center;
        z-index:9999; backdrop-filter:blur(4px);
      `;
      overlay.innerHTML = `
        <div style="text-align:center; color:#fff; font-family:system-ui">
          <div style="width:40px;height:40px;border:3px solid #4f46e5;border-top-color:transparent;
                      border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px">
          </div>
          <p id="_auth_overlay_msg" style="font-size:14px;opacity:0.9">${message}</p>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(overlay);
    }
    
    const msgEl = document.getElementById('_auth_overlay_msg');
    if (msgEl) msgEl.textContent = message;
  }

  function _hideAuthLoading() {
    document.getElementById('auth-loading')?.classList.add('hidden');
    document.getElementById('_auth_overlay')?.remove();
  }

  function _showError(message) {
    // Intentar usar el sistema de notificaciones de la app si existe
    if (typeof Notifications !== 'undefined' && Notifications.error) {
      Notifications.error(message);
      return;
    }
    // Fallback
    console.error('[Auth]', message);
    alert(message);
  }

  // ─────────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  return {
    login,
    handleCallback,
    logout,
    isAuthenticated,
    getCurrentUser,
    getSessionId,
    requireAuth,
  };
})();
