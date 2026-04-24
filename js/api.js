// ============================================================
//  api.js  — Inventario AWP  v2.3  (revisión completa)
//  Formato: POST FormData con campo "payload" = JSON string
//  Code.gs lee: body = JSON.parse(e.parameter.payload)
//
//  Contratos verificados contra todos los pages:
//  - login.js:      API.getAuthUrl(), API.exchangeToken(code)
//  - dashboard.js:  API.materiales.list({}), API.familias.list(), API.ubicaciones.list()
//  - materiales.js: API.materiales.{list,create,update,delete,import}
//  - admin.js:      API.usuarios.*, API.familias.*, API.ubicaciones.*, API.config.*, API.historial.*
// ============================================================

const API = (() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkgO5RZpdVviZ-Y1hhbUMoNvqrB3uCO4KaHeJHP1K0wEUb6jBf0J_tRmpW4P7od5yz/exec';
  const PUBLIC  = ['auth_url', 'auth_token'];

  async function _call(action, params = {}) {
    const payload = { action, ...params };
    if (!PUBLIC.includes(action)) {
      const t = Auth.getToken();
      if (t) payload.token = t;
    }
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));

    // GAS Web App hace redirect 302 en POSTs — seguir el redirect manualmente
    // si usamos redirect:'follow', el browser convierte el POST en GET (HTTP spec)
    // La solución: hacer el POST, si hay redirect 302, hacer GET a la nueva URL
    let res = await fetch(GAS_URL, { method:'POST', body:fd, redirect:'manual' });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      const location = res.headers.get('location') || GAS_URL;
      res = await fetch(location, { method:'GET', redirect:'follow' });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) {
      if (data.error.includes('Token inválido') || data.error.includes('inicie sesión')) {
        Auth.clearSession();
        Router.navigate('login');
      }
      throw new Error(data.error);
    }
    return data;
  }

  // ── login.js: const { auth_url } = await API.getAuthUrl() ──
  async function getAuthUrl() {
    const r = await _call('auth_url');
    // Auth.gs v2 devuelve { authUrl, state } — normalizar a { auth_url }
    if (r.authUrl) r.auth_url = r.authUrl;
    // Guardar state para validación CSRF en exchangeToken
    if (r.state) sessionStorage.setItem('oauth_state', r.state);
    return r;
  }

  // ── login.js: const tokenData = await API.exchangeToken(params.code) ──
  // login.js luego hace Auth.setSession(tokenData)
  // Auth.setSession espera { token, nombre, perfil, email, expires_in }
  async function exchangeToken(code) {
    // Recuperar state guardado por getAuthUrl (si existe)
    const state = sessionStorage.getItem('oauth_state') || '';
    sessionStorage.removeItem('oauth_state');

    const r = await _call('auth_token', { code, state });

    // Auth.gs v2 devuelve { success, sessionId, user:{email,name,picture,role}, expiresAt }
    // Normalizar al formato que espera Auth.setSession y login.js
    if (r.sessionId && !r.token) {
      r.token      = r.sessionId;
      r.nombre     = r.user?.name  || r.user?.email || 'Usuario';
      r.perfil     = r.user?.role  || 'viewer';
      r.email      = r.user?.email || '';
      r.usuario_id = r.user?.email || '';
      // expires_in en segundos desde expiresAt timestamp
      r.expires_in = r.expiresAt
        ? Math.floor((r.expiresAt - Date.now()) / 1000)
        : 28800;
    }
    return r;
  }

  // ── Namespaces de dominio ────────────────────────────────────
  const materiales = {
    list:   (filters={}) => _call('materiales_list',   { filters }),
    get:    id           => _call('materiales_get',    { material_id: id }),
    create: data         => _call('materiales_create', { data }),
    update: (id, data)   => _call('materiales_update', { material_id: id, data }),
    delete: id           => _call('materiales_delete', { material_id: id }),
    import: rows         => _call('materiales_import', { rows }),
  };

  const familias = {
    list:   ()         => _call('familias_list'),
    create: data       => _call('familias_create', { data }),
    update: (id, data) => _call('familias_update', { familia_id: id, data }),
    delete: id         => _call('familias_delete', { familia_id: id }),
  };

  const ubicaciones = {
    list:   ()         => _call('ubicaciones_list'),
    create: data       => _call('ubicaciones_create', { data }),
    update: (id, data) => _call('ubicaciones_update', { ubicacion_id: id, data }),
    delete: id         => _call('ubicaciones_delete', { ubicacion_id: id }),
  };

  const usuarios = {
    list:   ()         => _call('usuarios_list'),
    get:    id         => _call('usuarios_get',    { usuario_id: id }),
    create: data       => _call('usuarios_create', { data }),
    update: (id, data) => _call('usuarios_update', { usuario_id: id, data }),
    delete: id         => _call('usuarios_delete', { usuario_id: id }),
  };

  const config = {
    get:    ()   => _call('config_get'),
    update: data => _call('config_update', { data }),
  };

  const historial = {
    list: (filters={}) => _call('historial_list', { filters }),
  };

  return { getAuthUrl, exchangeToken,
           materiales, familias, ubicaciones, usuarios, config, historial };
})();

