// ============================================================
// Tests.gs — Suite de pruebas para Etapa 2
//
// INSTRUCCIONES:
//   1. Ejecutar primero testSetupDatos() — crea los datos de prueba
//      necesarios (familia, ubicaciones, materiales, usuarios).
//      Es idempotente: si ya existen, los reutiliza.
//   2. Ejecutar cada testXxx() por separado desde el editor.
//   3. Al finalizar, ejecutar testLimpiar() para borrar todo lo creado.
//
// ORDEN RECOMENDADO:
//   testSetupDatos()
//   testCrearRecepcion()
//   testAgregarItemSinQaqc()
//   testAgregarItemConQaqc()
//   testAgregarItemSeriado()
//   testQaqcAprobarItem()
//   testCierreAutomaticoRecepcion()
//   testDuplicadoRemito()
//   testDuplicadoSerie()
//   testLimpiar()
// ============================================================

// ── IDs compartidos entre tests (se populan en testSetupDatos) ──
// No editar manualmente — se guardan en Script Properties para
// persistir entre ejecuciones separadas.

function _testSetProp(key, val) {
  PropertiesService.getScriptProperties().setProperty('TEST_' + key, val);
}
function _testGetProp(key) {
  return PropertiesService.getScriptProperties().getProperty('TEST_' + key) || '';
}

// ── Usuarios simulados ───────────────────────────────────────
const U_ADMIN      = { email: 'test-admin@awp.test',      nombre: 'Test Admin',      perfil: 'Admin' };
const U_ALMACENERO = { email: 'test-almac@awp.test',      nombre: 'Test Almacenero', perfil: 'Almacenero' };
const U_QAQC       = { email: 'test-qaqc@awp.test',       nombre: 'Test QAQC',       perfil: 'QAQC' };
const U_MATCOORD   = { email: 'test-matcoord@awp.test',   nombre: 'Test MatCoord',   perfil: 'MatCoord' };

// ── Helpers de log ───────────────────────────────────────────
function _ok(test, msg)   { Logger.log('✅ ' + test + ': ' + msg); }
function _fail(test, msg) { Logger.log('❌ ' + test + ': ' + msg); }
function _info(msg)       { Logger.log('   ℹ ' + msg); }

function _assert(test, condicion, mensajeOk, mensajeFail) {
  if (condicion) {
    _ok(test, mensajeOk);
  } else {
    _fail(test, mensajeFail);
    throw new Error('ASSERT FAILED — ' + test + ': ' + mensajeFail);
  }
}

/** Ejecuta fn y verifica que lance un error cuyo mensaje incluye msgEsperado */
function _assertError(test, fn, msgEsperado) {
  try {
    fn();
    _fail(test, 'Se esperaba un error con "' + msgEsperado + '" pero no se lanzó ninguno');
    throw new Error('ASSERT FAILED — se esperaba error');
  } catch(e) {
    if (e.message.includes('ASSERT FAILED')) throw e; // re-lanzar falla de assert
    if (e.message.toLowerCase().includes(msgEsperado.toLowerCase())) {
      _ok(test, 'Error esperado recibido: "' + e.message + '"');
    } else {
      _fail(test, 'Error recibido ("' + e.message + '") no contiene "' + msgEsperado + '"');
      throw new Error('ASSERT FAILED — error inesperado');
    }
  }
}

// ============================================================
// 0. SETUP DE DATOS DE PRUEBA
// ============================================================

/**
 * Crea familia, ubicaciones, materiales y usuarios de prueba.
 * Guarda los IDs generados en Script Properties para que los
 * demás tests los puedan leer sin acoplarse entre sí.
 * Es seguro ejecutar más de una vez (idempotente).
 */
