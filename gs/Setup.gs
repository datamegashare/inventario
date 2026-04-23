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
        [generateId(), 'DEV-01', 'Área Devoluciones',  'DEVOLUCION','Devoluciones pendientes', false, '', '', now(), now()]
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