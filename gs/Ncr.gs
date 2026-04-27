// ============================================================
// Ncr.gs — Etapa 2
// Cubre: NCR (Non-Conformance Report)
//
// Flujo de estados NCR:
//   ABIERTA → EN_REVISION → CERRADA_ACEPTADA | CERRADA_RECHAZADA
//
// Efectos sobre el ítem (RECEPCIONES_ITEMS.estado_qaqc):
//   ncrCreate        → ítem pasa a NCR
//   ncrUpdateEstado  → al cerrar:
//     CERRADA_ACEPTADA  → ítem pasa a ACEPTADO
//                         stock += cantidad (disponible)
//                         series → EN_ALMACEN
//     CERRADA_RECHAZADA → ítem pasa a RECHAZADO_DEFINITIVO
//                         stock += cantidad (bloqueada temporalmente → se libera a 0)
//                         series → SEGREGADO (quedan físicamente separadas)
//
// Efectos sobre STOCK al abrir NCR:
//   cantidad_disponible sin cambio (aún no había sido liberada — ítem estaba PENDIENTE_QAQC)
//   cantidad_bloqueada += cantidad_recibida
//
// Efectos sobre MATERIAL_SERIES al abrir NCR:
//   estado → NCR  (bloqueadas individualmente)
//   ubicacion_id → ubicación tipo SEGREGADO más cercana (o la del ítem)
// ============================================================

// ─── NCR — LISTA ────────────────────────────────────────────

/**
 * Lista NCRs. Soporta filtros: estado, material_id, recepcion_id.
 * QAQC y MatCoord ven todas. ViewerCliente solo ve owner-furnished.
 */
function ncrList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'ViewerCliente', 'ViewerGerencia']);

  const sheet = getSheet(SHEETS.NCR);
  let rows = sheetToObjects(sheet).filter(r => !r.borrado);

  if (filters) {
    if (filters.estado)       rows = rows.filter(r => r.estado === filters.estado);
    if (filters.material_id)  rows = rows.filter(r => r.material_id === filters.material_id);
    if (filters.recepcion_id) {
      // Filtrar por recepcion_id requiere cruzar con el ítem
      const itemSheet = getSheet(SHEETS.RECEPCIONES_ITEMS);
      const items = sheetToObjects(itemSheet)
        .filter(i => i.recepcion_id === filters.recepcion_id)
        .map(i => i.item_id);
      rows = rows.filter(r => items.includes(r.item_id));
    }
    if (filters.solo_abiertas) {
      rows = rows.filter(r => !r.estado.startsWith('CERRADA'));
    }
  }

  // ViewerCliente solo ve materiales owner-furnished
  if (currentUser.perfil === 'ViewerCliente') {
    const matSheet = getSheet(SHEETS.MATERIALES);
    const mats = sheetToObjects(matSheet)
      .filter(m => m.ownership === 'owner-furnished')
      .map(m => m.material_id);
    rows = rows.filter(r => mats.includes(r.material_id));
  }

  rows.sort((a, b) => (b.creado_en > a.creado_en ? 1 : -1));
  return rows;
}

// ─── NCR — GET ───────────────────────────────────────────────

function ncrGet(ncr_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'ViewerCliente', 'ViewerGerencia']);
  if (!ncr_id) throw new Error('ncr_id requerido');

  const sheet = getSheet(SHEETS.NCR);
  const ncr   = sheetToObjects(sheet).find(r => r.ncr_id === ncr_id && !r.borrado);
  if (!ncr) throw new Error('NCR no encontrada');

  return ncr;
}

// ─── NCR — CREAR ────────────────────────────────────────────

/**
 * QAQC rechaza un ítem y abre una NCR.
 * El ítem debe estar en PENDIENTE_QAQC.
 * Genera ID correlativo NCR-YYYY-NNNN.
 * Bloquea stock y mueve series a estado NCR.
 * Dispara notificación NCR_NUEVA si está activa.
 */