function testSetupDatos() {
  Logger.log('══════════════════════════════════════');
  Logger.log('  TEST SETUP — Creando datos de prueba');
  Logger.log('══════════════════════════════════════');

  // ── Familia de prueba ────────────────────────────────────
  let familiaId = _testGetProp('FAMILIA_ID');
  if (!familiaId) {
    const fam = familiasCreate(
      { codigo: 'TEST', nombre: 'Familia Test E2', descripcion: 'Pruebas Etapa 2' },
      U_ADMIN
    );
    familiaId = fam.familia_id;
    _testSetProp('FAMILIA_ID', familiaId);
    _ok('setup', 'Familia creada: ' + familiaId);
  } else {
    _info('Familia ya existe: ' + familiaId);
  }

  // ── Ubicaciones de prueba ────────────────────────────────
  let ubicAlmacenId  = _testGetProp('UBIC_ALMACEN_ID');
  let ubicSegregadoId = _testGetProp('UBIC_SEGREGADO_ID');

  if (!ubicAlmacenId) {
    const u = ubicacionesCreate(
      { codigo: 'TEST-ALM', nombre: 'Almacén Test E2', tipo: 'ALMACEN', descripcion: 'Prueba' },
      U_ADMIN
    );
    ubicAlmacenId = u.ubicacion_id;
    _testSetProp('UBIC_ALMACEN_ID', ubicAlmacenId);
    _ok('setup', 'Ubicación ALMACEN creada: ' + ubicAlmacenId);
  } else {
    _info('Ubicación ALMACEN ya existe: ' + ubicAlmacenId);
  }

  if (!ubicSegregadoId) {
    const u = ubicacionesCreate(
      { codigo: 'TEST-SEG', nombre: 'Segregados Test E2', tipo: 'SEGREGADO', descripcion: 'Prueba' },
      U_ADMIN
    );
    ubicSegregadoId = u.ubicacion_id;
    _testSetProp('UBIC_SEGREGADO_ID', ubicSegregadoId);
    _ok('setup', 'Ubicación SEGREGADO creada: ' + ubicSegregadoId);
  } else {
    _info('Ubicación SEGREGADO ya existe: ' + ubicSegregadoId);
  }

  // ── Material sin QAQC y sin serie ───────────────────────
  let matSimpleId = _testGetProp('MAT_SIMPLE_ID');
  if (!matSimpleId) {
    const m = materialesCreate({
      codigo_externo: 'TEST-MAT-SIMPLE',
      descripcion:    'Material Test Simple (sin QAQC, sin serie)',
      familia_id:     familiaId,
      ownership:      'contractor-furnished',
      unidad:         'UN',
      stock_minimo:   5,
      serie:          false,
      qaqc:           false,
      activo:         true,
    }, U_ADMIN);
    matSimpleId = m.material_id;
    _testSetProp('MAT_SIMPLE_ID', matSimpleId);
    _ok('setup', 'Material simple creado: ' + matSimpleId);
  } else {
    _info('Material simple ya existe: ' + matSimpleId);
  }

  // ── Material con QAQC, sin serie ────────────────────────
  let matQaqcId = _testGetProp('MAT_QAQC_ID');
  if (!matQaqcId) {
    const m = materialesCreate({
      codigo_externo: 'TEST-MAT-QAQC',
      descripcion:    'Material Test QAQC (con QAQC, sin serie)',
      familia_id:     familiaId,
      ownership:      'contractor-furnished',
      unidad:         'UN',
      stock_minimo:   0,
      serie:          false,
      qaqc:           true,
      activo:         true,
    }, U_ADMIN);
    matQaqcId = m.material_id;
    _testSetProp('MAT_QAQC_ID', matQaqcId);
    _ok('setup', 'Material QAQC creado: ' + matQaqcId);
  } else {
    _info('Material QAQC ya existe: ' + matQaqcId);
  }

  // ── Material seriado (con serie y con QAQC) ──────────────
  let matSerieId = _testGetProp('MAT_SERIE_ID');
  if (!matSerieId) {
    const m = materialesCreate({
      codigo_externo: 'TEST-MAT-SERIE',
      descripcion:    'Material Test Seriado (serie=true, qaqc=true)',
      familia_id:     familiaId,
      ownership:      'contractor-furnished',
      unidad:         'UN',
      stock_minimo:   0,
      serie:          true,
      qaqc:           true,
      activo:         true,
    }, U_ADMIN);
    matSerieId = m.material_id;
    _testSetProp('MAT_SERIE_ID', matSerieId);
    _ok('setup', 'Material seriado creado: ' + matSerieId);
  } else {
    _info('Material seriado ya existe: ' + matSerieId);
  }

  Logger.log('══════════════════════════════════════');
  Logger.log('  Setup completo. IDs guardados:');
  Logger.log('  FAMILIA_ID:        ' + _testGetProp('FAMILIA_ID'));
  Logger.log('  UBIC_ALMACEN_ID:   ' + _testGetProp('UBIC_ALMACEN_ID'));
  Logger.log('  UBIC_SEGREGADO_ID: ' + _testGetProp('UBIC_SEGREGADO_ID'));
  Logger.log('  MAT_SIMPLE_ID:     ' + _testGetProp('MAT_SIMPLE_ID'));
  Logger.log('  MAT_QAQC_ID:       ' + _testGetProp('MAT_QAQC_ID'));
  Logger.log('  MAT_SERIE_ID:      ' + _testGetProp('MAT_SERIE_ID'));
  Logger.log('══════════════════════════════════════');
}

