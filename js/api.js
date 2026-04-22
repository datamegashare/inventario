// ============================================================
// api.js — Cliente centralizado para Google Apps Script API
// Usa FormData para evitar preflight CORS (GAS no soporta OPTIONS)
// ============================================================

const API = (() => {
  const GAS_URL = window.APP_CONFIG?.GAS_URL || '';

  async function request(action, body = {}) {
    const token = Auth.getToken();
    const payload = { action, token, ...body };

    // Enviamos como FormData con campo "payload" = JSON string.
    // Esto evita el preflight OPTIONS que GAS no puede responder.
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: formData
      // Sin Content-Type header — el browser lo setea como multipart/form-data
      // lo que califica como "simple request" y no dispara preflight
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    // Auth
    getAuthUrl:    ()          => request('auth_url'),
    exchangeToken: (code)      => request('auth_token', { code }),
    verifyToken:   ()          => request('verify_token'),

    // Usuarios
    usuarios: {
      list:   ()                       => request('usuarios_list'),
      get:    (id)                     => request('usuarios_get',    { usuario_id: id }),
      create: (data)                   => request('usuarios_create', { data }),
      update: (id, data)               => request('usuarios_update', { usuario_id: id, data }),
      delete: (id)                     => request('usuarios_delete', { usuario_id: id }),
    },

    // Familias
    familias: {
      list:   ()             => request('familias_list'),
      create: (data)         => request('familias_create', { data }),
      update: (id, data)     => request('familias_update', { familia_id: id, data }),
      delete: (id)           => request('familias_delete', { familia_id: id }),
    },

    // Ubicaciones
    ubicaciones: {
      list:   ()             => request('ubicaciones_list'),
      create: (data)         => request('ubicaciones_create', { data }),
      update: (id, data)     => request('ubicaciones_update', { ubicacion_id: id, data }),
      delete: (id)           => request('ubicaciones_delete', { ubicacion_id: id }),
    },

    // Materiales
    materiales: {
      list:    (filters)     => request('materiales_list',   { filters }),
      get:     (id)          => request('materiales_get',    { material_id: id }),
      create:  (data)        => request('materiales_create', { data }),
      update:  (id, data)    => request('materiales_update', { material_id: id, data }),
      delete:  (id)          => request('materiales_delete', { material_id: id }),
      import:  (rows)        => request('materiales_import', { rows }),
    },

    // Config
    config: {
      get:    ()             => request('config_get'),
      update: (data)         => request('config_update', { data }),
    },

    // Historial
    historial: {
      list: (filters)        => request('historial_list', { filters }),
    }
  };
})();
