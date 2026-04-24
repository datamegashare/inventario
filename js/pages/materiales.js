// ============================================================
// pages/materiales.js — Maestro de Materiales
// ============================================================

Pages.materiales = async function(params) {
  renderLayout('Materiales', 'materiales');

  const main = document.getElementById('page-content');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Maestro de Materiales</h2>
        <p class="page-sub">Gestión del catálogo de materiales del proyecto</p>
      </div>
      <div class="page-actions">
        ${Auth.can('materiales.create') ? `
          <button class="btn btn-ghost" id="btn-import">↑ Importar Excel</button>
          <button class="btn btn-primary" id="btn-new">+ Nuevo Material</button>
        ` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <input type="search" id="search-q"      class="input" placeholder="Buscar por código, descripción..." style="flex:2">
      <select id="filter-familia" class="input">
        <option value="">Todas las familias</option>
      </select>
      <select id="filter-ownership" class="input">
        <option value="">Todos los tipos</option>
        <option value="contractor-furnished">Contractor</option>
        <option value="owner-furnished">Owner</option>
      </select>
      <select id="filter-serie" class="input">
        <option value="">Con/sin serie</option>
        <option value="true">Seriados</option>
        <option value="false">No seriados</option>
      </select>
      <button class="btn btn-ghost" id="btn-filter">Filtrar</button>
    </div>

    <div id="materiales-table"></div>
  `;

  let allData = [];
  let familias = [];

  // Cargar datos
  try {
    let [rawMateriales, rawFamilias] = await Promise.all([
      API.materiales.list({}),
      API.familias.list()
    ]);
    allData  = Array.isArray(rawMateriales) ? rawMateriales : (rawMateriales.data || rawMateriales.materiales || []);
    familias = Array.isArray(rawFamilias)   ? rawFamilias   : (rawFamilias.data  || rawFamilias.familias   || []);

    // Poblar select familias
    const sel = document.getElementById('filter-familia');
    familias.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.familia_id;
      opt.textContent = f.nombre;
      sel.appendChild(opt);
    });

    renderTable(allData, familias);
  } catch (err) {
    document.getElementById('materiales-table').innerHTML =
      `<div class="alert alert-error">Error cargando materiales: ${UI.escHtml(err.message)}</div>`;
  }

  // Eventos
  document.getElementById('btn-filter')?.addEventListener('click', () => {
    const q        = document.getElementById('search-q').value;
    const familia  = document.getElementById('filter-familia').value;
    const ownership= document.getElementById('filter-ownership').value;
    const serie    = document.getElementById('filter-serie').value;
    const filtered = allData.filter(m => {
      if (q && !`${m.codigo_externo} ${m.descripcion} ${m.codigo_barras}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (familia && m.familia_id !== familia) return false;
      if (ownership && m.ownership !== ownership) return false;
      if (serie === 'true'  && !m.serie) return false;
      if (serie === 'false' && m.serie)  return false;
      return true;
    });
    renderTable(filtered, familias);
  });

  document.getElementById('search-q')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-filter').click();
  });

  document.getElementById('btn-new')?.addEventListener('click', () => openMaterialForm(null, familias, refresh));
  document.getElementById('btn-import')?.addEventListener('click', () => openImportModal(refresh));

  async function refresh() {
    const result = await API.materiales.list({});
    // GAS puede devolver array directo o { data: [] } — normalizar
    allData = Array.isArray(result) ? result : (result.data || result.materiales || []);
    renderTable(allData, familias);
  }

  function renderTable(data, familias) {
    const familiaMap = {};
    familias.forEach(f => { familiaMap[f.familia_id] = f.nombre; });

    UI.table({
      container: document.getElementById('materiales-table'),
      data,
      emptyMsg: 'No hay materiales registrados. Use "Nuevo Material" o "Importar Excel".',
      columns: [
        { key: 'codigo_externo', label: 'Código',      width: '120px' },
        { key: 'descripcion',    label: 'Descripción' },
        { key: 'familia_id',     label: 'Familia',     width: '140px',
          render: v => UI.escHtml(familiaMap[v] || '—') },
        { key: 'unidad',         label: 'Und.',        width: '60px' },
        { key: 'ownership',      label: 'Tipo',        width: '120px',
          render: v => UI.badge(v === 'owner-furnished' ? 'Owner' : 'Contractor',
                                v === 'owner-furnished' ? 'info' : 'default') },
        { key: 'serie',          label: 'Serie',       width: '70px',
          render: v => v ? UI.badge('Sí', 'success') : UI.badge('No', 'neutral') },
        { key: 'qaqc',           label: 'QAQC',        width: '70px',
          render: v => v ? UI.badge('Sí', 'warning') : '—' },
        { key: 'stock_minimo',   label: 'Stock Mín.',  width: '80px' },
        { key: 'activo',         label: 'Estado',      width: '80px',
          render: v => UI.badge(v ? 'Activo' : 'Inactivo', v ? 'success' : 'neutral') },
      ],
      actions: [
        { label: 'Editar',    icon: '✎', class: 'btn-edit',
          show: () => Auth.can('materiales.update'),
          onClick: row => openMaterialForm(row, familias, refresh) },
        { label: 'Eliminar',  icon: '✕', class: 'btn-delete',
          show: () => Auth.can('materiales.delete'),
          onClick: row => UI.confirm(
            `¿Eliminar material "${row.descripcion}"? Esta acción es lógica y queda registrada en historial.`,
            async () => {
              try {
                await API.materiales.delete(row.material_id);
                UI.toast('Material eliminado', 'success');
                refresh();
              } catch (err) { UI.toast(err.message, 'error'); }
            }
          )
        }
      ]
    });
  }
};

