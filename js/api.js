// ============================================================
//  api.js  — Inventario AWP  v2.3
//  Formato de envío compatible con Code.gs:
//  POST FormData con campo "payload" = JSON.stringify({ action, token, ...params })
//  Code.gs lee: body = JSON.parse(e.parameter.payload)
// ============================================================

const API = (() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkgO5RZpdVviZ-Y1hhbUMoNvqrB3uCO4KaHeJHP1K0wEUb6jBf0J_tRmpW4P7od5yz/exec';

  const PUBLIC_ACTIONS = ['auth_url', 'auth_token', 'verify_token'];

  // ─────────────────────────────────────────────────────────────
  //  _call(action, params)
  //  Envía FormData con campo "payload" = JSON string.
  //  Code.gs: body = JSON.parse(e.parameter.payload)
  // ─────────────────────────────────────────────────────────────
  async function _call(action, params = {}) {
    const payload = { action, ...params };

    // Inyectar token en acciones protegidas
    if (!PUBLIC_ACTIONS.includes(action)) {
      const token = Auth.getToken();
      if (token) payload.token = token;
    }

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    const response = await fetch(GAS_URL, {
      method:   'POST',
      body:     formData,
      redirect: 'follow',
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Sesión expirada → logout automático
    if (data.error && (
      data.error.includes('Token inválido') ||
      data.error.includes('inicie sesión')
    )) {
      Auth.clearSession();
      Router.navigate('login');
      throw new Error(data.error);
    }

    if (data.error) throw new Error(data.error);
    return data;
  }

  // ─────────────────────────────────────────────────────────────
  //  API pública usada por login.js
  // ─────────────────────────────────────────────────────────────
  async function getAuthUrl() {
    return _call('auth_url');
  }

  async function exchangeToken(code) {
    return _call('auth_token', { code });
  }

  // ─────────────────────────────────────────────────────────────
  //  Namespaces de dominio
  // ─────────────────────────────────────────────────────────────
  const materiales = {
    list:   (filters = {}) => _call('materiales_list',   { filters }),
    get:    (id)           => _call('materiales_get',    { material_id: id }),
    create: (data)         => _call('materiales_create', { data }),
    update: (id, data)     => _call('materiales_update', { material_id: id, data }),
    delete: (id)           => _call('materiales_delete', { material_id: id }),
    import: (rows)         => _call('materiales_import', { rows }),
  };

  const familias = {
    list:   ()         => _call('familias_list'),
    create: (data)     => _call('familias_create', { data }),
    update: (id, data) => _call('familias_update', { familia_id: id, data }),
    delete: (id)       => _call('familias_delete', { familia_id: id }),
  };

  const ubicaciones = {
    list:   ()         => _call('ubicaciones_list'),
    create: (data)     => _call('ubicaciones_create', { data }),
    update: (id, data) => _call('ubicaciones_update', { ubicacion_id: id, data }),
    delete: (id)       => _call('ubicaciones_delete', { ubicacion_id: id }),
  };

  const usuarios = {
    list:   ()         => _call('usuarios_list'),
    get:    (id)       => _call('usuarios_get',    { usuario_id: id }),
    create: (data)     => _call('usuarios_create', { data }),
    update: (id, data) => _call('usuarios_update', { usuario_id: id, data }),
    delete: (id)       => _call('usuarios_delete', { usuario_id: id }),
  };

  const config = {
    get:    ()     => _call('config_get'),
    update: (data) => _call('config_update', { data }),
  };

  const historial = {
    list: (filters = {}) => _call('historial_list', { filters }),
  };

  function call(action, params = {}) {
    return _call(action, params);
  }

  return {
    call,
    getAuthUrl,
    exchangeToken,
    materiales,
    familias,
    ubicaciones,
    usuarios,
    config,
    historial,
  };
})();
