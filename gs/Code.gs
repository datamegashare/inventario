// ============================================================
// AWP Inventory System — Google Apps Script Backend
// Etapa 1: Núcleo (CONFIG, USUARIOS, FAMILIAS, UBICACIONES, MATERIALES, HISTORIAL_CAMBIOS)
// ============================================================

// ─── CONFIGURACIÓN GLOBAL ───────────────────────────────────
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const CLIENT_ID      = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
const CLIENT_SECRET  = PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET');

// Nombres de hojas
const SHEETS = {
  CONFIG:           'CONFIG',
  USUARIOS:         'USUARIOS',
  FAMILIAS:         'FAMILIAS',
  UBICACIONES:      'UBICACIONES',
  MATERIALES:       'MATERIALES',
  HISTORIAL_CAMBIOS:'HISTORIAL_CAMBIOS'
};

// ─── ENTRY POINTS ───────────────────────────────────────────

/**
 * GET: usado por GitHub Pages SPA para OAuth redirect y health check
 */
function doGet(e) {
  const action = e.parameter.action || '';

  if (action === 'health') {
    return jsonResponse({ status: 'ok', version: '1.0.0', etapa: 1 });
  }

  // OAuth callback
  if (action === 'oauth_callback') {
    return handleOAuthCallback(e);
  }

  return jsonResponse({ error: 'Invalid GET action' }, 400);
}

/**
 * POST: router principal de la API REST
 * Acepta tanto JSON directo como FormData con campo "payload"
 * (FormData evita el preflight CORS en navegadores)
 */
function doPost(e) {
  try {
    // ── Leer body: FormData (desde el frontend) o JSON directo ──
    let body;
    if (e.parameter && e.parameter.payload) {
      // Frontend envía FormData con campo "payload" = JSON string
      body = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      // Fallback: JSON directo (ej: pruebas desde curl / Postman)
      body = JSON.parse(e.postData.contents);
    } else {
      body = {};
    }

    const action = body.action || '';
    const token  = (body.token || '').trim();

    // Rutas públicas (sin auth)
    if (action === 'auth_url')     return jsonResponse(getAuthUrl());
    if (action === 'auth_token')   return jsonResponse(exchangeToken(body.code, body.state));
    if (action === 'verify_token') return jsonResponse(validateSession(token));

    // Verificar token para todas las demás rutas
    const authResult = validateSession(token);
    if (!authResult.valid) return jsonResponse({ error: authResult.reason || 'Token inválido o expirado. Por favor inicie sesión nuevamente.' }, 401);
    const usuario = { ...authResult.user, perfil: authResult.user.role, nombre: authResult.user.name };

    // Router
    switch (action) {
      // ── USUARIOS ──
      case 'usuarios_list':    return jsonResponse(usuariosList(usuario));
      case 'usuarios_get':     return jsonResponse(usuariosGet(body.usuario_id, usuario));
      case 'usuarios_create':  return jsonResponse(usuariosCreate(body.data, usuario));
      case 'usuarios_update':  return jsonResponse(usuariosUpdate(body.usuario_id, body.data, usuario));
      case 'usuarios_delete':  return jsonResponse(usuariosDelete(body.usuario_id, usuario));

      // ── FAMILIAS ──
      case 'familias_list':    return jsonResponse(familiasList(usuario));
      case 'familias_create':  return jsonResponse(familiasCreate(body.data, usuario));
      case 'familias_update':  return jsonResponse(familiasUpdate(body.familia_id, body.data, usuario));
      case 'familias_delete':  return jsonResponse(familiasDelete(body.familia_id, usuario));

      // ── UBICACIONES ──
      case 'ubicaciones_list':   return jsonResponse(ubicacionesList(usuario));
      case 'ubicaciones_create': return jsonResponse(ubicacionesCreate(body.data, usuario));
      case 'ubicaciones_update': return jsonResponse(ubicacionesUpdate(body.ubicacion_id, body.data, usuario));
      case 'ubicaciones_delete': return jsonResponse(ubicacionesDelete(body.ubicacion_id, usuario));

      // ── MATERIALES ──
      case 'materiales_list':    return jsonResponse(materialesList(body.filters, usuario));
      case 'materiales_get':     return jsonResponse(materialesGet(body.material_id, usuario));
      case 'materiales_create':  return jsonResponse(materialesCreate(body.data, usuario));
      case 'materiales_update':  return jsonResponse(materialesUpdate(body.material_id, body.data, usuario));
      case 'materiales_delete':  return jsonResponse(materialesDelete(body.material_id, usuario));
      case 'materiales_import':  return jsonResponse(materialesImport(body.rows, usuario));

      // ── CONFIG ──
      case 'config_get':    return jsonResponse(configGet(usuario));
      case 'config_update': return jsonResponse(configUpdate(body.data, usuario));

      // ── HISTORIAL ──
      case 'historial_list': return jsonResponse(historialList(body.filters, usuario));

      default:
        return jsonResponse({ error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (err) {
    Logger.log('doPost ERROR: ' + err.message + '\n' + err.stack);
    return jsonResponse({ error: 'Error interno del servidor', detail: err.message }, 500);
  }
}

// ─── HELPERS ────────────────────────────────────────────────

function jsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(name);
}

/** Genera un ID único tipo UUID v4 simplificado */
function generateId() {
  return Utilities.getUuid();
}

function now() {
  return new Date().toISOString();
}

/** Convierte filas de hoja a array de objetos usando la primera fila como headers */
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/** Agrega una fila al final de una hoja */
function appendRow(sheet, headers, obj) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

/** Actualiza una fila por índice (1-based, considerando header) */
function updateRow(sheet, rowIndex, headers, obj) {
  const range = sheet.getRange(rowIndex + 1, 1, 1, headers.length);
  const row   = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  range.setValues([row]);
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/** Registra en HISTORIAL_CAMBIOS */
function registrarHistorial(tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_email) {
  const sheet = getSheet(SHEETS.HISTORIAL_CAMBIOS);
  sheet.appendRow([
    generateId(),
    tabla,
    registro_id,
    campo,
    String(valor_anterior),
    String(valor_nuevo),
    usuario_email,
    now()
  ]);
}

/** Registra múltiples cambios de un update */
function registrarCambios(tabla, registro_id, dataNueva, dataAnterior, usuario_email) {
  Object.keys(dataNueva).forEach(campo => {
    const va = dataAnterior ? dataAnterior[campo] : '';
    const vn = dataNueva[campo];
    if (String(va) !== String(vn)) {
      registrarHistorial(tabla, registro_id, campo, va, vn, usuario_email);
    }
  });
}

// ─── HELPERS DE AUTORIZACIÓN ────────────────────────────────
// (Movidos aquí desde Auth.gs para compatibilidad con Usuarios.gs, Materiales.gs, etc.)

function requirePerfil(usuario, perfilesPermitidos) {
  if (!perfilesPermitidos.includes(usuario.perfil)) {
    throw new Error('Permiso denegado. Se requiere uno de: ' + perfilesPermitidos.join(', '));
  }
}
