// ============================================================
// pages/dashboard.js — Dashboard principal (Etapa 1)
// ============================================================

Pages.dashboard = async function(params) {
  renderLayout('Dashboard', 'dashboard');

  const main = document.getElementById('page-content');
  const perfil = Auth.getPerfil();
  const nombre = Auth.getNombre();

  main.innerHTML = `
    <div class="dashboard-welcome">
      <div>
        <h2 class="page-title">Bienvenido, ${UI.escHtml(nombre)}</h2>
        <p class="page-sub">${UI.escHtml(perfil)} — DMS Inventario</p>
      </div>
    </div>

    <div class="kpi-grid" id="kpi-grid">
      <div class="kpi-card skeleton"></div>
      <div class="kpi-card skeleton"></div>
      <div class="kpi-card skeleton"></div>
      <div class="kpi-card skeleton"></div>
    </div>

    <div class="dashboard-sections">
      <div class="dash-section">
        <h3 class="section-title">Accesos rápidos</h3>
        <div class="quick-links">
          <a href="#/materiales" class="quick-link">
            <span class="ql-icon">📦</span>
            <span class="ql-label">Materiales</span>
            <span class="ql-desc">Catálogo completo</span>
          </a>
          ${perfil === 'Admin' || perfil === 'MatCoord' ? `
          <a href="#/admin?tab=familias" class="quick-link">
            <span class="ql-icon">🏷</span>
            <span class="ql-label">Familias</span>
            <span class="ql-desc">Categorías de materiales</span>
          </a>
          <a href="#/admin?tab=ubicaciones" class="quick-link">
            <span class="ql-icon">📍</span>
            <span class="ql-label">Ubicaciones</span>
            <span class="ql-desc">Almacén, playa, etc.</span>
          </a>
          ` : ''}
          ${perfil === 'Admin' ? `
          <a href="#/admin?tab=usuarios" class="quick-link">
            <span class="ql-icon">👤</span>
            <span class="ql-label">Usuarios</span>
            <span class="ql-desc">Gestión de accesos</span>
          </a>
          ` : ''}
        </div>
      </div>

      <div class="dash-section">
        <h3 class="section-title">Estado del sistema</h3>
        <div class="status-list" id="status-list">
          <div class="status-item">
            <span class="status-dot status-ok"></span>
            <span>Etapa 1 activa — Núcleo operativo</span>
          </div>
          <div class="status-item">
            <span class="status-dot status-pending"></span>
            <span>Etapa 2 pendiente — Recepción y NCR</span>
          </div>
          <div class="status-item">
            <span class="status-dot status-pending"></span>
            <span>Etapa 3 pendiente — IWP/Salidas/Devoluciones</span>
          </div>
          <div class="status-item">
            <span class="status-dot status-pending"></span>
            <span>Etapa 4 pendiente — Dashboard/Reportes/Cliente</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Cargar KPIs
  try {
    const [materiales, familias, ubicaciones] = await Promise.all([
      API.materiales.list({}),
      API.familias.list(),
      API.ubicaciones.list()
    ]);

    const kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return; // El usuario navegó a otra página antes de que cargaran los KPIs
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-value">${materiales.length}</div>
        <div class="kpi-label">Materiales</div>
        <div class="kpi-sub">${materiales.filter(m => m.activo).length} activos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${familias.length}</div>
        <div class="kpi-label">Familias</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${ubicaciones.length}</div>
        <div class="kpi-label">Ubicaciones</div>
        <div class="kpi-sub">${ubicaciones.filter(u=>u.tipo==='ALMACEN').length} almacenes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${materiales.filter(m => m.serie).length}</div>
        <div class="kpi-label">Materiales Seriados</div>
        <div class="kpi-sub">Requieren trazabilidad</div>
      </div>
    `;
  } catch (err) {
    document.getElementById('kpi-grid').innerHTML =
      `<div class="alert alert-warning" style="grid-column:1/-1">No se pudieron cargar los KPIs: ${UI.escHtml(err.message)}</div>`;
  }
};