// ============================================================
// 1. CREAR RECEPCIÓN
// ============================================================

function testCrearRecepcion() {
  Logger.log('── TEST: testCrearRecepcion ──────────────');

  const rec = recepcionesCreate({
    fecha:                  '2026-04-27',
    remito_numero:          'REM-TEST-001',
    remito_fecha:           '2026-04-26',
    proveedor_razon_social: 'Proveedor Test SA',
    observaciones:          'Recepción de prueba Etapa 2',
  }, U_ALMACENERO);

  _assert('testCrearRecepcion', rec.recepcion_id.startsWith('REC-'),
    'ID generado correctamente: ' + rec.recepcion_id,
    'ID no tiene formato REC-YYYY-NNNN: ' + rec.recepcion_id
  );
  _assert('testCrearRecepcion', rec.estado === 'BORRADOR',
    'Estado inicial = BORRADOR',
    'Estado incorrecto: ' + rec.estado
  );
  _assert('testCrearRecepcion', rec.almacenero_email === U_ALMACENERO.email,
    'almacenero_email asignado correctamente',
    'almacenero_email incorrecto: ' + rec.almacenero_email
  );

  _testSetProp('REC_ID', rec.recepcion_id);
  _info('recepcion_id guardado: ' + rec.recepcion_id);
}

// ============================================================
// 2. AGREGAR ÍTEM SIN QAQC
// ============================================================

function testAgregarItemSinQaqc() {
  Logger.log('── TEST: testAgregarItemSinQaqc ──────────');

  const recepcion_id = _testGetProp('REC_ID');
  _assert('testAgregarItemSinQaqc', !!recepcion_id,
    'recepcion_id disponible',
    'Ejecutá testCrearRecepcion() primero'
  );

  const matSimpleId = _testGetProp('MAT_SIMPLE_ID');
  const ubicId      = _testGetProp('UBIC_ALMACEN_ID');

  // Stock antes
  const stockAntes = _testGetStock(matSimpleId, ubicId);
  _info('Stock antes: ' + stockAntes);

  const resultado = itemsCreate(recepcion_id, {
    material_id:       matSimpleId,
    ubicacion_id:      ubicId,
    cantidad_remitida: 10,
    cantidad_recibida: 10,
  }, U_ALMACENERO);

  _assert('testAgregarItemSinQaqc', resultado.estado_qaqc === 'NO_REQUIERE',
    'estado_qaqc = NO_REQUIERE (sin QAQC)',
    'estado_qaqc incorrecto: ' + resultado.estado_qaqc
  );

  // Verificar que la cabecera pasó a EN_PROCESO
  const rec = recepcionesGet(recepcion_id, U_ALMACENERO);
  _assert('testAgregarItemSinQaqc', rec.estado === 'EN_PROCESO',
    'Cabecera pasó a EN_PROCESO',
    'Estado cabecera incorrecto: ' + rec.estado
  );

  // Verificar stock actualizado
  const stockDespues = _testGetStock(matSimpleId, ubicId);
  _info('Stock después: ' + stockDespues);
  _assert('testAgregarItemSinQaqc', stockDespues >= stockAntes + 10,
    'STOCK incrementado en 10',
    'STOCK no se actualizó. Antes: ' + stockAntes + ', Después: ' + stockDespues
  );

  _testSetProp('ITEM_SIMPLE_ID', resultado.item_id);
  _info('item_id guardado: ' + resultado.item_id);
}

// ============================================================
// 3. AGREGAR ÍTEM CON QAQC
// ============================================================

