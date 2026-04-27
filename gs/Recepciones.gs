// ============================================================
// Recepciones.gs — Etapa 2
// Cubre: RECEPCIONES (cabecera), RECEPCIONES_ITEMS (líneas),
//        MATERIAL_SERIES (seriados), STOCK (actualización).
//
// Flujo de estados cabecera:
//   BORRADOR → EN_PROCESO (al agregar primer ítem) → CERRADA (automático)
//
// Flujo de estados ítem (estado_qaqc):
//   Si material.qaqc = false → NO_REQUIERE (aprobación inmediata, stock liberado)
//   Si material.qaqc = true  → PENDIENTE_QAQC → APROBADO | NCR
//                                                          → ACEPTADO | RECHAZADO_DEFINITIVO
//
// Regla de cierre automático de cabecera:
//   Cuando todos los ítems no borrados están en estado terminal
//   (APROBADO, NO_REQUIERE, ACEPTADO, RECHAZADO_DEFINITIVO) → cabecera = CERRADA
// ============================================================

// Estados terminales de un ítem — ya no requieren acción
const ITEM_ESTADOS_TERMINALES = ['APROBADO', 'NO_REQUIERE', 'ACEPTADO', 'RECHAZADO_DEFINITIVO'];

// ─── RECEPCIONES — CABECERA ──────────────────────────────────

/**
 * Lista recepciones. Almacenero y MatCoord ven todas.
 * Soporta filtros: estado, fecha_desde, fecha_hasta.
 */
function recepcionesList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC']);

  const sheet = getSheet(SHEETS.RECEPCIONES);
  let rows = sheetToObjects(sheet).filter(r => !r.borrado);

  if (filters) {
    if (filters.estado)       rows = rows.filter(r => r.estado === filters.estado);
    if (filters.fecha_desde)  rows = rows.filter(r => r.fecha >= filters.fecha_desde);
    if (filters.fecha_hasta)  rows = rows.filter(r => r.fecha <= filters.fecha_hasta);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter(r =>
        (r.remito_numero          || '').toLowerCase().includes(q) ||
        (r.proveedor_razon_social || '').toLowerCase().includes(q)
      );
    }
  }

  // Ordenar más recientes primero
  rows.sort((a, b) => (b.creado_en > a.creado_en ? 1 : -1));
  return rows;
}

/**
 * Obtiene una recepción con sus ítems.
 */
function recepcionesGet(recepcion_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC']);
  if (!recepcion_id) throw new Error('recepcion_id requerido');

  const sheet = getSheet(SHEETS.RECEPCIONES);
  const rec   = sheetToObjects(sheet).find(r => r.recepcion_id === recepcion_id && !r.borrado);
  if (!rec) throw new Error('Recepción no encontrada');

  // Adjuntar ítems
  rec.items = _getItemsByRecepcion(recepcion_id);
  return rec;
}

/**
 * Crea una nueva recepción en estado BORRADOR.
 * El Almacenero es el único que puede crearla; Admin puede también.
 */
function recepcionesCreate(data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);

  if (!data.remito_numero)          throw new Error('remito_numero requerido');
  if (!data.proveedor_razon_social) throw new Error('proveedor_razon_social requerido');
  if (!data.fecha)                  throw new Error('fecha requerida');

  // Nro de remito único (dentro de recepciones no borradas)
  const sheet = getSheet(SHEETS.RECEPCIONES);
  const existentes = sheetToObjects(sheet).filter(r => !r.borrado);
  if (existentes.find(r => r.remito_numero === data.remito_numero)) {
    throw new Error('Ya existe una recepción con ese número de remito');
  }

  const recepcion_id = _generarNroRecepcion(existentes);

  const rec = {
    recepcion_id,
    fecha:                data.fecha,
    remito_numero:        data.remito_numero,
    remito_fecha:         data.remito_fecha         || '',
    proveedor_razon_social: data.proveedor_razon_social,
    almacenero_email:     currentUser.email,
    estado:               'BORRADOR',
    observaciones:        data.observaciones        || '',
    borrado:              false,
    borrado_por:          '',
    borrado_fecha:        '',
    creado_en:            now(),
    actualizado_en:       now(),
  };

  appendRow(sheet, RECEPCIONES_HEADERS, rec);
  registrarHistorial('RECEPCIONES', recepcion_id, 'estado', '', 'BORRADOR', currentUser.email);

  return rec;
}

