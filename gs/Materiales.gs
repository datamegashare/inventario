// ============================================================
// Materiales.gs — CRUD del maestro de materiales + importación Excel
// ============================================================

const MATERIALES_HEADERS = [
  'material_id', 'codigo_externo', 'descripcion', 'familia_id',
  'ownership', 'unidad', 'codigo_barras', 'especificacion',
  'stock_minimo', 'serie', 'qaqc', 'activo',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

const OWNERSHIP_VALIDOS = ['contractor-furnished', 'owner-furnished'];
const UNIDADES_VALIDAS  = ['UN', 'M', 'M2', 'M3', 'KG', 'TON', 'L', 'GL', 'SPOOL', 'OTRO'];

// ─── LIST ────────────────────────────────────────────────────

function materialesList(filters, currentUser) {
  // ViewerCliente solo ve owner-furnished
  const sheet = getSheet(SHEETS.MATERIALES);
  let rows    = sheetToObjects(sheet).filter(r => !r.borrado);

  if (currentUser.perfil === 'ViewerCliente') {
    rows = rows.filter(r => r.ownership === 'owner-furnished');
  }

  if (filters) {
    if (filters.familia_id)    rows = rows.filter(r => r.familia_id === filters.familia_id);
    if (filters.ownership)     rows = rows.filter(r => r.ownership === filters.ownership);
    if (filters.serie !== undefined) rows = rows.filter(r => Boolean(r.serie) === Boolean(filters.serie));
    if (filters.qaqc  !== undefined) rows = rows.filter(r => Boolean(r.qaqc)  === Boolean(filters.qaqc));
    if (filters.activo !== undefined) rows = rows.filter(r => Boolean(r.activo) === Boolean(filters.activo));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter(r =>
        (r.codigo_externo || '').toLowerCase().includes(q) ||
        (r.descripcion   || '').toLowerCase().includes(q) ||
        (r.codigo_barras || '').toLowerCase().includes(q)
      );
    }
  }

  return rows;
}

// ─── GET ─────────────────────────────────────────────────────

function materialesGet(material_id, currentUser) {
  if (!material_id) throw new Error('material_id requerido');
  const sheet = getSheet(SHEETS.MATERIALES);
  const rows  = sheetToObjects(sheet);
  const m     = rows.find(r => r.material_id === material_id && !r.borrado);
  if (!m) throw new Error('Material no encontrado');

  if (currentUser.perfil === 'ViewerCliente' && m.ownership !== 'owner-furnished') {
    throw new Error('Sin acceso a este material');
  }

  return m;
}

// ─── CREATE ──────────────────────────────────────────────────

function materialesCreate(data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord', 'Almacenero']);
  validarMaterialData(data);

  const sheet = getSheet(SHEETS.MATERIALES);
  const rows  = sheetToObjects(sheet);

  // Código externo único
  if (data.codigo_externo && rows.find(r => r.codigo_externo === data.codigo_externo && !r.borrado)) {
    throw new Error('Ya existe un material con ese código externo');
  }

  // Verificar familia existe
  if (data.familia_id) {
    const famSheet = getSheet(SHEETS.FAMILIAS);
    const fams     = sheetToObjects(famSheet);
    if (!fams.find(f => f.familia_id === data.familia_id && !f.borrado)) {
      throw new Error('Familia no encontrada');
    }
  }

  const nuevo = {
    material_id:    generateId(),
    codigo_externo: (data.codigo_externo || '').trim(),
    descripcion:    data.descripcion.trim(),
    familia_id:     data.familia_id || '',
    ownership:      data.ownership || 'contractor-furnished',
    unidad:         data.unidad || 'UN',
    codigo_barras:  (data.codigo_barras || '').trim(),
    especificacion: (data.especificacion || '').trim(),
    stock_minimo:   Number(data.stock_minimo) || 0,
    serie:          data.serie === true || data.serie === 'true' || data.serie === 1,
    qaqc:           data.qaqc  === true || data.qaqc  === 'true' || data.qaqc  === 1,
    activo:         true,
    borrado:        false,
    borrado_por:    '',
    borrado_fecha:  '',
    creado_en:      now(),
    actualizado_en: now()
  };

  appendRow(sheet, MATERIALES_HEADERS, nuevo);
  registrarHistorial('MATERIALES', nuevo.material_id, 'CREACION', '', JSON.stringify(nuevo), currentUser.email);
  return nuevo;
}

// ─── UPDATE ──────────────────────────────────────────────────

function materialesUpdate(material_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!material_id) throw new Error('material_id requerido');

  const sheet  = getSheet(SHEETS.MATERIALES);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.material_id === material_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Material no encontrado');

  const anterior = { ...rows[rowIdx] };
  const campos   = [
    'codigo_externo', 'descripcion', 'familia_id', 'ownership',
    'unidad', 'codigo_barras', 'especificacion', 'stock_minimo',
    'serie', 'qaqc', 'activo'
  ];

  campos.forEach(c => {
    if (data[c] !== undefined) rows[rowIdx][c] = data[c];
  });

  if (data.stock_minimo !== undefined) rows[rowIdx].stock_minimo = Number(data.stock_minimo) || 0;
  rows[rowIdx].actualizado_en = now();

  updateRow(sheet, rowIdx + 1, MATERIALES_HEADERS, rows[rowIdx]);
  registrarCambios('MATERIALES', material_id, rows[rowIdx], anterior, currentUser.email);
  return rows[rowIdx];
}