function testAgregarItemConQaqc() {
  Logger.log('── TEST: testAgregarItemConQaqc ──────────');

  const recepcion_id = _testGetProp('REC_ID');
  const matQaqcId    = _testGetProp('MAT_QAQC_ID');
  const ubicId       = _testGetProp('UBIC_ALMACEN_ID');

  const stockAntes = _testGetStock(matQaqcId, ubicId);
  _info('Stock antes: ' + stockAntes);

  const resultado = itemsCreate(recepcion_id, {
    material_id:       matQaqcId,
    ubicacion_id:      ubicId,
    cantidad_remitida: 5,
    cantidad_recibida: 5,
  }, U_ALMACENERO);

  _assert('testAgregarItemConQaqc', resultado.estado_qaqc === 'PENDIENTE_QAQC',
    'estado_qaqc = PENDIENTE_QAQC',
    'estado_qaqc incorrecto: ' + resultado.estado_qaqc
  );

  // Stock NO debe haberse actualizado todavía
  const stockDespues = _testGetStock(matQaqcId, ubicId);
  _assert('testAgregarItemConQaqc', stockDespues === stockAntes,
    'STOCK no se modificó (esperando QAQC)',
    'STOCK se modificó sin QAQC. Antes: ' + stockAntes + ', Después: ' + stockDespues
  );

  _testSetProp('ITEM_QAQC_ID', resultado.item_id);
  _info('item_id QAQC guardado: ' + resultado.item_id);
}

// ============================================================
// 4. AGREGAR ÍTEM SERIADO
// ============================================================

function testAgregarItemSeriado() {
  Logger.log('── TEST: testAgregarItemSeriado ──────────');

  const recepcion_id = _testGetProp('REC_ID');
  const matSerieId   = _testGetProp('MAT_SERIE_ID');
  const ubicId       = _testGetProp('UBIC_ALMACEN_ID');

  const resultado = itemsCreate(recepcion_id, {
    material_id:       matSerieId,
    ubicacion_id:      ubicId,
    cantidad_remitida: 3,
    cantidad_recibida: 3,
    series:            ['SN-TEST-001', 'SN-TEST-002', 'SN-TEST-003'],
  }, U_ALMACENERO);

  _assert('testAgregarItemSeriado', resultado.estado_qaqc === 'PENDIENTE_QAQC',
    'estado_qaqc = PENDIENTE_QAQC',
    'estado_qaqc incorrecto: ' + resultado.estado_qaqc
  );
  _assert('testAgregarItemSeriado', resultado.series_creadas === 3,
    '3 series creadas en MATERIAL_SERIES',
    'series_creadas incorrecto: ' + resultado.series_creadas
  );

  // Verificar que las series existen en la sheet
  const seriesEnSheet = _testGetSeriesPorItem(resultado.item_id);
  _assert('testAgregarItemSeriado', seriesEnSheet.length === 3,
    '3 filas en MATERIAL_SERIES para este ítem',
    'Filas en MATERIAL_SERIES: ' + seriesEnSheet.length
  );
  _assert('testAgregarItemSeriado', seriesEnSheet[0].estado === 'PENDIENTE_QAQC',
    'Estado inicial de series = PENDIENTE_QAQC',
    'Estado de serie incorrecto: ' + seriesEnSheet[0].estado
  );

  _testSetProp('ITEM_SERIE_ID', resultado.item_id);
  _info('item_id seriado guardado: ' + resultado.item_id);
}

// ============================================================
// 5. QAQC APRUEBA ÍTEM
// ============================================================

function testQaqcAprobarItem() {
  Logger.log('── TEST: testQaqcAprobarItem ─────────────');

  const item_id  = _testGetProp('ITEM_QAQC_ID');
  const matQaqcId = _testGetProp('MAT_QAQC_ID');
  const ubicId    = _testGetProp('UBIC_ALMACEN_ID');

  _assert('testQaqcAprobarItem', !!item_id,
    'item_id disponible',
    'Ejecutá testAgregarItemConQaqc() primero'
  );

  const stockAntes = _testGetStock(matQaqcId, ubicId);
  _info('Stock antes de aprobar: ' + stockAntes);

  const resultado = itemsAprobar(item_id, U_QAQC);

  _assert('testQaqcAprobarItem', resultado.estado_qaqc === 'APROBADO',
    'estado_qaqc = APROBADO',
    'estado_qaqc incorrecto: ' + resultado.estado_qaqc
  );

  // Stock debe haberse actualizado
  const stockDespues = _testGetStock(matQaqcId, ubicId);
  _info('Stock después de aprobar: ' + stockDespues);
  _assert('testQaqcAprobarItem', stockDespues >= stockAntes + 5,
    'STOCK incrementado en 5 al aprobar',
    'STOCK no se actualizó. Antes: ' + stockAntes + ', Después: ' + stockDespues
  );

  // Intentar aprobar de nuevo — debe fallar
  _assertError('testQaqcAprobarItem-dobleAprobacion',
    () => itemsAprobar(item_id, U_QAQC),
    'No se puede aprobar'
  );
}