function ncrCreate(item_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'QAQC']);

  if (!item_id)         throw new Error('item_id requerido');
  if (!data.descripcion) throw new Error('descripcion requerida');

  // Verificar ítem
  const { sheet: itemSheet, item, rowIndex: itemRowIndex } = _findItem(item_id);
  if (item.estado_qaqc !== 'PENDIENTE_QAQC') {
    throw new Error(`Solo se puede abrir NCR sobre un ítem en PENDIENTE_QAQC. Estado actual: ${item.estado_qaqc}`);
  }

  // Verificar que el ítem no tenga ya una NCR activa
  const ncrSheet   = getSheet(SHEETS.NCR);
  const ncrsActivas = sheetToObjects(ncrSheet)
    .filter(r => r.item_id === item_id && !r.borrado && !r.estado.startsWith('CERRADA'));
  if (ncrsActivas.length > 0) {
    throw new Error('El ítem ya tiene una NCR activa: ' + ncrsActivas[0].ncr_id);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ncr_id = _generarNroNcr(sheetToObjects(ncrSheet).filter(r => !r.borrado));

    // Buscar ubicación SEGREGADO para mover las series
    const ubicSegregado = _getUbicacionSegregado();

    const ncr = {
      ncr_id,
      item_id,
      serie_id:       data.serie_id    || '',   // opcional: NCR sobre serie específica
      material_id:    item.material_id,
      descripcion:    data.descripcion,
      estado:         'ABIERTA',
      creado_por:     currentUser.email,
      asignado_a:     data.asignado_a  || '',
      resolucion:     '',
      borrado:        false,
      borrado_por:    '',
      borrado_fecha:  '',
      creado_en:      now(),
      actualizado_en: now(),
    };

    appendRow(ncrSheet, NCR_HEADERS, ncr);

    // Actualizar ítem → estado NCR + referenciar ncr_id
    item.estado_qaqc    = 'NCR';
    item.ncr_id         = ncr_id;
    item.actualizado_en = now();
    updateRow(itemSheet, itemRowIndex, RECEPCIONES_ITEMS_HEADERS, item);
    registrarHistorial('RECEPCIONES_ITEMS', item_id, 'estado_qaqc', 'PENDIENTE_QAQC', 'NCR', currentUser.email);

    // Mover series a estado NCR y ubicación SEGREGADO
    _actualizarSeriesNcr(item_id, ncr_id, ubicSegregado, currentUser.email);

    // Bloquear stock: mover la cantidad del disponible al bloqueado
    // (si qaqc=true el disponible era 0, así que bloqueado += cantidad)
    _actualizarStock(item.material_id, item.ubicacion_id, 0, 0, Number(item.cantidad_recibida));

    registrarMovimiento(
      'NCR_ABIERTA',
      item.material_id,
      `NCR abierta: ${ncr_id} — ${data.descripcion}`,
      currentUser.email,
      { ncr_id, item_id, recepcion_id: item.recepcion_id }
    );

    // Disparar notificación NCR_NUEVA
    _notificar('NCR_NUEVA', {
      ncr_id,
      material:    item.material_id,
      descripcion: data.descripcion,
    }, currentUser.email);

    return ncr;

  } finally {
    lock.releaseLock();
  }
}

// ─── NCR — CAMBIO DE ESTADO ──────────────────────────────────

/**
 * Avanza el estado de una NCR.
 * Transiciones permitidas:
 *   ABIERTA      → EN_REVISION
 *   EN_REVISION  → CERRADA_ACEPTADA | CERRADA_RECHAZADA
 *
 * Al cerrar:
 *   CERRADA_ACEPTADA  → ítem = ACEPTADO, stock bloqueado → disponible, series → EN_ALMACEN
 *   CERRADA_RECHAZADA → ítem = RECHAZADO_DEFINITIVO, stock bloqueado → 0, series → SEGREGADO
 */
function ncrUpdateEstado(ncr_id, nuevoEstado, observaciones, currentUser) {
  requirePerfil(currentUser, ['Admin', 'QAQC', 'MatCoord']);

  if (!ncr_id)      throw new Error('ncr_id requerido');
  if (!nuevoEstado) throw new Error('estado requerido');

  const sheet   = getSheet(SHEETS.NCR);
  const rows    = sheetToObjects(sheet);
  const headers = getHeaders(sheet);
  const idx     = rows.findIndex(r => r.ncr_id === ncr_id && !r.borrado);
  if (idx === -1) throw new Error('NCR no encontrada');

  const ncr = rows[idx];
  _validarTransicionNcr(ncr.estado, nuevoEstado);

  const estadoAnterior = ncr.estado;
  ncr.estado          = nuevoEstado;
  ncr.resolucion      = observaciones || ncr.resolucion;
  ncr.actualizado_en  = now();

  updateRow(sheet, idx + 1, headers, ncr);
  registrarHistorial('NCR', ncr_id, 'estado', estadoAnterior, nuevoEstado, currentUser.email);

  // Efectos al cerrar
  if (nuevoEstado === 'CERRADA_ACEPTADA') {
    _cerrarNcrAceptada(ncr, currentUser);
  } else if (nuevoEstado === 'CERRADA_RECHAZADA') {
    _cerrarNcrRechazada(ncr, currentUser);
  }

  registrarMovimiento(
    'NCR_' + nuevoEstado,
    ncr.material_id,
    `NCR ${ncr_id} → ${nuevoEstado}`,
    currentUser.email,
    { ncr_id, item_id: ncr.item_id }
  );

  return ncr;
}

