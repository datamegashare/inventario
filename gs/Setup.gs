// ============================================================
// Setup.gs — Inicialización del Spreadsheet (ejecutar 1 sola vez)
// ============================================================

/**
 * INSTRUCCIONES:
 * 1. Ejecutar setupSpreadsheet() desde el editor de Apps Script
 * 2. Configurar las Script Properties:
 *    - SPREADSHEET_ID: ID del Google Sheet
 *    - CLIENT_ID: OAuth Client ID de Google Cloud Console
 *    - CLIENT_SECRET: OAuth Client Secret
 * 3. Publicar como Web App (ejecutar como yo, acceso a cualquier usuario)
 */

function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Definir estructura de cada hoja
  const sheetDefs = [
    {
      name: SHEETS.CONFIG,
      headers: ['clave', 'valor', 'descripcion', 'actualizado_en', 'actualizado_por'],
      seedData: [
        ['PROYECTO_NOMBRE', 'AWP Inventory', 'Nombre del proyecto', now(), 'setup'],
        ['FRONTEND_URL', 'https://tuorg.github.io/awp-inventario', 'URL del frontend', now(), 'setup'],
        ['VERSION', '1.0.0', 'Versión del sistema', now(), 'setup'],
        ['ETAPA', '1', 'Etapa de desarrollo activa', now(), 'setup'],
        ['TIMEZONE', 'America/Argentina/Buenos_Aires', 'Zona horaria', now(), 'setup'],
      ]
    },
    {
      name: SHEETS.USUARIOS,
      headers: USUARIOS_HEADERS,
      seedData: [
        // Usuario Admin inicial — cambiar email al desplegar
        [generateId(), 'admin@tuempresa.com', 'Administrador', 'Admin', '', true, false, '', '', now(), now()]
      ]
    },
    {
      name: SHEETS.FAMILIAS,
      headers: FAMILIAS_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.UBICACIONES,
      headers: UBICACIONES_HEADERS,
      seedData: [
        [generateId(), 'ALM-01', 'Almacén Principal', 'ALMACEN', 'Almacén principal del proyecto', false, '', '', now(), now()],
        [generateId(), 'PLY-01', 'Playa de Materiales', 'PLAYA',   'Playa exterior', false, '', '', now(), now()],
        [generateId(), 'SEG-01', 'Zona Segregados',    'SEGREGADO','Materiales en cuarentena', false, '', '', now(), now()],
        [generateId(), 'DEV-01', 'Área Devoluciones',  'DEVOLUCION','Devoluciones pendientes', false, '', '', now(), now()],
      ]
    },
    {
      name: SHEETS.MATERIALES,
      headers: MATERIALES_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.HISTORIAL_CAMBIOS,
      headers: ['historial_id', 'tabla', 'registro_id', 'campo', 'valor_anterior', 'valor_nuevo', 'usuario', 'timestamp'],
      seedData: []
    }
  ];

  sheetDefs.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      Logger.log('Creada hoja: ' + def.name);
    } else {
      Logger.log('Hoja ya existe: ' + def.name);
    }

    // Establecer headers solo si la hoja está vacía
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(def.headers);
      def.seedData.forEach(row => sheet.appendRow(row));

      // Formato del header
      const headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setBackground('#1a4a7a');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  Logger.log('✅ Setup completado. Revisa y actualiza el email del Admin en USUARIOS.');
  return 'Setup completado exitosamente';
}

/**
 * Utilidad para agregar el primer usuario Admin manualmente desde el editor
 */
function addInitialAdmin(email, nombre) {
  const sheet = getSheet(SHEETS.USUARIOS);
  const rows  = sheetToObjects(sheet);

  if (rows.find(r => r.email === email)) {
    Logger.log('El usuario ya existe: ' + email);
    return;
  }

  const admin = {
    usuario_id:       generateId(),
    email:            email,
    nombre:           nombre || 'Administrador',
    perfil:           'Admin',
    supervisor_email: '',
    activo:           true,
    borrado:          false,
    borrado_por:      '',
    borrado_fecha:    '',
    creado_en:        now(),
    actualizado_en:   now()
  };

  appendRow(sheet, USUARIOS_HEADERS, admin);
  Logger.log('Admin creado: ' + email);
}

/**
 * Test de la API — ejecutar desde el editor para verificar conectividad
 */
function testApi() {
  const result = materialesList(null, { perfil: 'Admin', email: 'test@test.com' });
  Logger.log('materialesList: ' + JSON.stringify(result));
}

function crearAdmin() {
  addInitialAdmin('datamegashare@gmail.com', 'Administrador');
}

// ============================================================
// ETAPA 2 — Setup de sheets nuevas
// Ejecutar setupEtapa2() UNA SOLA VEZ desde el editor de GAS,
// con Etapa 1 ya funcionando en producción.
// Es idempotente: si una hoja ya existe, la deja intacta.
// ============================================================

