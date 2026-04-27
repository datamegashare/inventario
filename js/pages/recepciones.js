// ============================================================
// pages/recepciones.js — Recepción de Remitos  (Etapa 2)
//
// Vistas:
//   #/recepciones          → lista de recepciones
//   #/recepciones/nueva    → formulario nueva recepción
//   #/recepciones/:id      → detalle + carga de ítems
// ============================================================

Pages.recepciones = async function(params) {
  // Sub-rutas por parámetro
  if (params?.id === 'nueva') return _recepcionesNueva();
  if (params?.id)             return _recepcionDetalle(params.id);
  return _recepcionesList();
};

// ─── LISTA ───────────────────────────────────────────────────

async function _recepcionesList() {
  renderLayout('Recepciones', 'recepciones');
  const main = document.getElementById('page-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Recepciones</h2>
        <p class="page-sub">Registro de remitos y recepción de materiales</p>
      </div>
      <div class="page-actions">
        ${Auth.can('recepciones.create') ? `
          <button class="btn btn-primary" id="btn-nueva">+ Nueva Recepción</button>
        ` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <input type="search" id="search-q" class="input" placeholder="Remito, proveedor..." style="flex:2">
      <select id="filter-estado" class="input">
        <option value="">Todos los estados</option>
        <option value="BORRADOR">Borrador</option>
        <option value="EN_PROCESO">En proceso</option>
        <option value="CERRADA">Cerrada</option>
      </select>
      <button class="btn btn-ghost" id="btn-filter">Filtrar</button>
    </div>

    <div id="rec-table"><div class="spinner-wrap"><span class="spinner"></span> Cargando recepciones…</div></div>
  `;

  document.getElementById('btn-nueva')?.addEventListener('click', () => {
    Router.navigate('recepciones/nueva');
  });

  let allData = [];

  try {
    const raw = await API.recepciones.list({});
    allData = Array.isArray(raw) ? raw : (raw.data || []);
    _renderRecList(allData);
  } catch(err) {
    document.getElementById('rec-table').innerHTML =
      `<div class="alert alert-error">Error cargando recepciones: ${UI.escHtml(err.message)}</div>`;
  }

  document.getElementById('btn-filter')?.addEventListener('click', () => {
    const q      = document.getElementById('search-q').value.toLowerCase();
    const estado = document.getElementById('filter-estado').value;
    const filtered = allData.filter(r => {
      if (estado && r.estado !== estado) return false;
      if (q && !`${r.recepcion_id} ${r.remito_numero} ${r.proveedor_razon_social}`.toLowerCase().includes(q)) return false;
      return true;
    });
    _renderRecList(filtered);
  });

  document.getElementById('search-q')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-filter').click();
  });
}

function _renderRecList(data) {
  UI.table({
    container: document.getElementById('rec-table'),
    data,
    emptyMsg: 'No hay recepciones registradas.',
    columns: [
      { key: 'recepcion_id',          label: 'Nro.',          width: '140px' },
      { key: 'remito_numero',          label: 'Remito',        width: '140px' },
      { key: 'fecha',                  label: 'Fecha',         width: '100px' },
      { key: 'proveedor_razon_social', label: 'Proveedor' },
      { key: 'almacenero_email',       label: 'Almacenero',    width: '180px' },
      { key: 'estado', label: 'Estado', width: '110px',
        render: v => _badgeEstadoRec(v) },
    ],
    actions: [
      { label: 'Ver / Cargar ítems', icon: '→', class: 'btn-edit',
        onClick: row => Router.navigate('recepciones/' + row.recepcion_id) },
    ],
  });
}

// ─── NUEVA RECEPCIÓN ─────────────────────────────────────────

async function _recepcionesNueva() {
  renderLayout('Nueva Recepción', 'recepciones');
  const main = document.getElementById('page-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Nueva Recepción</h2>
        <p class="page-sub">Registrá el remito del proveedor</p>
      </div>
      <div class="page-actions">
        <a href="#/recepciones" class="btn btn-ghost">← Volver</a>
      </div>
    </div>

    <div class="card" style="max-width:640px">
      <form id="form-rec" class="form-grid">
        <div class="field">
          <label>Número de Remito <span class="required">*</span></label>
          <input type="text" name="remito_numero" class="input" placeholder="Ej: REM-2026-0042" required>
        </div>
        <div class="field">
          <label>Fecha de Recepción <span class="required">*</span></label>
          <input type="date" name="fecha" class="input" value="${new Date().toISOString().slice(0,10)}" required>
        </div>
        <div class="field">
          <label>Fecha del Remito</label>
          <input type="date" name="remito_fecha" class="input">
        </div>
        <div class="field">
          <label>Proveedor / Razón Social <span class="required">*</span></label>
          <input type="text" name="proveedor_razon_social" class="input" placeholder="Ej: Proveedor SA" required>
        </div>
        <div class="field field-full">
          <label>Observaciones</label>
          <textarea name="observaciones" class="input input-textarea" rows="2"
            placeholder="Condiciones del remito, notas generales…"></textarea>
        </div>
      </form>
      <div class="form-actions">
        <a href="#/recepciones" class="btn btn-ghost">Cancelar</a>
        <button class="btn btn-primary" id="btn-crear">Crear Recepción</button>
      </div>
    </div>
  `;

  document.getElementById('btn-crear').addEventListener('click', async () => {
    const form = document.getElementById('form-rec');
    const data = UI.formData(form);

    if (!data.remito_numero?.trim())          { UI.toast('Número de remito requerido', 'error'); return; }
    if (!data.fecha)                           { UI.toast('Fecha requerida', 'error'); return; }
    if (!data.proveedor_razon_social?.trim())  { UI.toast('Proveedor requerido', 'error'); return; }

    const btn = document.getElementById('btn-crear');
    btn.disabled = true; btn.textContent = 'Creando…';

    try {
      const rec = await API.recepciones.create(data);
      UI.toast('Recepción ' + rec.recepcion_id + ' creada', 'success');
      Router.navigate('recepciones/' + rec.recepcion_id);
    } catch(err) {
      UI.toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Crear Recepción';
    }
  });
}

// ─── DETALLE + CARGA DE ÍTEMS ────────────────────────────────

async function _recepcionDetalle(recepcion_id) {
  renderLayout('Detalle Recepción', 'recepciones');
  const main = document.getElementById('page-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title" id="rec-titulo">Recepción</h2>
        <p class="page-sub" id="rec-subtitulo"></p>
      </div>
      <div class="page-actions">
        <a href="#/recepciones" class="btn btn-ghost">← Volver</a>
      </div>
    </div>

    <div id="rec-info"><div class="spinner-wrap"><span class="spinner"></span> Cargando…</div></div>
    <div id="items-section" style="display:none">
      <div class="section-header">
        <h3>Ítems del Remito</h3>
        <div id="btn-add-item-wrap"></div>
      </div>
      <div id="items-table"><div class="spinner-wrap"><span class="spinner"></span></div></div>
    </div>
  `;

  let rec, materiales, ubicaciones;

  try {
    [rec, materiales, ubicaciones] = await Promise.all([
      API.recepciones.get(recepcion_id),
      API.materiales.list({}),
      API.ubicaciones.list(),
    ]);

    materiales = Array.isArray(materiales) ? materiales : (materiales.data || []);
    ubicaciones = Array.isArray(ubicaciones) ? ubicaciones : (ubicaciones.data || []);
    const matMap  = Object.fromEntries(materiales.map(m => [m.material_id, m]));
    const ubicMap = Object.fromEntries(ubicaciones.map(u => [u.ubicacion_id, u]));

    // Info cabecera
    document.getElementById('rec-titulo').textContent = rec.recepcion_id;
    document.getElementById('rec-subtitulo').textContent =
      `${rec.proveedor_razon_social} — Remito: ${rec.remito_numero} — ${rec.fecha}`;

    document.getElementById('rec-info').innerHTML = `
      <div class="info-chips">
        <span class="info-chip"><strong>Estado:</strong> ${_badgeEstadoRec(rec.estado)}</span>
        <span class="info-chip"><strong>Almacenero:</strong> ${UI.escHtml(rec.almacenero_email)}</span>
        ${rec.observaciones ? `<span class="info-chip"><strong>Obs:</strong> ${UI.escHtml(rec.observaciones)}</span>` : ''}
      </div>
    `;

    // Sección de ítems
    document.getElementById('items-section').style.display = '';

    // Botón agregar ítem — solo si la recepción no está cerrada
    if (rec.estado !== 'CERRADA' && Auth.can('items.create')) {
      document.getElementById('btn-add-item-wrap').innerHTML =
        `<button class="btn btn-primary" id="btn-add-item">+ Agregar Ítem</button>`;
      document.getElementById('btn-add-item').addEventListener('click', () =>
        _openItemForm(rec, materiales, ubicaciones, refreshItems)
      );
    }

    await refreshItems();

    async function refreshItems() {
      document.getElementById('items-table').innerHTML =
        `<div class="spinner-wrap"><span class="spinner"></span></div>`;
      try {
        const rawItems = await API.items.list(recepcion_id);
        const items = Array.isArray(rawItems) ? rawItems : (rawItems.data || []);
        _renderItemsTable(items, matMap, ubicMap, rec, refreshItems);
      } catch(err) {
        document.getElementById('items-table').innerHTML =
          `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`;
      }
    }

  } catch(err) {
    document.getElementById('rec-info').innerHTML =
      `<div class="alert alert-error">Error cargando recepción: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderItemsTable(items, matMap, ubicMap, rec, onRefresh) {
  UI.table({
    container: document.getElementById('items-table'),
    data: items,
    emptyMsg: rec.estado === 'BORRADOR'
      ? 'Sin ítems. Usá "+ Agregar Ítem" para cargar las líneas del remito.'
      : 'Sin ítems registrados.',
    columns: [
      { key: 'material_id', label: 'Material',
        render: v => UI.escHtml(matMap[v]?.descripcion || v) },
      { key: 'cantidad_recibida',  label: 'Cant.',    width: '70px' },
      { key: 'ubicacion_id', label: 'Destino',  width: '130px',
        render: v => UI.escHtml(ubicMap[v]?.nombre || v) },
      { key: 'estado_qaqc', label: 'Estado QAQC', width: '160px',
        render: v => _badgeEstadoItem(v) },
      { key: 'ncr_id', label: 'NCR', width: '130px',
        render: v => v
          ? `<a href="#/ncr?id=${v}" class="link-inline">${UI.escHtml(v)}</a>`
          : '—' },
    ],
    actions: [
      // QAQC aprueba — solo si estado = PENDIENTE_QAQC
      { label: 'Aprobar', icon: '✔', class: 'btn-success',
        show: (row) => row.estado_qaqc === 'PENDIENTE_QAQC' && Auth.can('items.aprobar'),
        onClick: row => UI.confirm(
          `¿Aprobar ítem de "${matMap[row.material_id]?.descripcion || row.material_id}"?`,
          async () => {
            try {
              await API.items.aprobar(row.item_id);
              UI.toast('Ítem aprobado', 'success');
              onRefresh();
            } catch(err) { UI.toast(err.message, 'error'); }
          }
        ),
      },
      // QAQC abre NCR — solo si estado = PENDIENTE_QAQC
      { label: 'Abrir NCR', icon: '⚠', class: 'btn-warning',
        show: (row) => row.estado_qaqc === 'PENDIENTE_QAQC' && Auth.can('ncr.create'),
        onClick: row => _openNcrForm(row, matMap, onRefresh),
      },
      // Borrar ítem — solo PENDIENTE_QAQC
      { label: 'Eliminar', icon: '✕', class: 'btn-delete',
        show: (row) => row.estado_qaqc === 'PENDIENTE_QAQC' && Auth.can('items.delete'),
        onClick: row => UI.confirm(
          '¿Eliminar este ítem? Se borrarán también sus series si las hubiera.',
          async () => {
            try {
              await API.items.delete(row.item_id);
              UI.toast('Ítem eliminado', 'success');
              onRefresh();
            } catch(err) { UI.toast(err.message, 'error'); }
          }
        ),
      },
    ],
  });
}

// ─── FORMULARIO AGREGAR ÍTEM ─────────────────────────────────

function _openItemForm(rec, materiales, ubicaciones, onSave) {
  // Solo ubicaciones tipo ALMACEN o PLAYA como destino inicial
  const ubicDest = ubicaciones.filter(u => ['ALMACEN', 'PLAYA'].includes(u.tipo));

  const m = UI.modal({
    title: 'Agregar Ítem al Remito',
    size: 'lg',
    body(container) {
      container.innerHTML = `
        <form id="form-item" class="form-grid">
          <div class="field field-full">
            <label>Material <span class="required">*</span></label>
            <select name="material_id" id="sel-material" class="input" required>
              <option value="">— Seleccionar material —</option>
              ${materiales.filter(m => !m.borrado && m.activo).map(m =>
                `<option value="${m.material_id}"
                  data-serie="${m.serie ? '1' : '0'}"
                  data-qaqc="${m.qaqc ? '1' : '0'}">
                  ${UI.escHtml(m.codigo_externo ? m.codigo_externo + ' — ' : '')}${UI.escHtml(m.descripcion)}
                </option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label>Cantidad Recibida <span class="required">*</span></label>
            <input type="number" name="cantidad_recibida" id="inp-cantidad" class="input" min="1" value="1" required>
          </div>
          <div class="field">
            <label>Cantidad en Remito</label>
            <input type="number" name="cantidad_remitida" class="input" min="1" value="1">
          </div>
          <div class="field field-full">
            <label>Ubicación Destino <span class="required">*</span></label>
            <select name="ubicacion_id" class="input" required>
              <option value="">— Seleccionar ubicación —</option>
              ${ubicDest.map(u =>
                `<option value="${u.ubicacion_id}">${UI.escHtml(u.nombre)} (${u.tipo})</option>`
              ).join('')}
            </select>
          </div>

          <!-- Panel series: aparece solo si el material tiene serie=true -->
          <div class="field field-full" id="panel-series" style="display:none">
            <label>Números de Serie <span class="required">*</span></label>
            <p class="field-hint">Ingresá un número de serie por línea. Debe coincidir con la cantidad recibida.</p>
            <textarea id="inp-series" class="input input-textarea" rows="4"
              placeholder="SN-001&#10;SN-002&#10;SN-003"></textarea>
            <div id="series-count" class="field-hint"></div>
          </div>

          <!-- Indicador QAQC -->
          <div class="field field-full" id="panel-qaqc" style="display:none">
            <div class="alert alert-info" style="margin:0">
              ⚠ Este material requiere inspección QAQC. El ítem quedará en <strong>PENDIENTE_QAQC</strong>
              hasta que el inspector lo apruebe o abra una NCR.
            </div>
          </div>
        </form>
      `;

      // Mostrar/ocultar panel series y aviso QAQC al cambiar material
      const selMat   = container.querySelector('#sel-material');
      const panelSer = container.querySelector('#panel-series');
      const panelQaqc= container.querySelector('#panel-qaqc');
      const inpSer   = container.querySelector('#inp-series');
      const inpCant  = container.querySelector('#inp-cantidad');
      const serCount = container.querySelector('#series-count');

      function onMaterialChange() {
        const opt = selMat.selectedOptions[0];
        const esSerie = opt?.dataset?.serie === '1';
        const esQaqc  = opt?.dataset?.qaqc  === '1';
        panelSer.style.display  = esSerie ? '' : 'none';
        panelQaqc.style.display = esQaqc  ? '' : 'none';
      }

      function updateSeriesCount() {
        const lineas = inpSer.value.split('\n').map(s => s.trim()).filter(Boolean);
        const cant   = parseInt(inpCant.value) || 0;
        const ok     = lineas.length === cant;
        serCount.textContent = `${lineas.length} series ingresadas / ${cant} esperadas`;
        serCount.style.color = ok ? 'var(--color-success)' : 'var(--color-error)';
      }

      selMat.addEventListener('change', onMaterialChange);
      inpSer.addEventListener('input', updateSeriesCount);
      inpCant.addEventListener('input', () => {
        // Sincronizar cantidad remitida
        const formEl = document.getElementById('form-item');
        if (formEl) {
          const cantRem = formEl.querySelector('[name="cantidad_remitida"]');
          if (cantRem && !cantRem._touched) cantRem.value = inpCant.value;
        }
        updateSeriesCount();
      });
      container.querySelector('[name="cantidad_remitida"]').addEventListener('input', function() {
        this._touched = true;
      });
    },
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="item-cancel">Cancelar</button>
        <button class="btn btn-primary" id="item-save">Agregar Ítem</button>
      `;
      container.querySelector('#item-cancel').addEventListener('click', () => m.close());
      container.querySelector('#item-save').addEventListener('click', async () => {
        const form = document.getElementById('form-item');
        const data = UI.formData(form);

        if (!data.material_id)  { UI.toast('Seleccioná un material', 'error'); return; }
        if (!data.ubicacion_id) { UI.toast('Seleccioná una ubicación', 'error'); return; }
        if (!data.cantidad_recibida || data.cantidad_recibida < 1) {
          UI.toast('Cantidad recibida inválida', 'error'); return;
        }

        // Series si aplica
        const panelSer = document.getElementById('panel-series');
        if (panelSer.style.display !== 'none') {
          const seriesRaw = document.getElementById('inp-series').value
            .split('\n').map(s => s.trim()).filter(Boolean);
          const cant = parseInt(data.cantidad_recibida);
          if (seriesRaw.length !== cant) {
            UI.toast(`Cantidad de series (${seriesRaw.length}) no coincide con cantidad recibida (${cant})`, 'error');
            return;
          }
          // Verificar duplicados dentro del mismo formulario
          if (new Set(seriesRaw).size !== seriesRaw.length) {
            UI.toast('Hay números de serie duplicados en la lista', 'error'); return;
          }
          data.series = seriesRaw;
        }

        const btn = container.querySelector('#item-save');
        btn.disabled = true; btn.textContent = 'Guardando…';

        try {
          await API.items.create(rec.recepcion_id, data);
          UI.toast('Ítem agregado correctamente', 'success');
          m.close();
          onSave();
        } catch(err) {
          UI.toast(err.message, 'error');
          btn.disabled = false; btn.textContent = 'Agregar Ítem';
        }
      });
    },
  });
}

// ─── FORMULARIO ABRIR NCR DESDE ÍTEM ─────────────────────────

function _openNcrForm(item, matMap, onRefresh) {
  const m = UI.modal({
    title: 'Abrir NCR',
    size: 'md',
    body(container) {
      container.innerHTML = `
        <p class="modal-context">
          Material: <strong>${UI.escHtml(matMap[item.material_id]?.descripcion || item.material_id)}</strong>
        </p>
        <form id="form-ncr" class="form-grid">
          <div class="field field-full">
            <label>Descripción del No Conformidad <span class="required">*</span></label>
            <textarea name="descripcion" class="input input-textarea" rows="3"
              placeholder="Describí el defecto o no conformidad observada…" required></textarea>
          </div>
          <div class="field field-full">
            <label>Asignar a (email, opcional)</label>
            <input type="email" name="asignado_a" class="input"
              placeholder="inspector@empresa.com">
          </div>
        </form>
        <div class="alert alert-warning" style="margin-top:12px">
          Al abrir la NCR el ítem pasará a estado <strong>NCR</strong> y el material
          será movido a <strong>SEGREGADO</strong> hasta resolución.
        </div>
      `;
    },
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="ncr-cancel">Cancelar</button>
        <button class="btn btn-danger" id="ncr-save">Abrir NCR</button>
      `;
      container.querySelector('#ncr-cancel').addEventListener('click', () => m.close());
      container.querySelector('#ncr-save').addEventListener('click', async () => {
        const data = UI.formData(document.getElementById('form-ncr'));
        if (!data.descripcion?.trim()) { UI.toast('Descripción requerida', 'error'); return; }

        const btn = container.querySelector('#ncr-save');
        btn.disabled = true; btn.textContent = 'Abriendo…';

        try {
          const ncr = await API.ncr.create(item.item_id, data);
          UI.toast('NCR ' + ncr.ncr_id + ' abierta', 'warning');
          m.close();
          onRefresh();
        } catch(err) {
          UI.toast(err.message, 'error');
          btn.disabled = false; btn.textContent = 'Abrir NCR';
        }
      });
    },
  });
}

// ─── HELPERS DE BADGE ────────────────────────────────────────

function _badgeEstadoRec(estado) {
  const map = {
    BORRADOR:   ['Borrador',   'neutral'],
    EN_PROCESO: ['En Proceso', 'warning'],
    CERRADA:    ['Cerrada',    'success'],
  };
  const [label, type] = map[estado] || [estado, 'default'];
  return UI.badge(label, type);
}

function _badgeEstadoItem(estado) {
  const map = {
    PENDIENTE_QAQC:        ['Pendiente QAQC',   'warning'],
    NO_REQUIERE:           ['Sin QAQC',         'neutral'],
    APROBADO:              ['Aprobado',          'success'],
    NCR:                   ['Con NCR',           'error'],
    ACEPTADO:              ['Aceptado c/desvío', 'info'],
    RECHAZADO_DEFINITIVO:  ['Rechazado',         'error'],
  };
  const [label, type] = map[estado] || [estado, 'default'];
  return UI.badge(label, type);
}