// ─── HELPERS INTERNOS ────────────────────────────────────────

/** Genera NCR-YYYY-NNNN correlativo */
function _generarNroNcr(existentes) {
  const year   = new Date().getFullYear();
  const prefix = `NCR-${year}-`;
  const nums   = existentes
    .filter(r => r.ncr_id && r.ncr_id.startsWith(prefix))
    .map(r => parseInt(r.ncr_id.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return prefix + String(siguiente).padStart(4, '0');
}

/** Valida que la transición de estado sea permitida */
function _validarTransicionNcr(estadoActual, nuevoEstado) {
  const transiciones = {
    'ABIERTA':     ['EN_REVISION'],
    'EN_REVISION': ['CERRADA_ACEPTADA', 'CERRADA_RECHAZADA'],
  };
  const permitidos = transiciones[estadoActual] || [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new Error(
      `Transición no permitida: ${estadoActual} → ${nuevoEstado}. ` +
      `Desde ${estadoActual} se puede ir a: ${permitidos.join(', ') || 'ningún estado (ya cerrada)'}`
    );
  }
}

/**
 * Mueve las series del ítem al estado NCR y las reubica en SEGREGADO.
 * Si la NCR es sobre una serie específica (ncr.serie_id), solo mueve esa.
 */
function _actualizarSeriesNcr(recepcion_item_id, ncr_id, ubicSegregadoId, usuarioEmail) {
  const sheet   = getSheet(SHEETS.MATERIAL_SERIES);
  const rows    = sheetToObjects(sheet);
  const headers = getHeaders(sheet);

  rows.forEach((row, idx) => {
    if (row.recepcion_item_id === recepcion_item_id && !row.borrado) {
      row.estado          = 'NCR';
      row.ncr_id          = ncr_id;
      row.ubicacion_id    = ubicSegregadoId || row.ubicacion_id;
      row.actualizado_en  = now();
      updateRow(sheet, idx + 1, headers, row);
    }
  });
}

/** Busca la primera ubicación tipo SEGREGADO disponible */
function _getUbicacionSegregado() {
  const sheet = getSheet(SHEETS.UBICACIONES);
  const seg   = sheetToObjects(sheet).find(r => r.tipo === 'SEGREGADO' && !r.borrado);
  return seg ? seg.ubicacion_id : null;
}

/**
 * Cierre ACEPTADA:
 *   - Ítem → ACEPTADO
 *   - Stock: bloqueado → disponible (la cantidad vuelve a circular)
 *   - Series → EN_ALMACEN
 */
function _cerrarNcrAceptada(ncr, currentUser) {
  const { sheet: itemSheet, item, rowIndex } = _findItem(ncr.item_id);

  const cantidad = Number(item.cantidad_recibida);

  // Stock: liberar del bloqueado al disponible
  _actualizarStock(item.material_id, item.ubicacion_id, cantidad, 0, -cantidad);

  // Series → EN_ALMACEN (vuelven a su ubicación original)
  _actualizarEstadoSeries(ncr.item_id, 'EN_ALMACEN', currentUser.email);

  // Ítem → ACEPTADO
  item.estado_qaqc    = 'ACEPTADO';
  item.actualizado_en = now();
  updateRow(itemSheet, rowIndex, RECEPCIONES_ITEMS_HEADERS, item);
  registrarHistorial('RECEPCIONES_ITEMS', ncr.item_id, 'estado_qaqc', 'NCR', 'ACEPTADO', currentUser.email);

  // Verificar cierre automático de la recepción
  _verificarCierreRecepcion(item.recepcion_id, currentUser.email);
}

/**
 * Cierre RECHAZADA:
 *   - Ítem → RECHAZADO_DEFINITIVO
 *   - Stock: bloqueado → 0 (material dado de baja o devuelto al proveedor)
 *   - Series → SEGREGADO (quedan físicamente separadas, no vuelven al stock)
 */
function _cerrarNcrRechazada(ncr, currentUser) {
  const { sheet: itemSheet, item, rowIndex } = _findItem(ncr.item_id);

  const cantidad = Number(item.cantidad_recibida);

  // Stock: eliminar del bloqueado (la cantidad sale del sistema)
  _actualizarStock(item.material_id, item.ubicacion_id, 0, 0, -cantidad);

  // Series → SEGREGADO permanente
  _actualizarEstadoSeries(ncr.item_id, 'SEGREGADO', currentUser.email);

  // Ítem → RECHAZADO_DEFINITIVO
  item.estado_qaqc    = 'RECHAZADO_DEFINITIVO';
  item.actualizado_en = now();
  updateRow(itemSheet, rowIndex, RECEPCIONES_ITEMS_HEADERS, item);
  registrarHistorial('RECEPCIONES_ITEMS', ncr.item_id, 'estado_qaqc', 'NCR', 'RECHAZADO_DEFINITIVO', currentUser.email);

  registrarMovimiento(
    'MATERIAL_DADO_DE_BAJA',
    item.material_id,
    `Material rechazado definitivamente por NCR ${ncr.ncr_id}`,
    currentUser.email,
    { ncr_id: ncr.ncr_id, item_id: ncr.item_id, cantidad }
  );

  // Verificar cierre automático de la recepción
  _verificarCierreRecepcion(item.recepcion_id, currentUser.email);
}

// ─── SERIES — CONSULTA ───────────────────────────────────────

/**
 * Lista series. Soporta filtros: material_id, estado, numero_serie (búsqueda parcial).
 */
function seriesList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'Planner', 'FieldEng', 'ViewerCliente', 'ViewerGerencia']);

  const sheet = getSheet(SHEETS.MATERIAL_SERIES);
  let rows = sheetToObjects(sheet).filter(r => !r.borrado);

  if (filters) {
    if (filters.material_id)   rows = rows.filter(r => r.material_id  === filters.material_id);
    if (filters.estado)        rows = rows.filter(r => r.estado        === filters.estado);
    if (filters.ubicacion_id)  rows = rows.filter(r => r.ubicacion_id  === filters.ubicacion_id);
    if (filters.ncr_id)        rows = rows.filter(r => r.ncr_id        === filters.ncr_id);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter(r => (r.numero_serie || '').toLowerCase().includes(q) ||
                               (r.codigo_barras || '').toLowerCase().includes(q));
    }
  }

  // ViewerCliente solo ve series de materiales owner-furnished
  if (currentUser.perfil === 'ViewerCliente') {
    const matSheet = getSheet(SHEETS.MATERIALES);
    const mats = sheetToObjects(matSheet)
      .filter(m => m.ownership === 'owner-furnished')
      .map(m => m.material_id);
    rows = rows.filter(r => mats.includes(r.material_id));
  }

  return rows;
}

