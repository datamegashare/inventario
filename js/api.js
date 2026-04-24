// ============================================================
//  api.js  — Inventario AWP  v2.2
//  Cliente HTTP para GAS Web App.
//  Expone la API que usan login.js, dashboard.js, materiales.js, admin.js
// ============================================================

const API = (() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkgO5RZpdVviZ-Y1hhbUMoNvqrB3uCO4KaHeJHP1K0wEUb6jBf0J_tRmpW4P7od5yz/exec';

  // ─────────────────────────────────────────────────────────────
  //  _call(action, params) — interno
  //  Envía FormData con { action, ...params, token } al GAS.
  //  El backend lee e.parameter.action y e.parameter.* directamente.
  // ─────────────────────────────────────────────────────────────
  async function _call(action, params = {}) {
    const PUBLIC_ACTIONS = ['auth_url', 'auth_token'];

    const formData = new FormData();
    formData.append('action', action);

    // Inyectar token en acciones protegidas
    if (!PUBLIC_ACTIONS.includes(action)) {
      const token = Auth.getToken();
      if (token) formData.append('token', token);
    }

    // Serializar params
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

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
  //  login.js llama: API.getAuthUrl() y API.exchangeToken(code)
  // ─────────────────────────────────────────────────────────────
  async function getAuthUrl() {
    // El backend (Code.gs) tiene action='auth_url' → devuelve { auth_url }
    return _call('auth_url');
  }

  async function exchangeToken(code) {
    // El backend tiene action='auth_token', code=... → devuelve { token, nombre, perfil, ... }
    return _call('auth_token', { code });
  }

  // ─────────────────────────────────────────────────────────────
  //  Namespaces usados por dashboard.js, materiales.js, admin.js
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

  // ─────────────────────────────────────────────────────────────
  //  call() — método genérico (por si algún código lo usa)
  // ─────────────────────────────────────────────────────────────
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
