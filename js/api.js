// ============================================================
//  api.js  — Inventario AWP  v3.0
//  Formato: POST FormData con campo "payload" = JSON string
//  Code.gs lee: body = JSON.parse(e.parameter.payload)
//
//  Contratos verificados contra todos los pages:
//  - login.js:        API.getAuthUrl(), API.exchangeToken(code)
//  - dashboard.js:    API.materiales.list({}), API.familias.list(), API.ubicaciones.list()
//  - materiales.js:   API.materiales.{list,get,create,update,delete,import}
//  - admin.js:        API.usuarios.*, API.familias.*, API.ubicaciones.*, API.config.*, API.historial.*
//  ── Etapa 2 ──────────────────────────────────────────────────
//  - recepciones.js:  API.recepciones.*, API.items.*
//  - ncr.js:          API.ncr.*
//  - series.js:       API.series.*, API.stock.*, API.movimientos.*
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

    let res = await fetch(GAS_URL, { method: 'POST', body: fd, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) {
      if (data.error.includes('Token inválido') || data.error.includes('inicie sesión')) {
        Auth.clearSession();
        Router.navigate('login');
      }
      throw new Error(data.detail || data.error);
    }
    return data;
  }

  // ── Auth ─────────────────────────────────────────────────────

  async function getAuthUrl() {
    const r = await _call('auth_url');
    if (r.authUrl) r.auth_url = r.authUrl;
    if (r.state) sessionStorage.setItem('oauth_state', r.state);
    return r;
  }

  async function exchangeToken(code) {
    const state = sessionStorage.getItem('oauth_state') || '';
    sessionStorage.removeItem('oauth_state');
    const r = await _call('auth_token', { code, state });
    if (r.sessionId && !r.token) {
      r.token      = r.sessionId;
      r.nombre     = r.user?.name  || r.user?.email || 'Usuario';
      r.perfil     = r.user?.role  || 'viewer';
      r.email      = r.user?.email || '';
      r.usuario_id = r.user?.email || '';
      r.expires_in = r.expiresAt
        ? Math.floor((r.expiresAt - Date.now()) / 1000)
        : 28800;
    }
    return r;
  }

  // ── Etapa 1 — namespaces sin cambios ─────────────────────────

  const materiales = {
    list:   (filters = {}) => _call('materiales_list',   { filters }),
    get:    id             => _call('materiales_get',    { material_id: id }),
    create: data           => _call('materiales_create', { data }),
    update: (id, data)     => _call('materiales_update', { material_id: id, data }),
    delete: id             => _call('materiales_delete', { material_id: id }),
    import: rows           => _call('materiales_import', { rows }),
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
    list: (filters = {}) => _call('historial_list', { filters }),
  };

  // ── Etapa 2 — namespaces nuevos ───────────────────────────────

  /** RECEPCIONES — cabecera del remito */
  const recepciones = {
    list:   (filters = {}) => _call('recepciones_list',   { filters }),
    get:    id             => _call('recepciones_get',    { recepcion_id: id }),
    create: data           => _call('recepciones_create', { data }),
    update: (id, data)     => _call('recepciones_update', { recepcion_id: id, data }),
    delete: id             => _call('recepciones_delete', { recepcion_id: id }),
  };

  /**
   * RECEPCIONES_ITEMS — líneas del remito
   * items.create envía series como array opcional: data.series = ['SN-001', ...]
   */
  const items = {
    list:    recepcion_id      => _call('items_list',    { recepcion_id }),
    create:  (recepcion_id, data) => _call('items_create', { recepcion_id, data }),
    update:  (id, data)        => _call('items_update',  { item_id: id, data }),
    aprobar: id                => _call('items_aprobar', { item_id: id }),
    delete:  id                => _call('items_delete',  { item_id: id }),
  };

  /** NCR — Non-Conformance Reports */
  const ncr = {
    list:         (filters = {})                    => _call('ncr_list',          { filters }),
    get:          id                                => _call('ncr_get',           { ncr_id: id }),
    create:       (item_id, data)                   => _call('ncr_create',        { item_id, data }),
    updateEstado: (id, estado, observaciones = '')  => _call('ncr_update_estado', { ncr_id: id, estado, observaciones }),
  };

  /** MATERIAL_SERIES — trazabilidad individual de seriales/tags */
  const series = {
    list: (filters = {}) => _call('series_list', { filters }),
    get:  id             => _call('series_get',  { serie_id: id }),
  };

  /** STOCK — disponible/reservado/bloqueado por material+ubicación */
  const stock = {
    list: (filters = {}) => _call('stock_list', { filters }),
  };

  /** MOVIMIENTOS — log operativo cronológico */
  const movimientos = {
    list: (filters = {}) => _call('movimientos_list', { filters }),
  };

  /** NOTIFICACIONES_CONFIG — configuración del motor de alertas */
  const notifConfig = {
    list:   ()         => _call('notif_config_list'),
    update: (id, data) => _call('notif_config_update', { notif_id: id, data }),
  };

  // ── Export ───────────────────────────────────────────────────
  return {
    // Auth
    getAuthUrl, exchangeToken,
    // Etapa 1
    materiales, familias, ubicaciones, usuarios, config, historial,
    // Etapa 2
    recepciones, items, ncr, series, stock, movimientos, notifConfig,
  };
})();