function seriesGet(serie_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'Planner', 'FieldEng']);
  if (!serie_id) throw new Error('serie_id requerido');
  const sheet = getSheet(SHEETS.MATERIAL_SERIES);
  const serie = sheetToObjects(sheet).find(r => r.serie_id === serie_id && !r.borrado);
  if (!serie) throw new Error('Serie no encontrada');
  return serie;
}

// ─── STOCK — CONSULTA ────────────────────────────────────────

/**
 * Lista stock. Soporta filtros: material_id, ubicacion_id, solo_con_stock.
 */
function stockList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'Planner', 'FieldEng', 'ViewerCliente', 'ViewerGerencia']);

  const sheet = getSheet(SHEETS.STOCK);
  let rows = sheetToObjects(sheet);

  if (filters) {
    if (filters.material_id)  rows = rows.filter(r => r.material_id  === filters.material_id);
    if (filters.ubicacion_id) rows = rows.filter(r => r.ubicacion_id === filters.ubicacion_id);
    if (filters.solo_con_stock) {
      rows = rows.filter(r =>
        Number(r.cantidad_disponible) > 0 ||
        Number(r.cantidad_reservada)  > 0 ||
        Number(r.cantidad_bloqueada)  > 0
      );
    }
  }

  // ViewerCliente solo ve materiales owner-furnished
  if (currentUser.perfil === 'ViewerCliente') {
    const matSheet = getSheet(SHEETS.MATERIALES);
    const mats = sheetToObjects(matSheet)
      .filter(m => m.ownership === 'owner-furnished')
      .map(m => m.material_id);
    rows = rows.filter(r => mats.includes(r.material_id));
  }

  return rows;
}

// ─── MOVIMIENTOS — CONSULTA ──────────────────────────────────

/**
 * Lista movimientos ordenados por timestamp descendente.
 * Soporta filtros: material_id, tipo, fecha_desde, fecha_hasta.
 */