/**
 * Actualiza campos de la cabecera (solo en estado BORRADOR).
 */
function recepcionesUpdate(recepcion_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);
  const { sheet, rec, rowIndex } = _findRecepcion(recepcion_id);

  if (rec.estado !== 'BORRADOR') {
    throw new Error('Solo se puede editar la cabecera en estado BORRADOR');
  }

  const campos = ['fecha', 'remito_numero', 'remito_fecha', 'proveedor_razon_social', 'observaciones'];
  campos.forEach(c => { if (data[c] !== undefined) rec[c] = data[c]; });
  rec.actualizado_en = now();

  updateRow(sheet, rowIndex, RECEPCIONES_HEADERS, rec);
  registrarCambios('RECEPCIONES', recepcion_id, data, rec, currentUser.email);
  return rec;
}

/**
 * Borrado lógico — solo si la recepción está en BORRADOR y no tiene ítems.
 */
function recepcionesDelete(recepcion_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);
  const { sheet, rec, rowIndex } = _findRecepcion(recepcion_id);

  if (rec.estado !== 'BORRADOR') {
    throw new Error('Solo se puede eliminar una recepción en estado BORRADOR');
  }

  const items = _getItemsByRecepcion(recepcion_id);
  if (items.length > 0) {
    throw new Error('No se puede eliminar una recepción que ya tiene ítems');
  }

  rec.borrado       = true;
  rec.borrado_por   = currentUser.email;
  rec.borrado_fecha = now();
  rec.actualizado_en = now();

  updateRow(sheet, rowIndex, RECEPCIONES_HEADERS, rec);
  return { ok: true };
}


// ─── RECEPCIONES_ITEMS — LÍNEAS DEL REMITO ───────────────────

/**
 * Lista los ítems de una recepción.
 */
function itemsList(recepcion_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero', 'QAQC']);
  if (!recepcion_id) throw new Error('recepcion_id requerido');
  return _getItemsByRecepcion(recepcion_id);
}

/**
 * Agrega un ítem a una recepción.
 * Si el material tiene serie=true, data.series debe ser un array de strings
 * con los números de serie (uno por unidad).
 * Si el material tiene qaqc=false, el ítem se aprueba automáticamente
 * y el STOCK se actualiza de inmediato.
 */
