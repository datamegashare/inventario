// ============================================================
// AWP Inventory System — Google Apps Script Backend
// Etapa 1: Núcleo (CONFIG, USUARIOS, FAMILIAS, UBICACIONES, MATERIALES, HISTORIAL_CAMBIOS)
// Etapa 2: Recepción (RECEPCIONES, RECEPCIONES_ITEMS, MATERIAL_SERIES, STOCK, NCR,
//                     MOVIMIENTOS, NOTIFICACIONES_CONFIG)
// ============================================================

// ─── CONFIGURACIÓN GLOBAL ───────────────────────────────────
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const CLIENT_ID      = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
const CLIENT_SECRET  = PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET');

// Nombres de hojas
// ⚠ ETAPA 2: se agregan 7 claves nuevas al final. No se modifica nada de Etapa 1.
const SHEETS = {
  // ── Etapa 1 (no tocar) ──────────────────────────────────
  CONFIG:               'CONFIG',
  USUARIOS:             'USUARIOS',
  FAMILIAS:             'FAMILIAS',
  UBICACIONES:          'UBICACIONES',
  MATERIALES:           'MATERIALES',
  HISTORIAL_CAMBIOS:    'HISTORIAL_CAMBIOS',
  // ── Etapa 2 ─────────────────────────────────────────────
  RECEPCIONES:          'RECEPCIONES',
  RECEPCIONES_ITEMS:    'RECEPCIONES_ITEMS',
  MATERIAL_SERIES:      'MATERIAL_SERIES',
  STOCK:                'STOCK',
  NCR:                  'NCR',
  MOVIMIENTOS:          'MOVIMIENTOS',
  NOTIFICACIONES_CONFIG:'NOTIFICACIONES_CONFIG',
};

// ─── ENTRY POINTS ───────────────────────────────────────────

/**
 * GET: usado por GitHub Pages SPA para OAuth redirect y health check
 */
