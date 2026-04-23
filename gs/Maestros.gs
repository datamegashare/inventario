// ============================================================
// Maestros.gs — Familias, Ubicaciones y Config
// ============================================================

// ─── FAMILIAS ───────────────────────────────────────────────

const FAMILIAS_HEADERS = [
  'familia_id', 'codigo', 'nombre', 'descripcion',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

function familiasList(currentUser) {
  const sheet = getSheet(SHEETS.FAMILIAS);
  const rows  = sheetToObjects(sheet);
  return rows.filter(r => !r.borrado);
}

function familiasCreate(data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!data.nombre || !data.nombre.trim()) throw new Error('Nombre de familia requerido');

  const sheet = getSheet(SHEETS.FAMILIAS);
  const rows  = sheetToObjects(sheet);

  if (data.codigo && rows.find(r => r.codigo === data.codigo && !r.borrado)) {
    throw new Error('Ya existe una familia con ese código');
  }

  const nueva = {
    familia_id:    generateId(),
    codigo:        (data.codigo || '').toUpperCase().trim(),
    nombre:        data.nombre.trim(),
    descripcion:   (data.descripcion || '').trim(),
    borrado:       false,
    borrado_por:   '',
    borrado_fecha: '',
    creado_en:     now(),
    actualizado_en: now()
  };

  appendRow(sheet, FAMILIAS_HEADERS, nueva);
  registrarHistorial('FAMILIAS', nueva.familia_id, 'CREACION', '', JSON.stringify(nueva), currentUser.email);
  return nueva;
}

function familiasUpdate(familia_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!familia_id) throw new Error('familia_id requerido');

  const sheet  = getSheet(SHEETS.FAMILIAS);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.familia_id === familia_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Familia no encontrada');

  const anterior = { ...rows[rowIdx] };
  ['codigo', 'nombre', 'descripcion'].forEach(c => {
    if (data[c] !== undefined) rows[rowIdx][c] = data[c];
  });
  rows[rowIdx].actualizado_en = now();

  updateRow(sheet, rowIdx + 1, FAMILIAS_HEADERS, rows[rowIdx]);
  registrarCambios('FAMILIAS', familia_id, rows[rowIdx], anterior, currentUser.email);
  return rows[rowIdx];
}

function familiasDelete(familia_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!familia_id) throw new Error('familia_id requerido');

  const sheet  = getSheet(SHEETS.FAMILIAS);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.familia_id === familia_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Familia no encontrada');

  // Verificar que no tiene materiales asociados
  const matSheet = getSheet(SHEETS.MATERIALES);
  const mats     = sheetToObjects(matSheet);
  if (mats.find(m => m.familia_id === familia_id && !m.borrado)) {
    throw new Error('No se puede eliminar: la familia tiene materiales asociados');
  }

  rows[rowIdx].borrado       = true;
  rows[rowIdx].borrado_por   = currentUser.email;
  rows[rowIdx].borrado_fecha = now();
  rows[rowIdx].actualizado_en = now();
  updateRow(sheet, rowIdx + 1, FAMILIAS_HEADERS, rows[rowIdx]);
  registrarHistorial('FAMILIAS', familia_id, 'BORRADO', 'false', 'true', currentUser.email);
  return { success: true };
}

// ─── UBICACIONES ────────────────────────────────────────────

const UBICACIONES_HEADERS = [
  'ubicacion_id', 'codigo', 'nombre', 'tipo', 'descripcion',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

const TIPOS_UBICACION = ['ALMACEN', 'PLAYA', 'SEGREGADO', 'DEVOLUCION'];

function ubicacionesList(currentUser) {
  const sheet = getSheet(SHEETS.UBICACIONES);
  const rows  = sheetToObjects(sheet);
  return rows.filter(r => !r.borrado);
}

function ubicacionesCreate(data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!data.nombre) throw new Error('Nombre de ubicación requerido');
  if (!TIPOS_UBICACION.includes(data.tipo)) {
    throw new Error(`Tipo inválido. Debe ser uno de: ${TIPOS_UBICACION.join(', ')}`);
  }

  const sheet = getSheet(SHEETS.UBICACIONES);
  const rows  = sheetToObjects(sheet);

  if (data.codigo && rows.find(r => r.codigo === data.codigo && !r.borrado)) {
    throw new Error('Ya existe una ubicación con ese código');
  }

  const nueva = {
    ubicacion_id:  generateId(),
    codigo:        (data.codigo || '').toUpperCase().trim(),
    nombre:        data.nombre.trim(),
    tipo:          data.tipo,
    descripcion:   (data.descripcion || '').trim(),
    borrado:       false,
    borrado_por:   '',
    borrado_fecha: '',
    creado_en:     now(),
    actualizado_en: now()
  };

  appendRow(sheet, UBICACIONES_HEADERS, nueva);
  registrarHistorial('UBICACIONES', nueva.ubicacion_id, 'CREACION', '', JSON.stringify(nueva), currentUser.email);
  return nueva;
}

