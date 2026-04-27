// ============================================================
// pages/ncr.js — Non-Conformance Reports  (Etapa 2)
//
// Vistas:
//   #/ncr              → lista de NCRs con filtros
//   #/ncr?id=NCR-xxxx  → detalle + cambio de estado
// ============================================================

Pages.ncr = async function(params) {
  if (params?.id) return _ncrDetalle(params.id);
  return _ncrList();
};

// ─── LISTA ───────────────────────────────────────────────────

async function _ncrList() {
  renderLayout('NCR', 'ncr');
  const main = document.getElementById('page-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Non-Conformance Reports</h2>
        <p class="page-sub">Gestión de no conformidades en materiales recibidos</p>
      </div>
    </div>

    <div class="filter-bar">
      <select id="filter-estado" class="input">
        <option value="">Todos los estados</option>
        <option value="ABIERTA">Abierta</option>
        <option value="EN_REVISION">En Revisión</option>
        <option value="CERRADA_ACEPTADA">Cerrada — Aceptada</option>
        <option value="CERRADA_RECHAZADA">Cerrada — Rechazada</option>
      </select>
      <label class="checkbox-label" style="white-space:nowrap">
        <input type="checkbox" id="filter-solo-abiertas"> Solo abiertas
      </label>
      <button class="btn btn-ghost" id="btn-filter">Filtrar</button>
    </div>

    <div id="ncr-table"><div class="spinner-wrap"><span class="spinner"></span> Cargando NCRs…</div></div>
  `;

  let allData = [];
  let materiales = [];

  try {
    const [rawNcr, rawMat] = await Promise.all([
      API.ncr.list({}),
      API.materiales.list({}),
    ]);
    allData    = Array.isArray(rawNcr) ? rawNcr : (rawNcr.data || []);
    materiales = Array.isArray(rawMat) ? rawMat : (rawMat.data || []);
    const matMap = Object.fromEntries(materiales.map(m => [m.material_id, m]));

    _renderNcrTable(allData, matMap);

    document.getElementById('btn-filter').addEventListener('click', () => {
      const estado      = document.getElementById('filter-estado').value;
      const soloAbiert = document.getElementById('filter-solo-abiertas').checked;
      const filtered = allData.filter(r => {
        if (estado && r.estado !== estado) return false;
        if (soloAbiert && r.estado.startsWith('CERRADA')) return false;
        return true;
      });
      _renderNcrTable(filtered, matMap);
    });

    document.getElementById('filter-solo-abiertas').addEventListener('change', () => {
      document.getElementById('btn-filter').click();
    });

  } catch(err) {
    document.getElementById('ncr-table').innerHTML =
      `<div class="alert alert-error">Error cargando NCRs: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderNcrTable(data, matMap) {
  UI.table({
    container: document.getElementById('ncr-table'),
    data,
    emptyMsg: 'No hay NCRs registradas.',
    columns: [
      { key: 'ncr_id',      label: 'NCR',         width: '150px' },
      { key: 'material_id', label: 'Material',
        render: v => UI.escHtml(matMap[v]?.descripcion || v) },
      { key: 'descripcion', label: 'Descripción',
        render: v => `<span title="${UI.escHtml(v)}">${UI.escHtml(v.length > 60 ? v.slice(0, 60) + '…' : v)}</span>` },
      { key: 'estado',      label: 'Estado',       width: '160px',
        render: v => _badgeEstadoNcr(v) },
      { key: 'creado_por',  label: 'Creado por',   width: '160px' },
      { key: 'asignado_a',  label: 'Asignado a',   width: '160px',
        render: v => v || '—' },
      { key: 'creado_en',   label: 'Fecha',        width: '100px',
        render: v => v ? String(v).slice(0, 10) : '—' },
    ],
    actions: [
      { label: 'Ver / Gestionar', icon: '→', class: 'btn-edit',
        onClick: row => Router.navigate('ncr?id=' + row.ncr_id) },
    ],
  });
}

// ─── DETALLE ─────────────────────────────────────────────────

async function _ncrDetalle(ncr_id) {
  renderLayout('Detalle NCR', 'ncr');
  const main = document.getElementById('page-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title" id="ncr-titulo">NCR</h2>
        <p class="page-sub" id="ncr-subtitulo"></p>
      </div>
      <div class="page-actions">
        <a href="#/ncr" class="btn btn-ghost">← Volver</a>
      </div>
    </div>
    <div id="ncr-body"><div class="spinner-wrap"><span class="spinner"></span> Cargando…</div></div>
  `;

  try {
    const [ncr, rawMat] = await Promise.all([
      API.ncr.get(ncr_id),
      API.materiales.list({}),
    ]);
    const materiales = Array.isArray(rawMat) ? rawMat : (rawMat.data || []);
    const matMap = Object.fromEntries(materiales.map(m => [m.material_id, m]));
    const mat = matMap[ncr.material_id];

    _renderNcrDetalle(ncr, mat);

  } catch(err) {
    document.getElementById('ncr-body').innerHTML =
      `<div class="alert alert-error">Error cargando NCR: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderNcrDetalle(ncr, mat) {
  document.getElementById('ncr-titulo').textContent = ncr.ncr_id;
  document.getElementById('ncr-subtitulo').textContent =
    mat ? mat.descripcion : ncr.material_id;

  const esCerrada = ncr.estado.startsWith('CERRADA');

  document.getElementById('ncr-body').innerHTML = `
    <!-- Info card -->
    <div class="card" style="margin-bottom:20px">
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">Estado</span>
          <span class="detail-value">${_badgeEstadoNcr(ncr.estado)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Material</span>
          <span class="detail-value">${UI.escHtml(mat?.descripcion || ncr.material_id)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Ítem asociado</span>
          <span class="detail-value">
            <a href="#/recepciones/${ncr.item_id?.split('-')[0] || ''}" class="link-inline">${UI.escHtml(ncr.item_id)}</a>
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Descripción</span>
          <span class="detail-value">${UI.escHtml(ncr.descripcion)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Creado por</span>
          <span class="detail-value">${UI.escHtml(ncr.creado_por)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Asignado a</span>
          <span class="detail-value">${UI.escHtml(ncr.asignado_a || '—')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Fecha apertura</span>
          <span class="detail-value">${String(ncr.creado_en).slice(0, 10)}</span>
        </div>
        ${ncr.resolucion ? `
        <div class="detail-row">
          <span class="detail-label">Resolución</span>
          <span class="detail-value">${UI.escHtml(ncr.resolucion)}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Timeline de estados -->
    <div class="card" style="margin-bottom:20px">
      <h4 style="margin:0 0 12px">Flujo de estados</h4>
      <div class="ncr-timeline">
        ${_renderTimeline(ncr.estado)}
      </div>
    </div>

    <!-- Acciones disponibles -->
    <div id="ncr-acciones">
      ${_renderAcciones(ncr)}
    </div>
  `;

  // Bindear botones de acción
  _bindAcciones(ncr);
}

function _renderTimeline(estadoActual) {
  const pasos = [
    { estado: 'ABIERTA',           label: 'Abierta',      icon: '🔴' },
    { estado: 'EN_REVISION',       label: 'En Revisión',  icon: '🟡' },
    { estado: 'CERRADA_ACEPTADA',  label: 'Aceptada',     icon: '🟢' },
    { estado: 'CERRADA_RECHAZADA', label: 'Rechazada',    icon: '⚫' },
  ];

  // Estados terminales alternativos
  const esCerradaAcep = estadoActual === 'CERRADA_ACEPTADA';
  const esCerradaRech = estadoActual === 'CERRADA_RECHAZADA';

  return pasos.map(p => {
    // Ocultar la rama alternativa que no aplica
    if (p.estado === 'CERRADA_ACEPTADA' && esCerradaRech) return '';
    if (p.estado === 'CERRADA_RECHAZADA' && esCerradaAcep) return '';

    const activo   = p.estado === estadoActual;
    const pasados  = ['ABIERTA', 'EN_REVISION', 'CERRADA_ACEPTADA', 'CERRADA_RECHAZADA'];
    const idxActual = pasados.indexOf(estadoActual);
    const idxPaso   = pasados.indexOf(p.estado);
    const completado = idxPaso < idxActual;

    return `
      <div class="timeline-step ${activo ? 'step-active' : ''} ${completado ? 'step-done' : ''}">
        <div class="step-icon">${p.icon}</div>
        <div class="step-label">${p.label}</div>
      </div>
    `;
  }).join('<div class="timeline-arrow">→</div>');
}

function _renderAcciones(ncr) {
  const perfil = Auth.getPerfil();
  const puede  = ['Admin', 'QAQC', 'MatCoord'].includes(perfil);

  if (!puede || ncr.estado.startsWith('CERRADA')) {
    return ncr.estado.startsWith('CERRADA')
      ? `<div class="alert alert-success">Esta NCR está cerrada. No hay acciones disponibles.</div>`
      : `<div class="alert alert-info">Sin permisos para gestionar esta NCR.</div>`;
  }

  if (ncr.estado === 'ABIERTA') {
    return `
      <div class="action-card">
        <h4>Iniciar Revisión</h4>
        <p>Tomá la NCR para revisión técnica. El estado pasará a <strong>En Revisión</strong>.</p>
        <button class="btn btn-primary" id="btn-en-revision">Iniciar Revisión</button>
      </div>
    `;
  }

  if (ncr.estado === 'EN_REVISION') {
    return `
      <div class="action-card">
        <h4>Cerrar NCR</h4>
        <p>Ingresá la resolución y seleccioná el resultado de la inspección.</p>
        <div class="field" style="margin:12px 0">
          <label>Observaciones / Resolución <span class="required">*</span></label>
          <textarea id="ncr-resolucion" class="input input-textarea" rows="3"
            placeholder="Describí la resolución, medidas tomadas…"></textarea>
        </div>
        <div class="action-btns">
          <button class="btn btn-success" id="btn-aceptar">
            ✔ Cerrar — Aceptado con desvío
          </button>
          <button class="btn btn-danger" id="btn-rechazar">
            ✕ Cerrar — Rechazado definitivo
          </button>
        </div>
        <div class="action-hints">
          <p><strong>Aceptado:</strong> el material vuelve a stock disponible.</p>
          <p><strong>Rechazado:</strong> el material se da de baja del sistema (devolución al proveedor).</p>
        </div>
      </div>
    `;
  }

  return '';
}

function _bindAcciones(ncr) {
  const reload = () => _ncrDetalle(ncr.ncr_id);

  // ABIERTA → EN_REVISION
  document.getElementById('btn-en-revision')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-en-revision');
    btn.disabled = true; btn.textContent = 'Procesando…';
    try {
      await API.ncr.updateEstado(ncr.ncr_id, 'EN_REVISION', '');
      UI.toast('NCR en revisión', 'info');
      reload();
    } catch(err) {
      UI.toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Iniciar Revisión';
    }
  });

  // EN_REVISION → CERRADA_ACEPTADA
  document.getElementById('btn-aceptar')?.addEventListener('click', async () => {
    const resolucion = document.getElementById('ncr-resolucion').value.trim();
    if (!resolucion) { UI.toast('Ingresá la resolución antes de cerrar', 'error'); return; }

    UI.confirm(
      '¿Cerrar NCR como ACEPTADA? El material volverá a stock disponible.',
      async () => {
        try {
          await API.ncr.updateEstado(ncr.ncr_id, 'CERRADA_ACEPTADA', resolucion);
          UI.toast('NCR cerrada — material aceptado', 'success');
          reload();
        } catch(err) { UI.toast(err.message, 'error'); }
      }
    );
  });

  // EN_REVISION → CERRADA_RECHAZADA
  document.getElementById('btn-rechazar')?.addEventListener('click', async () => {
    const resolucion = document.getElementById('ncr-resolucion').value.trim();
    if (!resolucion) { UI.toast('Ingresá la resolución antes de cerrar', 'error'); return; }

    UI.confirm(
      '⚠ ¿Cerrar NCR como RECHAZADA? El material será dado de baja del sistema. Esta acción no se puede deshacer.',
      async () => {
        try {
          await API.ncr.updateEstado(ncr.ncr_id, 'CERRADA_RECHAZADA', resolucion);
          UI.toast('NCR cerrada — material rechazado definitivamente', 'warning');
          reload();
        } catch(err) { UI.toast(err.message, 'error'); }
      }
    );
  });
}

// ─── BADGE ───────────────────────────────────────────────────

function _badgeEstadoNcr(estado) {
  const map = {
    ABIERTA:           ['Abierta',      'error'],
    EN_REVISION:       ['En Revisión',  'warning'],
    CERRADA_ACEPTADA:  ['Aceptada',     'success'],
    CERRADA_RECHAZADA: ['Rechazada',    'neutral'],
  };
  const [label, type] = map[estado] || [estado, 'default'];
  return UI.badge(label, type);
}