// ============================================================
// 6. CIERRE AUTOMÁTICO DE RECEPCIÓN
// ============================================================

/**
 * Aprueba los ítems pendientes restantes (QAQC + seriado)
 * y verifica que la recepción se cierre automáticamente.
 */
function testCierreAutomaticoRecepcion() {
  Logger.log('── TEST: testCierreAutomaticoRecepcion ───');

  const recepcion_id  = _testGetProp('REC_ID');
  const itemSerieId   = _testGetProp('ITEM_SERIE_ID');

  // Aprobar el ítem seriado (el QAQC ya fue aprobado en el test anterior)
  const resAprobacion = itemsAprobar(itemSerieId, U_QAQC);
  _assert('testCierreAutomaticoRecepcion', resAprobacion.estado_qaqc === 'APROBADO',
    'Ítem seriado aprobado',
    'No se pudo aprobar el ítem seriado'
  );

  // Verificar que las series pasaron a EN_ALMACEN
  const series = _testGetSeriesPorItem(itemSerieId);
  _assert('testCierreAutomaticoRecepcion', series.every(s => s.estado === 'EN_ALMACEN'),
    'Todas las series en EN_ALMACEN',
    'Alguna serie no está en EN_ALMACEN: ' + JSON.stringify(series.map(s => s.estado))
  );

  // Verificar cierre automático de la recepción
  const rec = recepcionesGet(recepcion_id, U_ALMACENERO);
  _assert('testCierreAutomaticoRecepcion', rec.estado === 'CERRADA',
    'Recepción cerrada automáticamente ✓',
    'La recepción no se cerró. Estado actual: ' + rec.estado
  );

  _info('Recepción ' + recepcion_id + ' cerrada correctamente');
}

// ============================================================
// 7. VALIDACIONES DE NEGOCIO
// ============================================================

/**
 * Verifica que el sistema rechace correctamente los casos inválidos.
 */
function testValidaciones() {
  Logger.log('── TEST: testValidaciones ────────────────');

  const ubicId    = _testGetProp('UBIC_ALMACEN_ID');
  const matSimpleId = _testGetProp('MAT_SIMPLE_ID');

  // A) Remito duplicado
  _assertError('testDuplicadoRemito',
    () => recepcionesCreate({
      fecha:                  '2026-04-27',
      remito_numero:          'REM-TEST-001',  // ya existe
      proveedor_razon_social: 'Otro Proveedor',
    }, U_ALMACENERO),
    'Ya existe'
  );

  // B) Serie duplicada para el mismo material
  const recNueva = recepcionesCreate({
    fecha:                  '2026-04-27',
    remito_numero:          'REM-TEST-002',
    proveedor_razon_social: 'Proveedor B SA',
  }, U_ALMACENERO);

  const matSerieId = _testGetProp('MAT_SERIE_ID');
  _assertError('testDuplicadoSerie',
    () => itemsCreate(recNueva.recepcion_id, {
      material_id:       matSerieId,
      ubicacion_id:      ubicId,
      cantidad_remitida: 1,
      cantidad_recibida: 1,
      series:            ['SN-TEST-001'],  // ya existe de la recepción anterior
    }, U_ALMACENERO),
    'ya existentes'
  );
  _testSetProp('REC_TEMP_ID', recNueva.recepcion_id);

  // C) Cantidad de series no coincide con cantidad_recibida
  _assertError('testCantidadSeriesMismatch',
    () => itemsCreate(recNueva.recepcion_id, {
      material_id:       matSerieId,
      ubicacion_id:      ubicId,
      cantidad_remitida: 3,
      cantidad_recibida: 3,
      series:            ['SN-NUEVO-A', 'SN-NUEVO-B'],  // solo 2, se esperan 3
    }, U_ALMACENERO),
    'no coincide'
  );

  // D) Perfil sin permiso — Planner no puede crear recepción
  _assertError('testPerfilSinPermiso',
    () => recepcionesCreate({
      fecha:                  '2026-04-27',
      remito_numero:          'REM-TEST-003',
      proveedor_razon_social: 'Proveedor C',
    }, { email: 'planner@test.com', perfil: 'Planner' }),
    'Permiso denegado'
  );

  // E) Agregar ítem a recepción cerrada
  const recCerrada = _testGetProp('REC_ID');
  _assertError('testItemEnRecepcionCerrada',
    () => itemsCreate(recCerrada, {
      material_id:       matSimpleId,
      ubicacion_id:      ubicId,
      cantidad_recibida: 1,
    }, U_ALMACENERO),
    'cerrada'
  );

  Logger.log('   Todas las validaciones de negocio pasaron ✓');
}

