// ============================================================
// pages/series.js — Trazabilidad y Stock  (Etapa 2)
//
// Tabs:
//   series    → búsqueda de seriales/tags
//   stock     → stock por material + ubicación
//   movimientos → log operativo
// ============================================================

Pages.series = async function(params) {
  renderLayout('Trazabilidad', 'series');
  const main = document.getElementById('page-content');
  const tab  = params?.tab || 'series';

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Trazabilidad</h2>
        <p class="page-sub">Seguimiento de seriales, stock y movimientos de materiales</p>
      </div>
    </div>
    <div class="tab-bar">
      <a href="#/series?tab=series"      class="tab ${tab === 'series'      ? 'tab-active' : ''}">Seriales</a>
      <a href="#/series?tab=stock"       class="tab ${tab === 'stock'       ? 'tab-active' : ''}">Stock</a>
      <a href="#/series?tab=movimientos" class="tab ${tab === 'movimientos' ? 'tab-active' : ''}">Movimientos</a>
    </div>
    <div id="tab-content" class="tab-content"></div>
  `;

  const handlers = {
    series:      _renderSeries,
    stock:       _renderStock,
    movimientos: _renderMovimientos,
  };
  (handlers[tab] || _renderSeries)();
};

// ─── TAB: SERIALES ───────────────────────────────────────────

async function _renderSeries() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `
    <div class="filter-bar">
      <input type="search" id="search-serie" class="input"
        placeholder="Buscar por nro. de serie o código de barras…" style="flex:2">
      <select id="filter-estado-serie" class="input">
        <option value="">Todos los estados</option>
        <option value="PENDIENTE_QAQC">Pendiente QAQC</option>
        <option value="EN_ALMACEN">En Almacén</option>
        <option value="RESERVADO">Reservado</option>
        <option value="EN_CAMPO">En Campo</option>
        <option value="NCR">Con NCR</option>
        <option value="SEGREGADO">Segregado</option>
        <option value="DEVUELTO_INSPECCION">Devuelto a Inspección</option>
      </select>
      <select id="filter-material-serie" class="input">
        <option value="">Todos los materiales</option>
      </select>
      <button class="btn btn-ghost" id="btn-filter-serie">Buscar</button>
    </div>
    <div id="series-table"><div class="spinner-wrap"><span class="spinner"></span> Cargando…</div></div>
  `;

  let allSeries = [];
  let materiales = [];
  let ubicaciones = [];

  try {
    const [rawSer, rawMat, rawUbic] = await Promise.all([
      API.series.list({}),
      API.materiales.list({}),
      API.ubicaciones.list(),
    ]);
    allSeries   = Array.isArray(rawSer)  ? rawSer  : (rawSer.data  || []);
    materiales  = Array.isArray(rawMat)  ? rawMat  : (rawMat.data  || []);
    ubicaciones = Array.isArray(rawUbic) ? rawUbic : (rawUbic.data || []);

    const matMap  = Object.fromEntries(materiales.map(m => [m.material_id, m]));
    const ubicMap = Object.fromEntries(ubicaciones.map(u => [u.ubicacion_id, u]));

    // Poblar select materiales (solo los que tienen series)
    const matConSeries = [...new Set(allSeries.map(s => s.material_id))];
    const sel = document.getElementById('filter-material-serie');
    matConSeries.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = matMap[id]?.descripcion || id;
      sel.appendChild(opt);
    });

    _renderSeriesTable(allSeries, matMap, ubicMap);

    document.getElementById('btn-filter-serie').addEventListener('click', () => {
      const q      = document.getElementById('search-serie').value.toLowerCase();
      const estado = document.getElementById('filter-estado-serie').value;
      const matId  = document.getElementById('filter-material-serie').value;

      const filtered = allSeries.filter(s => {
        if (estado && s.estado !== estado) return false;
        if (matId  && s.material_id !== matId) return false;
        if (q && !`${s.numero_serie} ${s.codigo_barras}`.toLowerCase().includes(q)) return false;
        return true;
      });
      _renderSeriesTable(filtered, matMap, ubicMap);
    });

    document.getElementById('search-serie').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-filter-serie').click();
    });

  } catch(err) {
    container.innerHTML =
      `<div class="alert alert-error">Error cargando series: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderSeriesTable(data, matMap, ubicMap) {
  UI.table({
    container: document.getElementById('series-table'),
    data,
    emptyMsg: 'No se encontraron series con los filtros aplicados.',
    columns: [
      { key: 'numero_serie',  label: 'Nro. Serie',   width: '160px' },
      { key: 'codigo_barras', label: 'Cód. Barras',  width: '140px',
        render: v => v || '—' },
      { key: 'material_id',   label: 'Material',
        render: v => UI.escHtml(matMap[v]?.descripcion || v) },
      { key: 'estado', label: 'Estado', width: '160px',
        render: v => _badgeEstadoSerie(v) },
      { key: 'ubicacion_id',  label: 'Ubicación',    width: '140px',
        render: v => UI.escHtml(ubicMap[v]?.nombre || v || '—') },
      { key: 'ncr_id',        label: 'NCR',          width: '130px',
        render: v => v
          ? `<a href="#/ncr?id=${v}" class="link-inline">${UI.escHtml(v)}</a>`
          : '—' },
    ],
    actions: [],
  });
}

// ─── TAB: STOCK ──────────────────────────────────────────────

async function _renderStock() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `
    <div class="filter-bar">
      <select id="filter-material-stock" class="input" style="flex:2">
        <option value="">Todos los materiales</option>
      </select>
      <select id="filter-ubic-stock" class="input">
        <option value="">Todas las ubicaciones</option>
      </select>
      <label class="checkbox-label" style="white-space:nowrap">
        <input type="checkbox" id="filter-con-stock" checked> Solo con stock
      </label>
      <button class="btn btn-ghost" id="btn-filter-stock">Filtrar</button>
    </div>
    <div id="stock-table"><div class="spinner-wrap"><span class="spinner"></span> Cargando…</div></div>
    <div id="stock-resumen" style="margin-top:16px"></div>
  `;

  let allStock = [];
  let materiales = [];
  let ubicaciones = [];

  try {
    const [rawStock, rawMat, rawUbic] = await Promise.all([
      API.stock.list({}),
      API.materiales.list({}),
      API.ubicaciones.list(),
    ]);
    allStock    = Array.isArray(rawStock) ? rawStock : (rawStock.data || []);
    materiales  = Array.isArray(rawMat)   ? rawMat   : (rawMat.data  || []);
    ubicaciones = Array.isArray(rawUbic)  ? rawUbic  : (rawUbic.data || []);

    const matMap  = Object.fromEntries(materiales.map(m => [m.material_id, m]));
    const ubicMap = Object.fromEntries(ubicaciones.map(u => [u.ubicacion_id, u]));

    // Poblar selects
    const selMat  = document.getElementById('filter-material-stock');
    const selUbic = document.getElementById('filter-ubic-stock');

    materiales.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.material_id;
      opt.textContent = (m.codigo_externo ? m.codigo_externo + ' — ' : '') + m.descripcion;
      selMat.appendChild(opt);
    });
    ubicaciones.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.ubicacion_id;
      opt.textContent = u.nombre + ' (' + u.tipo + ')';
      selUbic.appendChild(opt);
    });

    const renderFiltrado = () => {
      const matId   = selMat.value;
      const ubicId  = selUbic.value;
      const soloStk = document.getElementById('filter-con-stock').checked;

      const filtered = allStock.filter(s => {
        if (matId  && s.material_id  !== matId)  return false;
        if (ubicId && s.ubicacion_id !== ubicId) return false;
        if (soloStk && Number(s.cantidad_disponible) === 0 &&
                       Number(s.cantidad_reservada)  === 0 &&
                       Number(s.cantidad_bloqueada)  === 0) return false;
        return true;
      });
      _renderStockTable(filtered, matMap, ubicMap);
    };

    document.getElementById('btn-filter-stock').addEventListener('click', renderFiltrado);
    document.getElementById('filter-con-stock').addEventListener('change', renderFiltrado);

    renderFiltrado();

  } catch(err) {
    container.innerHTML =
      `<div class="alert alert-error">Error cargando stock: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderStockTable(data, matMap, ubicMap) {
  // Resumen totales
  const totDisp  = data.reduce((a, r) => a + Number(r.cantidad_disponible), 0);
  const totReserv = data.reduce((a, r) => a + Number(r.cantidad_reservada), 0);
  const totBloq  = data.reduce((a, r) => a + Number(r.cantidad_bloqueada), 0);

  document.getElementById('stock-resumen').innerHTML = `
    <div class="info-chips">
      <span class="info-chip"><strong>Disponible total:</strong> ${totDisp}</span>
      <span class="info-chip"><strong>Reservado total:</strong> ${totReserv}</span>
      <span class="info-chip"><strong>Bloqueado total:</strong> ${totBloq}</span>
    </div>
  `;

  UI.table({
    container: document.getElementById('stock-table'),
    data,
    emptyMsg: 'Sin registros de stock con los filtros aplicados.',
    columns: [
      { key: 'material_id',        label: 'Material',
        render: v => UI.escHtml(matMap[v]?.descripcion || v) },
      { key: 'ubicacion_id',       label: 'Ubicación',      width: '140px',
        render: v => UI.escHtml(ubicMap[v]?.nombre || v) },
      { key: 'cantidad_disponible', label: 'Disponible',    width: '100px',
        render: v => `<strong style="color:var(--color-success)">${v}</strong>` },
      { key: 'cantidad_reservada',  label: 'Reservado',     width: '100px',
        render: v => Number(v) > 0
          ? `<span style="color:var(--color-warning)">${v}</span>` : v },
      { key: 'cantidad_bloqueada',  label: 'Bloqueado',     width: '100px',
        render: v => Number(v) > 0
          ? `<span style="color:var(--color-error)">${v}</span>` : v },
      { key: 'ultima_actualizacion', label: 'Actualizado',  width: '100px',
        render: v => v ? String(v).slice(0, 10) : '—' },
    ],
    actions: [],
  });
}

// ─── TAB: MOVIMIENTOS ────────────────────────────────────────

async function _renderMovimientos() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `
    <div class="filter-bar">
      <select id="filter-tipo-mov" class="input">
        <option value="">Todos los tipos</option>
        <option value="RECEPCION_ITEM_PENDIENTE">Recepción pendiente</option>
        <option value="RECEPCION_APROBADA_AUTO">Aprobación automática</option>
        <option value="QAQC_APROBADO">QAQC aprobado</option>
        <option value="NCR_ABIERTA">NCR abierta</option>
        <option value="NCR_CERRADA_ACEPTADA">NCR aceptada</option>
        <option value="NCR_CERRADA_RECHAZADA">NCR rechazada</option>
        <option value="RECEPCION_CERRADA">Recepción cerrada</option>
        <option value="MATERIAL_DADO_DE_BAJA">Material dado de baja</option>
        <option value="NOTIFICACION_ENVIADA">Notificación enviada</option>
      </select>
      <input type="date" id="filter-desde" class="input" title="Desde">
      <input type="date" id="filter-hasta" class="input" title="Hasta">
      <button class="btn btn-ghost" id="btn-filter-mov">Filtrar</button>
    </div>
    <div id="mov-table"><div class="spinner-wrap"><span class="spinner"></span> Cargando…</div></div>
  `;

  // Default: últimos 7 días
  const hoy   = new Date();
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
  document.getElementById('filter-desde').value = hace7.toISOString().slice(0, 10);
  document.getElementById('filter-hasta').value = hoy.toISOString().slice(0, 10);

  let materiales = [];

  try {
    const rawMat = await API.materiales.list({});
    materiales = Array.isArray(rawMat) ? rawMat : (rawMat.data || []);
    const matMap = Object.fromEntries(materiales.map(m => [m.material_id, m]));

    const cargar = async () => {
      document.getElementById('mov-table').innerHTML =
        `<div class="spinner-wrap"><span class="spinner"></span></div>`;
      try {
        const filters = {
          tipo:        document.getElementById('filter-tipo-mov').value || undefined,
          fecha_desde: document.getElementById('filter-desde').value   || undefined,
          fecha_hasta: document.getElementById('filter-hasta').value
                         ? document.getElementById('filter-hasta').value + 'T23:59:59'
                         : undefined,
        };
        const raw = await API.movimientos.list(filters);
        const movs = Array.isArray(raw) ? raw : (raw.data || []);
        _renderMovTable(movs, matMap);
      } catch(err) {
        document.getElementById('mov-table').innerHTML =
          `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`;
      }
    };

    document.getElementById('btn-filter-mov').addEventListener('click', cargar);
    cargar();

  } catch(err) {
    container.innerHTML =
      `<div class="alert alert-error">Error: ${UI.escHtml(err.message)}</div>`;
  }
}

function _renderMovTable(data, matMap) {
  UI.table({
    container: document.getElementById('mov-table'),
    data,
    emptyMsg: 'No hay movimientos en el período seleccionado.',
    columns: [
      { key: 'timestamp',   label: 'Fecha/Hora',  width: '155px',
        render: v => v ? String(v).slice(0, 19).replace('T', ' ') : '—' },
      { key: 'tipo',        label: 'Tipo',         width: '200px',
        render: v => UI.badge(_tipoMovLabel(v), _tipoMovColor(v)) },
      { key: 'material_id', label: 'Material',     width: '220px',
        render: v => v ? UI.escHtml(matMap[v]?.descripcion || v) : '—' },
      { key: 'descripcion', label: 'Descripción',
        render: v => UI.escHtml(v) },
      { key: 'usuario',     label: 'Usuario',      width: '160px' },
    ],
    actions: [],
  });
}

function _tipoMovLabel(tipo) {
  const map = {
    RECEPCION_ITEM_PENDIENTE:  'Recepción pendiente',
    RECEPCION_APROBADA_AUTO:   'Aprobación auto',
    QAQC_APROBADO:             'QAQC aprobado',
    NCR_ABIERTA:               'NCR abierta',
    NCR_CERRADA_ACEPTADA:      'NCR aceptada',
    NCR_CERRADA_RECHAZADA:     'NCR rechazada',
    RECEPCION_CERRADA:         'Recepción cerrada',
    MATERIAL_DADO_DE_BAJA:     'Baja de material',
    NOTIFICACION_ENVIADA:      'Notificación',
  };
  return map[tipo] || tipo;
}

function _tipoMovColor(tipo) {
  if (tipo?.includes('NCR_ABIERTA'))    return 'error';
  if (tipo?.includes('RECHAZADA'))      return 'error';
  if (tipo?.includes('ACEPTADA') || tipo?.includes('APROBADO')) return 'success';
  if (tipo?.includes('CERRADA'))        return 'info';
  if (tipo?.includes('BAJA'))           return 'neutral';
  return 'default';
}

// ─── BADGE ESTADO SERIE ──────────────────────────────────────

function _badgeEstadoSerie(estado) {
  const map = {
    PENDIENTE_QAQC:       ['Pendiente QAQC',   'warning'],
    EN_ALMACEN:           ['En Almacén',        'success'],
    RESERVADO:            ['Reservado',         'info'],
    EN_CAMPO:             ['En Campo',          'info'],
    NCR:                  ['Con NCR',           'error'],
    SEGREGADO:            ['Segregado',         'neutral'],
    DEVUELTO_INSPECCION:  ['Devuelto',          'warning'],
  };
  const [label, type] = map[estado] || [estado, 'default'];
  return UI.badge(label, type);
}