function ubicacionesUpdate(ubicacion_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!ubicacion_id) throw new Error('ubicacion_id requerido');

  const sheet  = getSheet(SHEETS.UBICACIONES);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.ubicacion_id === ubicacion_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Ubicación no encontrada');

  if (data.tipo && !TIPOS_UBICACION.includes(data.tipo)) {
    throw new Error('Tipo de ubicación inválido');
  }

  const anterior = { ...rows[rowIdx] };
  ['codigo', 'nombre', 'tipo', 'descripcion'].forEach(c => {
    if (data[c] !== undefined) rows[rowIdx][c] = data[c];
  });
  rows[rowIdx].actualizado_en = now();
  updateRow(sheet, rowIdx + 1, UBICACIONES_HEADERS, rows[rowIdx]);
  registrarCambios('UBICACIONES', ubicacion_id, rows[rowIdx], anterior, currentUser.email);
  return rows[rowIdx];
}

function ubicacionesDelete(ubicacion_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!ubicacion_id) throw new Error('ubicacion_id requerido');

  const sheet  = getSheet(SHEETS.UBICACIONES);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.ubicacion_id === ubicacion_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Ubicación no encontrada');

  rows[rowIdx].borrado       = true;
  rows[rowIdx].borrado_por   = currentUser.email;
  rows[rowIdx].borrado_fecha = now();
  rows[rowIdx].actualizado_en = now();
  updateRow(sheet, rowIdx + 1, UBICACIONES_HEADERS, rows[rowIdx]);
  registrarHistorial('UBICACIONES', ubicacion_id, 'BORRADO', 'false', 'true', currentUser.email);
  return { success: true };
}

// ─── CONFIG ─────────────────────────────────────────────────

const CONFIG_HEADERS = ['clave', 'valor', 'descripcion', 'actualizado_en', 'actualizado_por'];

function configGet(currentUser) {
  const sheet = getSheet(SHEETS.CONFIG);
  const rows  = sheetToObjects(sheet);
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  return config;
}

function getConfigValue(clave) {
  try {
    const sheet = getSheet(SHEETS.CONFIG);
    const rows  = sheetToObjects(sheet);
    const row   = rows.find(r => r.clave === clave);
    return row ? row.valor : null;
  } catch (e) {
    return null;
  }
}

function configUpdate(data, currentUser) {
  requirePerfil(currentUser, ['Admin']);
  const sheet = getSheet(SHEETS.CONFIG);
  const rows  = sheetToObjects(sheet);

  Object.keys(data).forEach(clave => {
    const rowIdx = rows.findIndex(r => r.clave === clave);
    const newVal = data[clave];
    if (rowIdx !== -1) {
      const range = sheet.getRange(rowIdx + 2, 2); // col 2 = valor
      range.setValue(newVal);
      const tsRange = sheet.getRange(rowIdx + 2, 4);
      tsRange.setValue(now());
      const byRange = sheet.getRange(rowIdx + 2, 5);
      byRange.setValue(currentUser.email);
    } else {
      sheet.appendRow([clave, newVal, '', now(), currentUser.email]);
    }
    registrarHistorial('CONFIG', clave, 'valor', rows[rowIdx] ? rows[rowIdx].valor : '', newVal, currentUser.email);
  });

  return { success: true };
}

// ─── HISTORIAL_CAMBIOS ──────────────────────────────────────

function historialList(filters, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  const sheet = getSheet(SHEETS.HISTORIAL_CAMBIOS);
  let rows    = sheetToObjects(sheet);

  if (filters) {
    if (filters.tabla)       rows = rows.filter(r => r.tabla === filters.tabla);
    if (filters.registro_id) rows = rows.filter(r => r.registro_id === filters.registro_id);
    if (filters.usuario)     rows = rows.filter(r => r.usuario === filters.usuario);
    if (filters.desde)       rows = rows.filter(r => r.timestamp >= filters.desde);
    if (filters.hasta)       rows = rows.filter(r => r.timestamp <= filters.hasta);
  }

  // Ordenar descendente
  rows.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return rows.slice(0, 500); // máx 500 registros por consulta
}

