// ============================================================
// pages/admin.js — Panel de Administración (Familias, Ubicaciones, Usuarios, Config)
// ============================================================

Pages.admin = async function(params) {
  if (!Auth.can('materiales.read')) { Router.navigate('dashboard'); return; }
  renderLayout('Administración', 'admin');

  const main = document.getElementById('page-content');
  const tab  = params.tab || 'usuarios';

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Panel de Administración</h2>
        <p class="page-sub">Gestión de maestros y configuración del sistema</p>
      </div>
    </div>
    <div class="tab-bar">
      ${Auth.can('usuarios.read') ? `<a href="#/admin?tab=usuarios"   class="tab ${tab==='usuarios'   ? 'tab-active':''}" >Usuarios</a>` : ''}
      <a href="#/admin?tab=familias"   class="tab ${tab==='familias'   ? 'tab-active':''}" >Familias</a>
      <a href="#/admin?tab=ubicaciones" class="tab ${tab==='ubicaciones'? 'tab-active':''}" >Ubicaciones</a>
      ${Auth.getPerfil() === 'Admin' ? `<a href="#/admin?tab=config" class="tab ${tab==='config'? 'tab-active':''}">Configuración</a>` : ''}
      <a href="#/admin?tab=historial"  class="tab ${tab==='historial'  ? 'tab-active':''}" >Historial</a>
    </div>
    <div id="tab-content" class="tab-content"></div>
  `;

  // Activar tab
  const handlers = {
    usuarios:    renderUsuarios,
    familias:    renderFamilias,
    ubicaciones: renderUbicaciones,
    config:      renderConfig,
    historial:   renderHistorial
  };
  (handlers[tab] || renderFamilias)();
};

// ─── USUARIOS ───────────────────────────────────────────────

async function renderUsuarios() {
  if (!Auth.can('usuarios.read')) return;
  const container = document.getElementById('tab-content');
  UI.spinner(container, 'Cargando usuarios...');

  let data;
  try { data = await API.usuarios.list(); } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`; return;
  }

  container.innerHTML = `
    <div class="section-header">
      <span>${data.length} usuarios</span>
      ${Auth.getPerfil() === 'Admin' ? '<button class="btn btn-primary btn-sm" id="btn-new-user">+ Nuevo Usuario</button>' : ''}
    </div>
    <div id="usuarios-table"></div>
  `;

  UI.table({
    container: document.getElementById('usuarios-table'),
    data,
    columns: [
      { key: 'nombre',           label: 'Nombre' },
      { key: 'email',            label: 'Email' },
      { key: 'perfil',           label: 'Perfil', width: '140px',
        render: v => UI.badge(v, perfilBadgeType(v)) },
      { key: 'supervisor_email', label: 'Supervisor', render: v => v || '—' },
      { key: 'activo',           label: 'Estado', width: '80px',
        render: v => UI.badge(v ? 'Activo' : 'Inactivo', v ? 'success' : 'neutral') }
    ],
    actions: [
      { label: 'Editar', icon: '✎', class: 'btn-edit',
        show: () => Auth.getPerfil() === 'Admin',
        onClick: row => openUsuarioForm(row, renderUsuarios) },
      { label: 'Eliminar', icon: '✕', class: 'btn-delete',
        show: row => Auth.getPerfil() === 'Admin' && row.usuario_id !== Auth.getSession()?.usuario_id,
        onClick: row => UI.confirm(`¿Eliminar usuario ${row.nombre}?`, async () => {
          try { await API.usuarios.delete(row.usuario_id); UI.toast('Usuario eliminado', 'success'); renderUsuarios(); }
          catch (err) { UI.toast(err.message, 'error'); }
        })
      }
    ]
  });

  document.getElementById('btn-new-user')?.addEventListener('click', () => openUsuarioForm(null, renderUsuarios));
}

function openUsuarioForm(usuario, onSave) {
  const perfiles = ['Admin','MatCoord','Almacenero','QAQC','Planner','FieldEng','ViewerCliente','ViewerGerencia'];
  const isEdit   = !!usuario;
  const m = UI.modal({
    title: isEdit ? 'Editar Usuario' : 'Nuevo Usuario',
    body: `
      <form id="form-usuario" class="form-stack">
        ${!isEdit ? `
        <div class="field">
          <label>Email (cuenta Google) <span class="required">*</span></label>
          <input type="email" name="email" class="input" value="${UI.escHtml(usuario?.email||'')}" required>
        </div>` : `<div class="alert alert-info">Email: <strong>${UI.escHtml(usuario.email)}</strong> (no editable)</div>`}
        <div class="field">
          <label>Nombre completo <span class="required">*</span></label>
          <input type="text" name="nombre" class="input" value="${UI.escHtml(usuario?.nombre||'')}" required>
        </div>
        <div class="field">
          <label>Perfil <span class="required">*</span></label>
          <select name="perfil" class="input">
            ${perfiles.map(p => `<option value="${p}" ${usuario?.perfil===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Email del Supervisor</label>
          <input type="email" name="supervisor_email" class="input" value="${UI.escHtml(usuario?.supervisor_email||'')}">
        </div>
        ${isEdit ? `
        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" name="activo" ${usuario.activo!==false?'checked':''}>
            Usuario activo
          </label>
        </div>` : ''}
      </form>
    `,
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="uf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="uf-save">${isEdit?'Guardar':'Crear usuario'}</button>
      `;
      container.querySelector('#uf-cancel').addEventListener('click', () => m.close());
      container.querySelector('#uf-save').addEventListener('click', async () => {
        const data = UI.formData(document.getElementById('form-usuario'));
        const btn  = container.querySelector('#uf-save');
        btn.disabled = true;
        try {
          if (isEdit) await API.usuarios.update(usuario.usuario_id, data);
          else        await API.usuarios.create(data);
          UI.toast(isEdit ? 'Usuario actualizado' : 'Usuario creado', 'success');
          m.close(); onSave();
        } catch (err) { UI.toast(err.message, 'error'); btn.disabled = false; }
      });
    }
  });
}

