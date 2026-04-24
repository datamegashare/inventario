// ============================================================
//  api.js  — Inventario AWP  v2.0
//  Cliente HTTP para GAS Web App.
//  Usa FormData para evitar CORS preflight (GET con ?action=).
//  Incluye sessionId automáticamente en cada request.
// ============================================================

const API = (() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkgO5RZpdVviZ-Y1hhbUMoNvqrB3uCO4KaHeJHP1K0wEUb6jBf0J_tRmpW4P7od5yz/exec';

  // ─────────────────────────────────────────────────────────────
  //  call(action, params)
  //  Método principal. Llama al GAS con la acción dada.
  //  - Incluye sessionId automáticamente (excepto getAuthUrl y exchangeToken)
  //  - Usa POST con FormData para evitar CORS preflight
  // ─────────────────────────────────────────────────────────────
  async function call(action, params = {}) {
    const PUBLIC_ACTIONS = ['getAuthUrl', 'exchangeToken'];
    
    // Agregar sessionId a todas las acciones que no son públicas
    if (!PUBLIC_ACTIONS.includes(action)) {
      const sessionId = Auth.getSessionId();
      if (sessionId) {
        params.sessionId = sessionId;
      }
    }

    const formData = new FormData();
    formData.append('action', action);
    
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    try {
      const response = await fetch(GAS_URL, {
        method:   'POST',
        body:     formData,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Si el servidor retorna sesión inválida, limpiar y redirigir
      if (data.error === 'SESSION_INVALID' || data.error === 'SESSION_EXPIRED') {
        console.warn('[API] Sesión inválida en servidor — redirigiendo a login');
        Auth.logout(); // logout local (sin llamar al servidor para evitar loop)
        return data;
      }
      
      return data;
      
    } catch (err) {
      console.error(`[API] Error en acción "${action}":`, err);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Métodos de conveniencia para el dominio AWP
  // ─────────────────────────────────────────────────────────────
  
  const Materials = {
    getAll:    (filters = {}) => call('getMaterials', filters),
    getById:   (id)           => call('getMaterial', { id }),
    create:    (data)         => call('createMaterial', data),
    update:    (id, data)     => call('updateMaterial', { id, ...data }),
    delete:    (id)           => call('deleteMaterial', { id }),
    search:    (query)        => call('searchMaterials', { query }),
  };

  const Dashboard = {
    getSummary: () => call('getDashboardSummary'),
    getStats:   () => call('getDashboardStats'),
  };

  const Users = {
    getAll:  ()         => call('getUsers'),
    create:  (data)     => call('createUser', data),
    update:  (id, data) => call('updateUser', { id, ...data }),
    delete:  (id)       => call('deleteUser', { id }),
  };

  // ─────────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  return {
    call,
    Materials,
    Dashboard,
    Users,
  };
})();