function doGet(e) {
  const action = e.parameter.action || '';

  if (action === 'health') {
    return jsonResponse({ status: 'ok', version: '2.0.0', etapa: 2 });
  }

  // OAuth callback
  if (action === 'oauth_callback') {
    return handleOAuthCallback(e);
  }

  // GET sin acción conocida — responder OK para no romper el flujo
  return jsonResponse({ status: 'ok' });
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
      body = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      body = {};
    }

    const action = body.action || '';
    const token  = (body.token || '').trim();

    // Rutas públicas (sin auth)
    if (action === 'auth_url')     return jsonResponse(getAuthUrl());
    if (action === 'auth_token')   return jsonResponse(exchangeCodeForToken(body.code));
    if (action === 'verify_token') return jsonResponse(verifyToken(token));

    // Verificar token para todas las demás rutas
    const usuario = requireAuth(token);
    if (usuario.error) return jsonResponse(usuario, 401);

    // Router
    switch (action) {

      // ── USUARIOS (Etapa 1) ───────────────────────────────
      case 'usuarios_list':    return jsonResponse(usuariosList(usuario));
      case 'usuarios_get':     return jsonResponse(usuariosGet(body.usuario_id, usuario));
      case 'usuarios_create':  return jsonResponse(usuariosCreate(body.data, usuario));
      case 'usuarios_update':  return jsonResponse(usuariosUpdate(body.usuario_id, body.data, usuario));
      case 'usuarios_delete':  return jsonResponse(usuariosDelete(body.usuario_id, usuario));

      // ── FAMILIAS (Etapa 1) ───────────────────────────────
      case 'familias_list':    return jsonResponse(familiasList(usuario));
      case 'familias_create':  return jsonResponse(familiasCreate(body.data, usuario));
      case 'familias_update':  return jsonResponse(familiasUpdate(body.familia_id, body.data, usuario));
      case 'familias_delete':  return jsonResponse(familiasDelete(body.familia_id, usuario));

      // ── UBICACIONES (Etapa 1) ────────────────────────────
      case 'ubicaciones_list':   return jsonResponse(ubicacionesList(usuario));
      case 'ubicaciones_create': return jsonResponse(ubicacionesCreate(body.data, usuario));
      case 'ubicaciones_update': return jsonResponse(ubicacionesUpdate(body.ubicacion_id, body.data, usuario));
      case 'ubicaciones_delete': return jsonResponse(ubicacionesDelete(body.ubicacion_id, usuario));

      // ── MATERIALES (Etapa 1) ─────────────────────────────
      case 'materiales_list':    return jsonResponse(materialesList(body.filters, usuario));
      case 'materiales_get':     return jsonResponse(materialesGet(body.material_id, usuario));
      case 'materiales_create':  return jsonResponse(materialesCreate(body.data, usuario));
      case 'materiales_update':  return jsonResponse(materialesUpdate(body.material_id, body.data, usuario));
      case 'materiales_delete':  return jsonResponse(materialesDelete(body.material_id, usuario));
      case 'materiales_import':  return jsonResponse(materialesImport(body.rows, usuario));

      // ── CONFIG (Etapa 1) ─────────────────────────────────
      case 'config_get':    return jsonResponse(configGet(usuario));
      case 'config_update': return jsonResponse(configUpdate(body.data, usuario));

      // ── HISTORIAL (Etapa 1) ──────────────────────────────
      case 'historial_list': return jsonResponse(historialList(body.filters, usuario));

      // ── RECEPCIONES (Etapa 2) ────────────────────────────
      case 'recepciones_list':        return jsonResponse(recepcionesList(body.filters, usuario));
      case 'recepciones_get':         return jsonResponse(recepcionesGet(body.recepcion_id, usuario));
      case 'recepciones_create':      return jsonResponse(recepcionesCreate(body.data, usuario));
      case 'recepciones_update':      return jsonResponse(recepcionesUpdate(body.recepcion_id, body.data, usuario));
      case 'recepciones_delete':      return jsonResponse(recepcionesDelete(body.recepcion_id, usuario));

      // ── RECEPCIONES_ITEMS (Etapa 2) ──────────────────────
      case 'items_list':              return jsonResponse(itemsList(body.recepcion_id, usuario));
      case 'items_create':            return jsonResponse(itemsCreate(body.recepcion_id, body.data, usuario));
      case 'items_update':            return jsonResponse(itemsUpdate(body.item_id, body.data, usuario));
      case 'items_aprobar':           return jsonResponse(itemsAprobar(body.item_id, usuario));
      case 'items_delete':            return jsonResponse(itemsDelete(body.item_id, usuario));

      // ── MATERIAL_SERIES (Etapa 2) ────────────────────────
      case 'series_list':             return jsonResponse(seriesList(body.filters, usuario));
      case 'series_get':              return jsonResponse(seriesGet(body.serie_id, usuario));

      // ── STOCK (Etapa 2) ──────────────────────────────────
      case 'stock_list':              return jsonResponse(stockList(body.filters, usuario));

      // ── NCR (Etapa 2) ────────────────────────────────────
      case 'ncr_list':                return jsonResponse(ncrList(body.filters, usuario));
      case 'ncr_get':                 return jsonResponse(ncrGet(body.ncr_id, usuario));
      case 'ncr_create':              return jsonResponse(ncrCreate(body.item_id, body.data, usuario));
      case 'ncr_update_estado':       return jsonResponse(ncrUpdateEstado(body.ncr_id, body.estado, body.observaciones, usuario));

      // ── MOVIMIENTOS (Etapa 2) ────────────────────────────
      case 'movimientos_list':        return jsonResponse(movimientosList(body.filters, usuario));

      // ── NOTIFICACIONES_CONFIG (Etapa 2) ──────────────────
      case 'notif_config_list':       return jsonResponse(notifConfigList(usuario));
      case 'notif_config_update':     return jsonResponse(notifConfigUpdate(body.notif_id, body.data, usuario));

      default:
        return jsonResponse({ error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (err) {
    Logger.log('doPost ERROR: ' + err.message + '\n' + err.stack);
    const isBusinessError = err.message && !err.message.includes('Cannot read') && !err.message.includes('undefined');
    if (isBusinessError) {
      return jsonResponse({ error: err.message }, 400);
    }
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

/**
 * Registra en MOVIMIENTOS (log operativo cronológico).
 * @param {string} tipo      - Tipo de evento: RECEPCION_ITEM, NCR_ABIERTA, STOCK_ACTUALIZADO, etc.
 * @param {string} materialId
 * @param {string} descripcion - Texto libre del evento
 * @param {string} usuarioEmail
 * @param {Object} meta      - Datos adicionales opcionales (recepcion_id, ncr_id, etc.)
 */
function registrarMovimiento(tipo, materialId, descripcion, usuarioEmail, meta) {
  const sheet = getSheet(SHEETS.MOVIMIENTOS);
  sheet.appendRow([
    generateId(),
    tipo,
    materialId || '',
    descripcion,
    usuarioEmail,
    now(),
    meta ? JSON.stringify(meta) : ''
  ]);
}

// ─── HELPERS DE AUTORIZACIÓN ────────────────────────────────
function requirePerfil(usuario, perfilesPermitidos) {
  if (!perfilesPermitidos.includes(usuario.perfil)) {
    throw new Error('Permiso denegado. Se requiere uno de: ' + perfilesPermitidos.join(', '));
  }
}