function itemsCreate(recepcion_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);

  if (!recepcion_id)        throw new Error('recepcion_id requerido');
  if (!data.material_id)    throw new Error('material_id requerido');
  if (!data.ubicacion_id)   throw new Error('ubicacion_id requerido');
  if (!data.cantidad_recibida || data.cantidad_recibida <= 0) {
    throw new Error('cantidad_recibida debe ser mayor a 0');
  }

  // Verificar recepción existe y no está cerrada
  const { sheet: recSheet, rec, rowIndex: recRowIndex } = _findRecepcion(recepcion_id);
  if (rec.estado === 'CERRADA') {
    throw new Error('No se pueden agregar ítems a una recepción cerrada');
  }

  // Cargar material
  const material = _getMaterial(data.material_id);

  // Validar series si aplica
  if (material.serie) {
    if (!data.series || !Array.isArray(data.series) || data.series.length === 0) {
      throw new Error('El material requiere número de serie. Enviá data.series como array de strings.');
    }
    if (data.series.length !== Number(data.cantidad_recibida)) {
      throw new Error(`Cantidad de series (${data.series.length}) no coincide con cantidad_recibida (${data.cantidad_recibida})`);
    }
    // Verificar unicidad material + numero_serie
    _validarSeriesUnicas(data.material_id, data.series);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const itemSheet = getSheet(SHEETS.RECEPCIONES_ITEMS);
    const item_id   = generateId();

    // Estado inicial según si el material requiere QAQC
    const estado_qaqc = material.qaqc ? 'PENDIENTE_QAQC' : 'NO_REQUIERE';

    const item = {
      item_id,
      recepcion_id,
      material_id:        data.material_id,
      cantidad_remitada:  data.cantidad_remitida  || data.cantidad_recibida,
      cantidad_recibida:  data.cantidad_recibida,
      ubicacion_id:       data.ubicacion_id,
      estado_qaqc,
      ncr_id:             '',
      borrado:            false,
      borrado_por:        '',
      borrado_fecha:      '',
      creado_en:          now(),
      actualizado_en:     now(),
    };

    appendRow(itemSheet, RECEPCIONES_ITEMS_HEADERS, item);

    // Registrar series individuales si aplica
    if (material.serie) {
      _crearSeries(data.series, data.material_id, item_id, data.ubicacion_id, currentUser.email);
    }

    // Si no requiere QAQC → actualizar STOCK de inmediato
    if (!material.qaqc) {
      _actualizarStock(data.material_id, data.ubicacion_id, Number(data.cantidad_recibida), 0, 0);
      registrarMovimiento(
        'RECEPCION_APROBADA_AUTO',
        data.material_id,
        `Ítem recibido sin QAQC — remito ${rec.remito_numero}`,
        currentUser.email,
        { recepcion_id, item_id }
      );
    } else {
      registrarMovimiento(
        'RECEPCION_ITEM_PENDIENTE',
        data.material_id,
        `Ítem pendiente de QAQC — remito ${rec.remito_numero}`,
        currentUser.email,
        { recepcion_id, item_id }
      );
    }

    // Si la cabecera estaba en BORRADOR, pasarla a EN_PROCESO
    if (rec.estado === 'BORRADOR') {
      rec.estado         = 'EN_PROCESO';
      rec.actualizado_en = now();
      updateRow(recSheet, recRowIndex, RECEPCIONES_HEADERS, rec);
      registrarHistorial('RECEPCIONES', recepcion_id, 'estado', 'BORRADOR', 'EN_PROCESO', currentUser.email);
    }

    return { ...item, series_creadas: material.serie ? data.series.length : 0 };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Actualiza campos editables de un ítem (solo si está en PENDIENTE_QAQC).
 * No permite cambiar material ni series — para eso hay que borrar y recrear.
 */
function itemsUpdate(item_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);
  const { sheet, item, rowIndex } = _findItem(item_id);

  if (!['PENDIENTE_QAQC', 'NO_REQUIERE'].includes(item.estado_qaqc)) {
    throw new Error('El ítem ya fue procesado por QAQC y no puede editarse');
  }

  const campos = ['cantidad_remitida', 'cantidad_recibida', 'ubicacion_id', 'observaciones'];
  campos.forEach(c => { if (data[c] !== undefined) item[c] = data[c]; });
  item.actualizado_en = now();

  updateRow(sheet, rowIndex, RECEPCIONES_ITEMS_HEADERS, item);
  registrarCambios('RECEPCIONES_ITEMS', item_id, data, item, currentUser.email);
  return item;
}

/**
 * QAQC aprueba un ítem directamente (sin NCR).
 * Actualiza estado_qaqc → APROBADO, libera stock, verifica cierre de recepción.
 */
function itemsAprobar(item_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'QAQC']);

  const { sheet, item, rowIndex } = _findItem(item_id);

  if (item.estado_qaqc !== 'PENDIENTE_QAQC') {
    throw new Error(`No se puede aprobar un ítem en estado ${item.estado_qaqc}`);
  }

  const anterior = item.estado_qaqc;
  item.estado_qaqc   = 'APROBADO';
  item.actualizado_en = now();
  updateRow(sheet, rowIndex, RECEPCIONES_ITEMS_HEADERS, item);

  registrarHistorial('RECEPCIONES_ITEMS', item_id, 'estado_qaqc', anterior, 'APROBADO', currentUser.email);

  // Actualizar series a EN_ALMACEN si aplica
  _actualizarEstadoSeries(item_id, 'EN_ALMACEN', currentUser.email);

  // Actualizar STOCK
  _actualizarStock(item.material_id, item.ubicacion_id, Number(item.cantidad_recibida), 0, 0);

  registrarMovimiento(
    'QAQC_APROBADO',
    item.material_id,
    `QAQC aprobó ítem ${item_id}`,
    currentUser.email,
    { item_id, recepcion_id: item.recepcion_id }
  );

  // Verificar si la recepción se puede cerrar
  _verificarCierreRecepcion(item.recepcion_id, currentUser.email);

  return item;
}

/**
 * Borrado lógico de un ítem (solo PENDIENTE_QAQC o NO_REQUIERE sin stock aún).
 */