function movimientosList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC', 'Planner', 'FieldEng', 'ViewerCliente', 'ViewerGerencia']);

  const sheet = getSheet(SHEETS.MOVIMIENTOS);
  let rows = sheetToObjects(sheet);

  if (filters) {
    if (filters.material_id) rows = rows.filter(r => r.material_id === filters.material_id);
    if (filters.tipo)        rows = rows.filter(r => r.tipo        === filters.tipo);
    if (filters.fecha_desde) rows = rows.filter(r => r.timestamp   >= filters.fecha_desde);
    if (filters.fecha_hasta) rows = rows.filter(r => r.timestamp   <= filters.fecha_hasta);
  }

  rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return rows;
}

// ─── NOTIFICACIONES CONFIG — CONSULTA Y UPDATE ───────────────

function notifConfigList(currentUser) {
  requirePerfil(currentUser, ['Admin']);
  const sheet = getSheet(SHEETS.NOTIFICACIONES_CONFIG);
  return sheetToObjects(sheet).filter(r => !r.borrado);
}

function notifConfigUpdate(notif_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin']);
  if (!notif_id) throw new Error('notif_id requerido');

  const sheet   = getSheet(SHEETS.NOTIFICACIONES_CONFIG);
  const rows    = sheetToObjects(sheet);
  const headers = getHeaders(sheet);
  const idx     = rows.findIndex(r => r.notif_id === notif_id && !r.borrado);
  if (idx === -1) throw new Error('Configuración de notificación no encontrada');

  const campos = ['activo', 'perfiles_destino', 'emails_adicionales', 'asunto_template', 'frecuencia'];
  campos.forEach(c => { if (data[c] !== undefined) rows[idx][c] = data[c]; });
  updateRow(sheet, idx + 1, headers, rows[idx]);

  return rows[idx];
}

// ─── MOTOR DE NOTIFICACIONES ─────────────────────────────────

/**
 * Consulta NOTIFICACIONES_CONFIG y envía email si el evento está activo.
 * Variables soportadas en asunto_template: {ncr_id}, {material}, {descripcion}
 * Destinatarios: perfiles_destino (busca emails en USUARIOS) + emails_adicionales
 *                + supervisor_email del usuario que disparó el evento
 */
function _notificar(evento, vars, usuarioEmailOrigen) {
  try {
    const configSheet = getSheet(SHEETS.NOTIFICACIONES_CONFIG);
    const config = sheetToObjects(configSheet).find(r => r.evento === evento && !r.borrado);
    if (!config || !config.activo) return;  // evento no configurado o desactivado

    // Resolver destinatarios por perfil
    const usuariosSheet = getSheet(SHEETS.USUARIOS);
    const usuarios = sheetToObjects(usuariosSheet).filter(r => !r.borrado && r.activo);

    const perfilesDest = String(config.perfiles_destino || '').split(',').map(p => p.trim()).filter(Boolean);
    const emailsDest   = new Set();

    perfilesDest.forEach(perfil => {
      usuarios.filter(u => u.perfil === perfil).forEach(u => emailsDest.add(u.email));
    });

    // Agregar supervisor del usuario que disparó el evento
    const usuarioOrigen = usuarios.find(u => u.email === usuarioEmailOrigen);
    if (usuarioOrigen && usuarioOrigen.supervisor_email) {
      emailsDest.add(usuarioOrigen.supervisor_email);
    }

    // Agregar emails adicionales fijos
    String(config.emails_adicionales || '').split(',').map(e => e.trim()).filter(Boolean)
      .forEach(e => emailsDest.add(e));

    if (emailsDest.size === 0) return;

    // Resolver template del asunto
    let asunto = config.asunto_template || `[${evento}] Notificación AWP Inventory`;
    Object.entries(vars).forEach(([k, v]) => {
      asunto = asunto.replace(new RegExp(`{${k}}`, 'g'), v || '');
    });

    // Cuerpo del email
    const cuerpo = `
AWP Inventory — Notificación automática

Evento: ${evento}
${Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('\n')}

Generado por: ${usuarioEmailOrigen}
Fecha: ${now()}

---
Este es un mensaje automático del sistema AWP Inventory.
    `.trim();

    const destinatarios = Array.from(emailsDest).join(',');
    MailApp.sendEmail(destinatarios, asunto, cuerpo);

    registrarMovimiento(
      'NOTIFICACION_ENVIADA',
      vars.material || '',
      `Email enviado: ${evento} → ${destinatarios}`,
      'sistema',
      { evento, destinatarios }
    );

  } catch(err) {
    // Las notificaciones nunca deben romper el flujo principal
    Logger.log('⚠ Error en _notificar (' + evento + '): ' + err.message);
  }
}