// ─── FAMILIAS ───────────────────────────────────────────────

async function renderFamilias() {
  const container = document.getElementById('tab-content');
  UI.spinner(container);
  let data;
  try { data = await API.familias.list(); } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`; return;
  }

  container.innerHTML = `
    <div class="section-header">
      <span>${data.length} familias</span>
      ${Auth.can('familias.create') ? '<button class="btn btn-primary btn-sm" id="btn-new-fam">+ Nueva Familia</button>' : ''}
    </div>
    <div id="familias-table"></div>
  `;

  const renderT = d => UI.table({
    container: document.getElementById('familias-table'),
    data: d,
    columns: [
      { key: 'codigo',      label: 'Código',      width: '100px' },
      { key: 'nombre',      label: 'Nombre' },
      { key: 'descripcion', label: 'Descripción', render: v => v || '—' }
    ],
    actions: [
      { label: 'Editar', icon: '✎', class: 'btn-edit',
        show: () => Auth.can('familias.update'),
        onClick: row => openMaestroForm('familia', row, () => renderFamilias()) },
      { label: 'Eliminar', icon: '✕', class: 'btn-delete',
        show: () => Auth.can('familias.delete'),
        onClick: row => UI.confirm(`¿Eliminar familia "${row.nombre}"?`, async () => {
          try { await API.familias.delete(row.familia_id); UI.toast('Eliminada', 'success'); renderFamilias(); }
          catch (err) { UI.toast(err.message, 'error'); }
        })
      }
    ]
  });
  renderT(data);
  document.getElementById('btn-new-fam')?.addEventListener('click', () =>
    openMaestroForm('familia', null, () => renderFamilias()));
}

// ─── UBICACIONES ────────────────────────────────────────────

async function renderUbicaciones() {
  const container = document.getElementById('tab-content');
  UI.spinner(container);
  let data;
  try { data = await API.ubicaciones.list(); } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`; return;
  }

  container.innerHTML = `
    <div class="section-header">
      <span>${data.length} ubicaciones</span>
      ${Auth.can('ubicaciones.create') ? '<button class="btn btn-primary btn-sm" id="btn-new-ubic">+ Nueva Ubicación</button>' : ''}
    </div>
    <div id="ubicaciones-table"></div>
  `;

  UI.table({
    container: document.getElementById('ubicaciones-table'),
    data,
    columns: [
      { key: 'codigo',      label: 'Código',     width: '100px' },
      { key: 'nombre',      label: 'Nombre' },
      { key: 'tipo',        label: 'Tipo',       width: '120px',
        render: v => UI.badge(v, { ALMACEN:'info', PLAYA:'default', SEGREGADO:'warning', DEVOLUCION:'neutral' }[v] || 'default') },
      { key: 'descripcion', label: 'Descripción', render: v => v || '—' }
    ],
    actions: [
      { label: 'Editar', icon: '✎', class: 'btn-edit',
        show: () => Auth.can('ubicaciones.update'),
        onClick: row => openMaestroForm('ubicacion', row, () => renderUbicaciones()) },
      { label: 'Eliminar', icon: '✕', class: 'btn-delete',
        show: () => Auth.can('ubicaciones.delete'),
        onClick: row => UI.confirm(`¿Eliminar "${row.nombre}"?`, async () => {
          try { await API.ubicaciones.delete(row.ubicacion_id); UI.toast('Eliminada', 'success'); renderUbicaciones(); }
          catch (err) { UI.toast(err.message, 'error'); }
        })
      }
    ]
  });
  document.getElementById('btn-new-ubic')?.addEventListener('click', () =>
    openMaestroForm('ubicacion', null, () => renderUbicaciones()));
}