function itemsDelete(item_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'Almacenero']);
  const { sheet, item, rowIndex } = _findItem(item_id);

  if (!['PENDIENTE_QAQC'].includes(item.estado_qaqc)) {
    throw new Error('Solo se pueden eliminar ítems en estado PENDIENTE_QAQC');
  }

  item.borrado       = true;
  item.borrado_por   = currentUser.email;
  item.borrado_fecha = now();
  item.actualizado_en = now();

  updateRow(sheet, rowIndex, RECEPCIONES_ITEMS_HEADERS, item);

  // Borrar series asociadas si las hubiera
  _borrarSeriesPorItem(item_id, currentUser.email);

  return { ok: true };
}


// ─── HELPERS INTERNOS ────────────────────────────────────────

/** Genera nro de recepción correlativo: REC-YYYY-NNNN */
function _generarNroRecepcion(existentes) {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const nums = existentes
    .filter(r => r.recepcion_id && r.recepcion_id.startsWith(prefix))
    .map(r => parseInt(r.recepcion_id.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return prefix + String(siguiente).padStart(4, '0');
}

/** Busca recepción por ID y devuelve sheet + objeto + índice de fila */
function _findRecepcion(recepcion_id) {
  if (!recepcion_id) throw new Error('recepcion_id requerido');
  const sheet = getSheet(SHEETS.RECEPCIONES);
  const rows  = sheetToObjects(sheet);
  const idx   = rows.findIndex(r => r.recepcion_id === recepcion_id && !r.borrado);
  if (idx === -1) throw new Error('Recepción no encontrada');
  return { sheet, rec: rows[idx], rowIndex: idx + 1 };
}

/** Busca ítem por ID */
function _findItem(item_id) {
  if (!item_id) throw new Error('item_id requerido');
  const sheet = getSheet(SHEETS.RECEPCIONES_ITEMS);
  const rows  = sheetToObjects(sheet);
  const idx   = rows.findIndex(r => r.item_id === item_id && !r.borrado);
  if (idx === -1) throw new Error('Ítem no encontrado');
  return { sheet, item: rows[idx], rowIndex: idx + 1 };
}

/** Devuelve los ítems no borrados de una recepción */
function _getItemsByRecepcion(recepcion_id) {
  const sheet = getSheet(SHEETS.RECEPCIONES_ITEMS);
  return sheetToObjects(sheet).filter(r => r.recepcion_id === recepcion_id && !r.borrado);
}

/** Carga un material por ID. Lanza error si no existe. */
function _getMaterial(material_id) {
  const sheet = getSheet(SHEETS.MATERIALES);
  const mat   = sheetToObjects(sheet).find(r => r.material_id === material_id && !r.borrado);
  if (!mat) throw new Error('Material no encontrado: ' + material_id);
  return mat;
}

/**
 * Verifica que ninguno de los números de serie exista ya para ese material.
 * Unicidad: material_id + numero_serie (excluye borrados).
 */
function _validarSeriesUnicas(material_id, seriesNuevas) {
  const sheet     = getSheet(SHEETS.MATERIAL_SERIES);
  const existentes = sheetToObjects(sheet)
    .filter(r => r.material_id === material_id && !r.borrado)
    .map(r => String(r.numero_serie).trim().toLowerCase());

  const duplicados = seriesNuevas.filter(s =>
    existentes.includes(String(s).trim().toLowerCase())
  );

  if (duplicados.length > 0) {
    throw new Error('Números de serie ya existentes para este material: ' + duplicados.join(', '));
  }
}

/**
 * Da de alta las series en MATERIAL_SERIES.
 * Estado inicial: PENDIENTE_QAQC si el material lo requiere (se ajusta al aprobar).
 * Se usa 'NCR' como ubicación intermedia hasta que QAQC apruebe.
 */
function _crearSeries(numerosArray, material_id, recepcion_item_id, ubicacion_id, usuarioEmail) {
  const sheet = getSheet(SHEETS.MATERIAL_SERIES);
  numerosArray.forEach(nro => {
    const serie = {
      serie_id:           generateId(),
      material_id,
      numero_serie:       String(nro).trim(),
      codigo_barras:      '',
      estado:             'PENDIENTE_QAQC',  // se actualiza al aprobar/rechazar
      ubicacion_id,
      recepcion_item_id,
      salida_item_id:     '',
      devolucion_item_id: '',
      ncr_id:             '',
      borrado:            false,
      borrado_por:        '',
      borrado_fecha:      '',
      creado_en:          now(),
      actualizado_en:     now(),
    };
    appendRow(sheet, MATERIAL_SERIES_HEADERS, serie);
  });
}

/**
 * Actualiza el estado de todas las series de un ítem.
 * Usado al aprobar (→ EN_ALMACEN) o al crear NCR (→ NCR/SEGREGADO).
 */
function _actualizarEstadoSeries(recepcion_item_id, nuevoEstado, usuarioEmail) {
  const sheet = getSheet(SHEETS.MATERIAL_SERIES);
  const rows  = sheetToObjects(sheet);
  const headers = getHeaders(sheet);

  rows.forEach((row, idx) => {
    if (row.recepcion_item_id === recepcion_item_id && !row.borrado) {
      row.estado          = nuevoEstado;
      row.actualizado_en  = now();
      updateRow(sheet, idx + 1, headers, row);
    }
  });
}

/** Borrado lógico de series de un ítem (cuando se borra el ítem) */
function _borrarSeriesPorItem(recepcion_item_id, usuarioEmail) {
  const sheet   = getSheet(SHEETS.MATERIAL_SERIES);
  const rows    = sheetToObjects(sheet);
  const headers = getHeaders(sheet);

  rows.forEach((row, idx) => {
    if (row.recepcion_item_id === recepcion_item_id && !row.borrado) {
      row.borrado       = true;
      row.borrado_por   = usuarioEmail;
      row.borrado_fecha = now();
      row.actualizado_en = now();
      updateRow(sheet, idx + 1, headers, row);
    }
  });
}

/**
 * Actualiza la tabla STOCK para material + ubicación.
 * Si no existe la fila, la crea.
 * Los deltas pueden ser negativos (para decrementar).
 */
function _actualizarStock(material_id, ubicacion_id, deltaDispo, deltaReserv, deltaBloque) {
  const sheet   = getSheet(SHEETS.STOCK);
  const rows    = sheetToObjects(sheet);
  const headers = getHeaders(sheet);
  const idx     = rows.findIndex(r => r.material_id === material_id && r.ubicacion_id === ubicacion_id);

  if (idx === -1) {
    // Crear nueva fila de stock
    const nueva = {
      stock_id:             generateId(),
      material_id,
      ubicacion_id,
      cantidad_disponible:  Math.max(0, deltaDispo),
      cantidad_reservada:   Math.max(0, deltaReserv),
      cantidad_bloqueada:   Math.max(0, deltaBloque),
      ultima_actualizacion: now(),
    };
    appendRow(sheet, STOCK_HEADERS, nueva);
  } else {
    const row = rows[idx];
    row.cantidad_disponible  = Math.max(0, Number(row.cantidad_disponible)  + deltaDispo);
    row.cantidad_reservada   = Math.max(0, Number(row.cantidad_reservada)   + deltaReserv);
    row.cantidad_bloqueada   = Math.max(0, Number(row.cantidad_bloqueada)   + deltaBloque);
    row.ultima_actualizacion = now();
    updateRow(sheet, idx + 1, headers, row);
  }
}

/**
 * Verifica si todos los ítems de una recepción están en estado terminal.
 * Si es así, cierra la recepción automáticamente.
 */
function _verificarCierreRecepcion(recepcion_id, usuarioEmail) {
  const items = _getItemsByRecepcion(recepcion_id);
  if (items.length === 0) return;

  const todosTerminales = items.every(i => ITEM_ESTADOS_TERMINALES.includes(i.estado_qaqc));
  if (!todosTerminales) return;

  const { sheet, rec, rowIndex } = _findRecepcion(recepcion_id);
  if (rec.estado === 'CERRADA') return;  // ya cerrada

  rec.estado         = 'CERRADA';
  rec.actualizado_en = now();
  updateRow(sheet, rowIndex, RECEPCIONES_HEADERS, rec);
  registrarHistorial('RECEPCIONES', recepcion_id, 'estado', rec.estado, 'CERRADA', usuarioEmail);
  registrarMovimiento(
    'RECEPCION_CERRADA',
    null,
    `Recepción ${recepcion_id} cerrada automáticamente`,
    usuarioEmail,
    { recepcion_id }
  );
}
