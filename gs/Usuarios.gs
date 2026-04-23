// ============================================================
// Usuarios.gs — CRUD de la tabla USUARIOS
// ============================================================

const USUARIOS_HEADERS = [
  'usuario_id', 'email', 'nombre', 'perfil', 'supervisor_email',
  'activo', 'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

const PERFILES_VALIDOS = [
  'Admin', 'MatCoord', 'Almacenero', 'QAQC',
  'Planner', 'FieldEng', 'ViewerCliente', 'ViewerGerencia'
];

function buscarUsuarioPorEmail(email) {
  const sheet = getSheet(SHEETS.USUARIOS);
  const rows  = sheetToObjects(sheet);
  return rows.find(r => r.email === email && !r.borrado) || null;
}

function usuariosList(currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  const sheet = getSheet(SHEETS.USUARIOS);
  const rows  = sheetToObjects(sheet);
  return rows.filter(r => !r.borrado).map(sanitizeUsuario);
}

function usuariosGet(usuario_id, currentUser) {
  requirePerfil(currentUser, ['Admin', 'MatCoord']);
  if (!usuario_id) throw new Error('usuario_id requerido');
  const sheet = getSheet(SHEETS.USUARIOS);
  const rows  = sheetToObjects(sheet);
  const u     = rows.find(r => r.usuario_id === usuario_id && !r.borrado);
  if (!u) throw new Error('Usuario no encontrado');
  return sanitizeUsuario(u);
}

function usuariosCreate(data, currentUser) {
  requirePerfil(currentUser, ['Admin']);
  validarUsuarioData(data);

  // Verificar email único
  const sheet = getSheet(SHEETS.USUARIOS);
  const rows  = sheetToObjects(sheet);
  if (rows.find(r => r.email === data.email && !r.borrado)) {
    throw new Error('Ya existe un usuario con ese email');
  }

  const nuevo = {
    usuario_id:       generateId(),
    email:            data.email.toLowerCase().trim(),
    nombre:           data.nombre.trim(),
    perfil:           data.perfil,
    supervisor_email: (data.supervisor_email || '').toLowerCase().trim(),
    activo:           true,
    borrado:          false,
    borrado_por:      '',
    borrado_fecha:    '',
    creado_en:        now(),
    actualizado_en:   now()
  };

  appendRow(sheet, USUARIOS_HEADERS, nuevo);
  registrarHistorial('USUARIOS', nuevo.usuario_id, 'CREACION', '', JSON.stringify(nuevo), currentUser.email);
  return sanitizeUsuario(nuevo);
}

function usuariosUpdate(usuario_id, data, currentUser) {
  requirePerfil(currentUser, ['Admin']);
  if (!usuario_id) throw new Error('usuario_id requerido');

  const sheet   = getSheet(SHEETS.USUARIOS);
  const rows    = sheetToObjects(sheet);
  const rowIdx  = rows.findIndex(r => r.usuario_id === usuario_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Usuario no encontrado');

  const anterior = { ...rows[rowIdx] };
  const campos   = ['nombre', 'perfil', 'supervisor_email', 'activo'];
  campos.forEach(c => { if (data[c] !== undefined) rows[rowIdx][c] = data[c]; });

  if (data.perfil && !PERFILES_VALIDOS.includes(data.perfil)) {
    throw new Error('Perfil inválido');
  }

  rows[rowIdx].actualizado_en = now();
  updateRow(sheet, rowIdx + 1, USUARIOS_HEADERS, rows[rowIdx]);
  registrarCambios('USUARIOS', usuario_id, rows[rowIdx], anterior, currentUser.email);
  return sanitizeUsuario(rows[rowIdx]);
}

function usuariosDelete(usuario_id, currentUser) {
  requirePerfil(currentUser, ['Admin']);
  if (!usuario_id) throw new Error('usuario_id requerido');
  if (usuario_id === currentUser.usuario_id) throw new Error('No puede eliminar su propia cuenta');

  const sheet  = getSheet(SHEETS.USUARIOS);
  const rows   = sheetToObjects(sheet);
  const rowIdx = rows.findIndex(r => r.usuario_id === usuario_id && !r.borrado);
  if (rowIdx === -1) throw new Error('Usuario no encontrado');

  rows[rowIdx].borrado       = true;
  rows[rowIdx].borrado_por   = currentUser.email;
  rows[rowIdx].borrado_fecha = now();
  rows[rowIdx].activo        = false;
  rows[rowIdx].actualizado_en = now();

  updateRow(sheet, rowIdx + 1, USUARIOS_HEADERS, rows[rowIdx]);
  registrarHistorial('USUARIOS', usuario_id, 'BORRADO', 'false', 'true', currentUser.email);
  return { success: true };
}

function validarUsuarioData(data) {
  if (!data.email || !/\S+@\S+\.\S+/.test(data.email)) throw new Error('Email inválido');
  if (!data.nombre || data.nombre.trim().length < 2) throw new Error('Nombre requerido');
  if (!PERFILES_VALIDOS.includes(data.perfil)) throw new Error('Perfil inválido');
}

function sanitizeUsuario(u) {
  return {
    usuario_id:       u.usuario_id,
    email:            u.email,
    nombre:           u.nombre,
    perfil:           u.perfil,
    supervisor_email: u.supervisor_email,
    activo:           u.activo === true || u.activo === 'TRUE' || u.activo === 'true',
    creado_en:        u.creado_en,
    actualizado_en:   u.actualizado_en
  };
}