// ── Headers de las tablas nuevas ────────────────────────────

const RECEPCIONES_HEADERS = [
  'recepcion_id', 'fecha', 'remito_numero', 'remito_fecha',
  'proveedor_razon_social', 'almacenero_email', 'estado', 'observaciones',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

// estados: BORRADOR → EN_PROCESO → CERRADA

const RECEPCIONES_ITEMS_HEADERS = [
  'item_id', 'recepcion_id', 'material_id', 'cantidad_remitida',
  'cantidad_recibida', 'ubicacion_id', 'estado_qaqc', 'ncr_id',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

// estado_qaqc: PENDIENTE_QAQC | NO_REQUIERE | APROBADO | NCR | ACEPTADO | RECHAZADO_DEFINITIVO

const MATERIAL_SERIES_HEADERS = [
  'serie_id', 'material_id', 'numero_serie', 'codigo_barras',
  'estado', 'ubicacion_id', 'recepcion_item_id',
  'salida_item_id', 'devolucion_item_id', 'ncr_id',
  'borrado', 'borrado_por', 'borrado_fecha', 'creado_en', 'actualizado_en'
];

// estado: EN_ALMACEN | RESERVADO | EN_CAMPO | NCR | SEGREGADO | DEVUELTO_INSPECCION

const STOCK_HEADERS = [
  'stock_id', 'material_id', 'ubicacion_id',
  'cantidad_disponible', 'cantidad_reservada', 'cantidad_bloqueada',
  'ultima_actualizacion'
];

const NCR_HEADERS = [
  'ncr_id', 'item_id', 'serie_id', 'material_id',
  'descripcion', 'estado', 'creado_por', 'asignado_a',
  'resolucion', 'borrado', 'borrado_por', 'borrado_fecha',
  'creado_en', 'actualizado_en'
];

// estado NCR: ABIERTA → EN_REVISION → CERRADA_ACEPTADA | CERRADA_RECHAZADA

const MOVIMIENTOS_HEADERS = [
  'movimiento_id', 'tipo', 'material_id', 'descripcion',
  'usuario', 'timestamp', 'meta'
];

const NOTIFICACIONES_CONFIG_HEADERS = [
  'notif_id', 'evento', 'activo', 'perfiles_destino',
  'emails_adicionales', 'asunto_template', 'frecuencia',
  'borrado', 'borrado_por', 'borrado_fecha'
];

// ── Función principal ────────────────────────────────────────

/**
 * Crea las 7 sheets nuevas de Etapa 2.
 * Ejecutar desde el editor de GAS: Ejecutar → setupEtapa2
 * No toca ninguna sheet existente de Etapa 1.
 */
function setupEtapa2() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sheetDefs = [
    {
      name: SHEETS.RECEPCIONES,
      headers: RECEPCIONES_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.RECEPCIONES_ITEMS,
      headers: RECEPCIONES_ITEMS_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.MATERIAL_SERIES,
      headers: MATERIAL_SERIES_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.STOCK,
      headers: STOCK_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.NCR,
      headers: NCR_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.MOVIMIENTOS,
      headers: MOVIMIENTOS_HEADERS,
      seedData: []
    },
    {
      name: SHEETS.NOTIFICACIONES_CONFIG,
      headers: NOTIFICACIONES_CONFIG_HEADERS,
      // Seed: las 3 alertas activas de v1 precargadas y desactivadas
      // El Admin las activa desde el panel cuando esté listo para operar.
      seedData: [
        [generateId(), 'NCR_NUEVA',        false, 'MatCoord,QAQC', '', '[NCR] {ncr_id} — {material}',       'INMEDIATO', false, '', ''],
        [generateId(), 'STOCK_MINIMO',     false, 'MatCoord',      '', '[STOCK] Mínimo alcanzado: {material}','DIARIO',    false, '', ''],
        [generateId(), 'DEVOLUCION_CAMPO', false, 'MatCoord',      '', '[DEV] Devolución de campo: {material}','INMEDIATO', false, '', ''],
      ]
    },
  ];

  let creadas = 0;
  let existentes = 0;

  sheetDefs.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (sheet) {
      Logger.log('⏭ Ya existe — sin cambios: ' + def.name);
      existentes++;
      return;
    }

    sheet = ss.insertSheet(def.name);
    sheet.appendRow(def.headers);
    def.seedData.forEach(row => sheet.appendRow(row));

    // Formato del header — mismo estilo que Etapa 1
    const headerRange = sheet.getRange(1, 1, 1, def.headers.length);
    headerRange.setBackground('#1a4a7a');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);

    Logger.log('✅ Creada: ' + def.name + ' (' + def.headers.length + ' columnas)');
    creadas++;
  });

  const msg = `setupEtapa2 completado — ${creadas} hojas creadas, ${existentes} ya existían.`;
  Logger.log(msg);
  return msg;
}