// ─── DELETE ──────────────────────────────────────────────────

function materialesDelete(material_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!material_id) throw new Error('material_id requerido');

  const sheet  = getSheet(SHEETS.MATERIALES);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.material_id === material_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Material no encontrado');

  rows[rowIdx].borrado       = true;
  rows[rowIdx].borrado_por   = currentUser.email;
  rows[rowIdx].borrado_fecha = now();
  rows[rowIdx].activo        = false;
  rows[rowIdx].actualizado_en = now();

  updateRow(sheet, rowIdx + 1, MATERIALES_HEADERS, rows[rowIdx]);
  registrarHistorial('MATERIALES', material_id, 'BORRADO', 'false', 'true', currentUser.email);
  return { success: true };
}

// ─── IMPORTACIÓN MASIVA ──────────────────────────────────────

/**
 * Importación desde Excel/CSV.
 * rows: array de objetos con los campos del material.
 * Devuelve { creados, actualizados, errores[] }
 */
function materialesImport(rows, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No se recibieron filas para importar');
  }
  if (rows.length > 1000) {
    throw new Error('Máximo 1000 materiales por importación');
  }

  const sheet       = getSheet(SHEETS.MATERIALES);
  const existing    = sheetToObjects(sheet);
  const famSheet    = getSheet(SHEETS.FAMILIAS);
  const familias    = sheetToObjects(famSheet).filter(f => !f.borrado);

  let creados     = 0;
  let actualizados = 0;
  const errores   = [];

  rows.forEach((row, i) => {
    const lineNum = i + 2; // 1-based + header
    try {
      // Mapear familia por código si viene como string
      if (row.familia_codigo && !row.familia_id) {
        const fam = familias.find(f => f.codigo === row.familia_codigo.toUpperCase().trim());
        row.familia_id = fam ? fam.familia_id : '';
      }

      validarMaterialData(row, true); // modo import: descripcion es obligatoria

      const existente = row.codigo_externo
        ? existing.find(r => r.codigo_externo === row.codigo_externo && !r.borrado)
        : null;

      if (existente) {
        // Actualizar
        const rowIdx = existing.findIndex(r => r.material_id === existente.material_id);
        const anterior = { ...existing[rowIdx] };
        const campos = ['descripcion', 'familia_id', 'ownership', 'unidad',
                        'codigo_barras', 'especificacion', 'stock_minimo', 'serie', 'qaqc'];
        campos.forEach(c => { if (row[c] !== undefined) existing[rowIdx][c] = row[c]; });
        existing[rowIdx].actualizado_en = now();
        updateRow(sheet, rowIdx + 1, MATERIALES_HEADERS, existing[rowIdx]);
        registrarCambios('MATERIALES', existente.material_id, existing[rowIdx], anterior, currentUser.email);
        actualizados++;
      } else {
        // Crear
        const nuevo = {
          material_id:    generateId(),
          codigo_externo: (row.codigo_externo || '').trim(),
          descripcion:    row.descripcion.trim(),
          familia_id:     row.familia_id || '',
          ownership:      row.ownership || 'contractor-furnished',
          unidad:         row.unidad || 'UN',
          codigo_barras:  (row.codigo_barras || '').trim(),
          especificacion: (row.especificacion || '').trim(),
          stock_minimo:   Number(row.stock_minimo) || 0,
          serie:          row.serie === true || row.serie === 'true' || row.serie === 1 || row.serie === 'SI' || row.serie === 'S',
          qaqc:           row.qaqc  === true || row.qaqc  === 'true' || row.qaqc  === 1 || row.qaqc  === 'SI' || row.qaqc  === 'S',
          activo:         true,
          borrado:        false,
          borrado_por:    '',
          borrado_fecha:  '',
          creado_en:      now(),
          actualizado_en: now()
        };
        appendRow(sheet, MATERIALES_HEADERS, nuevo);
        registrarHistorial('MATERIALES', nuevo.material_id, 'IMPORT', '', JSON.stringify(nuevo), currentUser.email);
        existing.push(nuevo);
        creados++;
      }
    } catch (err) {
      errores.push({ linea: lineNum, codigo: row.codigo_externo || '(sin código)', error: err.message });
    }
  });

  return { creados, actualizados, errores, total: rows.length };
}

// ─── VALIDACIÓN ──────────────────────────────────────────────

function validarMaterialData(data, importMode) {
  if (!data.descripcion || data.descripcion.trim().length < 2) {
    throw new Error('Descripción requerida');
  }
  if (data.ownership && !OWNERSHIP_VALIDOS.includes(data.ownership)) {
    throw new Error(`ownership inválido. Use: ${OWNERSHIP_VALIDOS.join(', ')}`);
  }
  if (data.unidad && !UNIDADES_VALIDAS.includes(data.unidad)) {
    throw new Error(`Unidad inválida. Use: ${UNIDADES_VALIDAS.join(', ')}`);
  }
  if (data.stock_minimo !== undefined && isNaN(Number(data.stock_minimo))) {
    throw new Error('stock_minimo debe ser un número');
  }
}