// ============================================================
// 8. LIMPIEZA
// ============================================================

/**
 * Borra lógicamente todos los datos creados por los tests.
 * Limpia también las Script Properties de test.
 * IMPORTANTE: ejecutar al final, no durante las pruebas.
 */
function testLimpiar() {
  Logger.log('── TEST: testLimpiar ─────────────────────');

  const props = PropertiesService.getScriptProperties().getProperties();
  const keys  = Object.keys(props).filter(k => k.startsWith('TEST_'));

  _info('Script Properties de test a limpiar: ' + keys.length);

  // Borrar las Script Properties
  keys.forEach(k => PropertiesService.getScriptProperties().deleteProperty(k));
  _ok('testLimpiar', 'Script Properties de test eliminadas');

  // Nota: los datos en las sheets quedan con borrado lógico.
  // Para un borrado físico durante desarrollo podés borrar las filas
  // manualmente desde el Sheet filtrando por email test-*@awp.test
  _info('Datos en sheets NO borrados físicamente — filtrá por email "awp.test" para limpiarlos manualmente si es necesario');
}

// ============================================================
// 9. EJECUTAR SUITE COMPLETA
// ============================================================

/**
 * Ejecuta todos los tests en orden.
 * Si uno falla, los siguientes que dependen de él también fallarán.
 */
function testRunAll() {
  Logger.log('══════════════════════════════════════════');
  Logger.log('  SUITE COMPLETA — AWP Inventory Etapa 2  ');
  Logger.log('══════════════════════════════════════════');

  const tests = [
    testSetupDatos,
    testCrearRecepcion,
    testAgregarItemSinQaqc,
    testAgregarItemConQaqc,
    testAgregarItemSeriado,
    testQaqcAprobarItem,
    testCierreAutomaticoRecepcion,
    testValidaciones,
  ];

  let pasados = 0;
  let fallidos = 0;

  tests.forEach(fn => {
    try {
      fn();
      pasados++;
    } catch(e) {
      fallidos++;
      Logger.log('💥 Abortado en ' + fn.name + ': ' + e.message);
    }
  });

  Logger.log('══════════════════════════════════════════');
  Logger.log('  RESULTADO: ' + pasados + ' pasados / ' + fallidos + ' fallidos');
  Logger.log('══════════════════════════════════════════');

  if (fallidos === 0) {
    Logger.log('🎉 Todos los tests pasaron. Etapa 2 backend OK.');
  } else {
    Logger.log('⚠️  Hay fallos — revisar logs arriba.');
  }
}

// ============================================================
// HELPERS INTERNOS DE TEST (no son parte del sistema)
// ============================================================

/** Lee cantidad_disponible de STOCK para un material+ubicación */
function _testGetStock(material_id, ubicacion_id) {
  const sheet = getSheet(SHEETS.STOCK);
  const rows  = sheetToObjects(sheet);
  const row   = rows.find(r => r.material_id === material_id && r.ubicacion_id === ubicacion_id);
  return row ? Number(row.cantidad_disponible) : 0;
}

/** Lee series de MATERIAL_SERIES por recepcion_item_id */
function _testGetSeriesPorItem(recepcion_item_id) {
  const sheet = getSheet(SHEETS.MATERIAL_SERIES);
  return sheetToObjects(sheet).filter(r => r.recepcion_item_id === recepcion_item_id && !r.borrado);
}