// ─── FORMULARIO MATERIAL ─────────────────────────────────────

function openMaterialForm(material, familias, onSave) {
  const isEdit = !!material;
  const m      = UI.modal({
    title: isEdit ? 'Editar Material' : 'Nuevo Material',
    size: 'lg',
    body(container) {
      container.innerHTML = `
        <form id="form-material" class="form-grid">
          <div class="field">
            <label>Código Externo</label>
            <input type="text" name="codigo_externo" class="input" value="${UI.escHtml(material?.codigo_externo || '')}" placeholder="Ej: MAT-0001">
          </div>
          <div class="field">
            <label>Descripción <span class="required">*</span></label>
            <input type="text" name="descripcion" class="input" value="${UI.escHtml(material?.descripcion || '')}" required>
          </div>
          <div class="field">
            <label>Familia</label>
            <select name="familia_id" class="input">
              <option value="">Sin familia</option>
              ${familias.map(f => `<option value="${f.familia_id}" ${material?.familia_id === f.familia_id ? 'selected' : ''}>${UI.escHtml(f.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Unidad</label>
            <select name="unidad" class="input">
              ${['UN','M','M2','M3','KG','TON','L','GL','SPOOL','OTRO'].map(u =>
                `<option value="${u}" ${material?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Ownership</label>
            <select name="ownership" class="input">
              <option value="contractor-furnished" ${material?.ownership !== 'owner-furnished' ? 'selected' : ''}>Contractor Furnished</option>
              <option value="owner-furnished"      ${material?.ownership === 'owner-furnished'  ? 'selected' : ''}>Owner Furnished</option>
            </select>
          </div>
          <div class="field">
            <label>Código de Barras</label>
            <input type="text" name="codigo_barras" class="input" value="${UI.escHtml(material?.codigo_barras || '')}">
          </div>
          <div class="field">
            <label>Stock Mínimo</label>
            <input type="number" name="stock_minimo" class="input" value="${material?.stock_minimo ?? 0}" min="0">
          </div>
          <div class="field field-full">
            <label>Especificación</label>
            <textarea name="especificacion" class="input input-textarea" rows="2">${UI.escHtml(material?.especificacion || '')}</textarea>
          </div>
          <div class="field field-checks">
            <label class="checkbox-label">
              <input type="checkbox" name="serie" ${material?.serie ? 'checked' : ''}>
              Requiere número de serie
            </label>
            <label class="checkbox-label">
              <input type="checkbox" name="qaqc" ${material?.qaqc ? 'checked' : ''}>
              Requiere inspección QAQC
            </label>
            ${isEdit ? `
            <label class="checkbox-label">
              <input type="checkbox" name="activo" ${material?.activo !== false ? 'checked' : ''}>
              Activo
            </label>` : ''}
          </div>
        </form>
      `;
    },
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? 'Guardar cambios' : 'Crear material'}</button>
      `;
      container.querySelector('#modal-cancel').addEventListener('click', () => m.close());
      container.querySelector('#modal-save').addEventListener('click',  async () => {
        const form = document.getElementById('form-material');
        const data = UI.formData(form);

        if (!data.descripcion?.trim()) {
          UI.toast('La descripción es requerida', 'error'); return;
        }

        const btn = container.querySelector('#modal-save');
        btn.disabled = true; btn.textContent = 'Guardando...';

        try {
          if (isEdit) {
            await API.materiales.update(material.material_id, data);
            UI.toast('Material actualizado', 'success');
          } else {
            await API.materiales.create(data);
            UI.toast('Material creado', 'success');
          }
          m.close();
          onSave();
        } catch (err) {
          UI.toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = isEdit ? 'Guardar cambios' : 'Crear material';
        }
      });
    }
  });
}

// ─── IMPORTACIÓN EXCEL ───────────────────────────────────────

function openImportModal(onDone) {
  const m = UI.modal({
    title: 'Importar Materiales desde Excel',
    size: 'md',
    body: `
      <div class="import-instructions">
        <p>Cargue un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con el siguiente formato de columnas:</p>
        <table class="mini-table">
          <thead><tr><th>Columna</th><th>Descripción</th><th>Req.</th></tr></thead>
          <tbody>
            <tr><td>codigo_externo</td><td>Código único del material</td><td>—</td></tr>
            <tr><td>descripcion</td><td>Descripción del material</td><td>✓</td></tr>
            <tr><td>familia_codigo</td><td>Código de la familia</td><td>—</td></tr>
            <tr><td>ownership</td><td>contractor-furnished / owner-furnished</td><td>—</td></tr>
            <tr><td>unidad</td><td>UN, M, KG, etc.</td><td>—</td></tr>
            <tr><td>codigo_barras</td><td>Código de barras</td><td>—</td></tr>
            <tr><td>stock_minimo</td><td>Número</td><td>—</td></tr>
            <tr><td>serie</td><td>SI / NO</td><td>—</td></tr>
            <tr><td>qaqc</td><td>SI / NO</td><td>—</td></tr>
          </tbody>
        </table>
        <p class="import-note">Si un <code>codigo_externo</code> ya existe, el material se <strong>actualizará</strong>.</p>
      </div>
      <div class="field">
        <label>Archivo Excel / CSV</label>
        <input type="file" id="import-file" accept=".xlsx,.xls,.csv" class="input">
      </div>
      <div id="import-preview" style="display:none"></div>
      <div id="import-result"  style="display:none"></div>
    `,
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="imp-cancel">Cancelar</button>
        <button class="btn btn-ghost" id="imp-preview">Vista previa</button>
        <button class="btn btn-primary" id="imp-submit" disabled>Importar</button>
      `;

      let parsedRows = [];

      container.querySelector('#imp-cancel').addEventListener('click', () => m.close());

      container.querySelector('#imp-preview').addEventListener('click', async () => {
        const file = document.getElementById('import-file').files[0];
        if (!file) { UI.toast('Seleccione un archivo', 'error'); return; }
        try {
          parsedRows = await parseExcelFile(file);
          const prev = document.getElementById('import-preview');
          prev.style.display = 'block';
          prev.innerHTML = `
            <div class="import-preview-info">
              <strong>${parsedRows.length}</strong> filas detectadas.
              ${parsedRows.length > 0 ? `Primera fila: <code>${JSON.stringify(parsedRows[0]).slice(0, 120)}...</code>` : ''}
            </div>
          `;
          container.querySelector('#imp-submit').disabled = parsedRows.length === 0;
        } catch (err) {
          UI.toast('Error al leer el archivo: ' + err.message, 'error');
        }
      });

      container.querySelector('#imp-submit').addEventListener('click', async () => {
        if (!parsedRows.length) return;
        const btn = container.querySelector('#imp-submit');
        btn.disabled = true; btn.textContent = 'Importando...';
        try {
          const result = await API.materiales.import(parsedRows);
          const res = document.getElementById('import-result');
          res.style.display = 'block';
          res.innerHTML = `
            <div class="alert ${result.errores?.length ? 'alert-warning' : 'alert-success'}">
              <strong>Importación completada:</strong>
              ${result.creados} creados, ${result.actualizados} actualizados, ${result.errores?.length || 0} errores.
              ${result.errores?.length ? `<ul>${result.errores.map(e => `<li>Línea ${e.linea} (${e.codigo}): ${UI.escHtml(e.error)}</li>`).join('')}</ul>` : ''}
            </div>
          `;
          if (result.creados + result.actualizados > 0) onDone();
        } catch (err) {
          UI.toast(err.message, 'error');
          btn.disabled = false; btn.textContent = 'Importar';
        }
      });
    }
  });
}

// Parsear Excel/CSV en el browser usando SheetJS (carga lazy — solo cuando se necesita)
async function parseExcelFile(file) {
  // Cargar XLSX dinámicamente solo la primera vez que se use
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel'));
      document.head.appendChild(s);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data  = new Uint8Array(e.target.result);
        const wb    = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Error de lectura'));
    reader.readAsArrayBuffer(file);
  });
}
