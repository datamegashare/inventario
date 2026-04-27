// ============================================================
// ui.js — Componentes de UI reutilizables
// ============================================================

const UI = (() => {

  // ─── TOAST ─────────────────────────────────────────────────
  function toast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container') || createToastContainer();
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <span class="toast-icon">${{ success:'✓', error:'✕', info:'ℹ', warning:'⚠' }[type] || 'ℹ'}</span>
      <span class="toast-msg">${escHtml(msg)}</span>
    `;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));
    setTimeout(() => {
      t.classList.remove('toast-show');
      t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, duration);
  }

  function createToastContainer() {
    const c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
    return c;
  }

  // ─── MODAL ─────────────────────────────────────────────────
  function modal({ title, body, footer, size = 'md', onClose }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-${size}">
        <div class="modal-header">
          <h3 class="modal-title">${escHtml(title)}</h3>
          <button class="modal-close" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">${typeof body === 'string' ? body : ''}</div>
        ${footer ? `<div class="modal-footer">${typeof footer === 'string' ? footer : ''}</div>` : ''}
      </div>
    `;

    if (typeof body === 'function') {
      body(overlay.querySelector('.modal-body'));
    }
    if (typeof footer === 'function') {
      const f = document.createElement('div');
      f.className = 'modal-footer';
      footer(f);
      overlay.querySelector('.modal').appendChild(f);
    }

    const close = () => {
      overlay.classList.add('modal-closing');
      overlay.addEventListener('animationend', () => { overlay.remove(); onClose?.(); }, { once: true });
    };

    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal').addEventListener('click', e => e.stopPropagation());
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-open'));
    return { close, el: overlay };
  }

  // ─── CONFIRM ───────────────────────────────────────────────
  function confirm(msg, onConfirm, onCancel) {
    const m = modal({
      title: 'Confirmar acción',
      body: `<p class="confirm-msg">${escHtml(msg)}</p>`,
      footer(el) {
        el.innerHTML = `
          <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
          <button class="btn btn-danger" id="modal-confirm">Confirmar</button>
        `;
        el.querySelector('#modal-cancel').addEventListener('click',  () => { m.close(); onCancel?.(); });
        el.querySelector('#modal-confirm').addEventListener('click', () => { m.close(); onConfirm?.(); });
      }
    });
  }

  // ─── TABLA ─────────────────────────────────────────────────
  /**
   * Renderiza una tabla de datos.
   * columns: [{ key, label, render?, sortable? }]
   * actions: [{ label, icon, class, onClick(row) }]
   */
  function table({ columns, data, actions = [], emptyMsg = 'Sin resultados', container }) {
    const el = container || document.createElement('div');
    el.innerHTML = '';

    if (!data || data.length === 0) {
      el.innerHTML = `<div class="table-empty"><span>${escHtml(emptyMsg)}</span></div>`;
      return el;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.width) th.style.width = col.width;
      headerRow.appendChild(th);
    });
    if (actions.length) {
      const th = document.createElement('th');
      th.textContent = 'Acciones';
      th.className = 'th-actions';
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id || i;
      columns.forEach(col => {
        const td = document.createElement('td');
        if (col.render) {
          const content = col.render(row[col.key], row);
          if (content === null || content === undefined) {
            td.textContent = '';
          } else if (typeof content === 'string') {
            td.innerHTML = content;
          } else if (content instanceof Node) {
            td.appendChild(content);
          } else {
            td.textContent = String(content);
          }
        } else {
          td.textContent = row[col.key] ?? '';
        }
        tbody.appendChild.call(tr, td) || tr.appendChild(td);
      });
      if (actions.length) {
        const td = document.createElement('td');
        td.className = 'td-actions';
        actions.forEach(action => {
          if (action.show && !action.show(row)) return;
          const btn = document.createElement('button');
          btn.className = `btn-action ${action.class || ''}`;
          btn.title = action.label;
          btn.innerHTML = action.icon ? `<span>${action.icon}</span>` : escHtml(action.label);
          btn.addEventListener('click', e => { e.stopPropagation(); action.onClick(row); });
          td.appendChild(btn);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    wrapper.appendChild(table);
    el.appendChild(wrapper);
    return el;
  }

  // ─── SPINNER ───────────────────────────────────────────────
  function spinner(container, msg = 'Cargando...') {
    const el = document.createElement('div');
    el.className = 'spinner-wrap';
    el.innerHTML = `<div class="spinner"></div><span class="spinner-msg">${escHtml(msg)}</span>`;
    if (container) { container.innerHTML = ''; container.appendChild(el); }
    return el;
  }

  // ─── BADGE ─────────────────────────────────────────────────
  function badge(text, type = 'default') {
    return `<span class="badge badge-${type}">${escHtml(String(text))}</span>`;
  }

  // ─── FORM HELPERS ──────────────────────────────────────────
  function formData(formEl) {
    const data = {};
    new FormData(formEl).forEach((v, k) => { data[k] = v; });
    // Checkboxes no incluidos en FormData si están desmarcados
    formEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      data[cb.name] = cb.checked;
    });
    return data;
  }

  function setFormErrors(formEl, errors) {
    formEl.querySelectorAll('.field-error').forEach(e => e.remove());
    Object.entries(errors).forEach(([field, msg]) => {
      const input = formEl.querySelector(`[name="${field}"]`);
      if (input) {
        const err = document.createElement('span');
        err.className = 'field-error';
        err.textContent = msg;
        input.parentNode.appendChild(err);
        input.classList.add('input-error');
      }
    });
  }

  // ─── PAGINATION ────────────────────────────────────────────
  function paginate(data, page, pageSize = 50) {
    const total = data.length;
    const pages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    return { items: data.slice(start, start + pageSize), total, pages, page };
  }

  // ─── UTILS ─────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setContent(selector, html) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  function setActive(navSelector, activeHref) {
    document.querySelectorAll(navSelector).forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === activeHref);
    });
  }

  return { toast, modal, confirm, table, spinner, badge, formData, setFormErrors, paginate, escHtml, setContent, setActive };
})();