function openMaestroForm(type, item, onSave) {
  const isFam  = type === 'familia';
  const isEdit = !!item;
  const title  = `${isEdit ? 'Editar' : 'Nueva'} ${isFam ? 'Familia' : 'Ubicación'}`;

  const m = UI.modal({
    title,
    body: `
      <form id="form-maestro" class="form-stack">
        <div class="field">
          <label>Código</label>
          <input type="text" name="codigo" class="input upper" value="${UI.escHtml(item?.codigo||'')}" placeholder="Ej: ${isFam?'ELE':'ALM-02'}">
        </div>
        <div class="field">
          <label>Nombre <span class="required">*</span></label>
          <input type="text" name="nombre" class="input" value="${UI.escHtml(item?.nombre||'')}" required>
        </div>
        ${!isFam ? `
        <div class="field">
          <label>Tipo <span class="required">*</span></label>
          <select name="tipo" class="input">
            ${['ALMACEN','PLAYA','SEGREGADO','DEVOLUCION'].map(t =>
              `<option value="${t}" ${item?.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="field">
          <label>Descripción</label>
          <textarea name="descripcion" class="input input-textarea" rows="2">${UI.escHtml(item?.descripcion||'')}</textarea>
        </div>
      </form>
    `,
    footer(container) {
      container.innerHTML = `
        <button class="btn btn-ghost" id="mf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="mf-save">${isEdit?'Guardar':'Crear'}</button>
      `;
      container.querySelector('#mf-cancel').addEventListener('click', () => m.close());
      container.querySelector('#mf-save').addEventListener('click', async () => {
        const data = UI.formData(document.getElementById('form-maestro'));
        if (data.codigo) data.codigo = data.codigo.toUpperCase();
        const btn = container.querySelector('#mf-save');
        btn.disabled = true;
        try {
          if (isFam) {
            if (isEdit) await API.familias.update(item.familia_id, data);
            else        await API.familias.create(data);
          } else {
            if (isEdit) await API.ubicaciones.update(item.ubicacion_id, data);
            else        await API.ubicaciones.create(data);
          }
          UI.toast(isEdit ? 'Actualizado' : 'Creado', 'success');
          m.close(); onSave();
        } catch (err) { UI.toast(err.message, 'error'); btn.disabled = false; }
      });
    }
  });
}

// ─── CONFIG ─────────────────────────────────────────────────

async function renderConfig() {
  if (Auth.getPerfil() !== 'Admin') return;
  const container = document.getElementById('tab-content');
  UI.spinner(container);
  let cfg;
  try { cfg = await API.config.get(); } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`; return;
  }

  const editables = ['PROYECTO_NOMBRE', 'FRONTEND_URL', 'TIMEZONE'];
  container.innerHTML = `
    <form id="form-config" class="form-stack" style="max-width:540px">
      ${editables.map(k => `
        <div class="field">
          <label>${k}</label>
          <input type="text" name="${k}" class="input" value="${UI.escHtml(cfg[k]||'')}">
        </div>
      `).join('')}
      <div class="field">
        <label>VERSION</label>
        <input type="text" class="input" value="${UI.escHtml(cfg.VERSION||'')}" disabled>
      </div>
      <button type="button" class="btn btn-primary" id="btn-save-config">Guardar configuración</button>
    </form>
  `;

  document.getElementById('btn-save-config').addEventListener('click', async () => {
    const data = UI.formData(document.getElementById('form-config'));
    try {
      await API.config.update(data);
      UI.toast('Configuración guardada', 'success');
    } catch (err) { UI.toast(err.message, 'error'); }
  });
}

// ─── HISTORIAL ───────────────────────────────────────────────

async function renderHistorial() {
  const container = document.getElementById('tab-content');
  UI.spinner(container);
  let data;
  try { data = await API.historial.list({}); } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${UI.escHtml(err.message)}</div>`; return;
  }

  container.innerHTML = `<div id="historial-table"></div>`;
  UI.table({
    container: document.getElementById('historial-table'),
    data,
    emptyMsg: 'Sin registros de historial',
    columns: [
      { key: 'timestamp',      label: 'Fecha/Hora',     width: '160px',
        render: v => v ? new Date(v).toLocaleString('es-AR') : '—' },
      { key: 'tabla',          label: 'Tabla',           width: '120px' },
      { key: 'campo',          label: 'Campo',           width: '120px' },
      { key: 'valor_anterior', label: 'Valor anterior',  render: v => `<code class="code-sm">${UI.escHtml(String(v||'').slice(0,80))}</code>` },
      { key: 'valor_nuevo',    label: 'Valor nuevo',     render: v => `<code class="code-sm">${UI.escHtml(String(v||'').slice(0,80))}</code>` },
      { key: 'usuario',        label: 'Usuario',         width: '180px' }
    ]
  });
}

// ─── UTILS ──────────────────────────────────────────────────

function perfilBadgeType(perfil) {
  const map = {
    Admin: 'danger', MatCoord: 'info', Almacenero: 'default',
    QAQC: 'warning', Planner: 'neutral', FieldEng: 'neutral',
    ViewerCliente: 'success', ViewerGerencia: 'neutral'
  };
  return map[perfil] || 'default';
}
