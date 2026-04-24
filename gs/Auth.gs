// ============================================================
// Auth.gs — OAuth 2.0 Google + manejo de sesiones
// ============================================================

const TOKEN_STORE_PREFIX = 'token_';
const TOKEN_TTL_HOURS    = 8;

// ─── REDIRECT URI FIJO ──────────────────────────────────────
// IMPORTANTE: Este valor debe coincidir exactamente con el registrado en GCP

function getRedirectUri() {
  return 'https://datamegashare.github.io/inventario/';
}

// ─── URL DE AUTORIZACIÓN ────────────────────────────────────

function getAuthUrl() {
  const redirectUri = getRedirectUri();
  const scope       = encodeURIComponent('openid email profile');
  const state       = generateId();

  CacheService.getScriptCache().put('oauth_state_' + state, '1', 300);

  const url = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id='      + CLIENT_ID +
    '&redirect_uri='   + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope='          + scope +
    '&access_type=offline' +
    '&prompt=select_account' +
    '&state='          + state;

  return { auth_url: url };
}

// ─── EXCHANGE CODE → TOKEN ──────────────────────────────────

function exchangeCodeForToken(code) {
  if (!code) return { error: 'Código de autorización requerido' };

  try {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: {
        code:          code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  getRedirectUri(),
        grant_type:    'authorization_code'
      },
      muteHttpExceptions: true
    });

    const tokenData = JSON.parse(response.getContentText());
    if (tokenData.error) {
      return { error: tokenData.error_description || tokenData.error };
    }

    const userInfo = getUserInfoFromGoogle(tokenData.access_token);
    if (userInfo.error) return userInfo;

    const usuario = buscarUsuarioPorEmail(userInfo.email);
    if (!usuario) {
      return { error: 'Usuario no autorizado. Contacte al administrador del sistema.' };
    }
    if (usuario.activo === false || usuario.activo === 'FALSE' || usuario.activo === 'false') {
      return { error: 'Usuario inactivo. Contacte al administrador del sistema.' };
    }

    const sessionToken = generateId();
    const sessionData  = {
      usuario_id: usuario.usuario_id,
      email:      usuario.email,
      nombre:     usuario.nombre,
      perfil:     usuario.perfil,
      expires_at: Date.now() + (TOKEN_TTL_HOURS * 60 * 60 * 1000)
    };

    CacheService.getScriptCache().put(
      TOKEN_STORE_PREFIX + sessionToken,
      JSON.stringify(sessionData),
      TOKEN_TTL_HOURS * 3600
    );

    return {
      token:      sessionToken,
      usuario_id: usuario.usuario_id,
      email:      usuario.email,
      nombre:     usuario.nombre,
      perfil:     usuario.perfil,
      expires_in: TOKEN_TTL_HOURS * 3600
    };

  } catch (err) {
    Logger.log('exchangeCodeForToken ERROR: ' + err.message);
    return { error: 'Error al intercambiar el código: ' + err.message };
  }
}

function getUserInfoFromGoogle(accessToken) {
  try {
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true }
    );
    const data = JSON.parse(response.getContentText());
    if (!data.email) return { error: 'No se pudo obtener información del usuario de Google' };
    return data;
  } catch (err) {
    return { error: 'Error al obtener info de usuario de Google' };
  }
}

// ─── VERIFICACIÓN DE TOKEN ──────────────────────────────────

function verifyToken(token) {
  const session = getSession(token);
  if (!session) return { valid: false };
  return {
    valid:      true,
    usuario_id: session.usuario_id,
    email:      session.email,
    nombre:     session.nombre,
    perfil:     session.perfil
  };
}

function getSession(token) {
  if (!token) return null;
  try {
    const raw = CacheService.getScriptCache().get(TOKEN_STORE_PREFIX + token);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expires_at) {
      CacheService.getScriptCache().remove(TOKEN_STORE_PREFIX + token);
      return null;
    }
    return session;
  } catch (err) {
    return null;
  }
}

function requireAuth(token) {
  const session = getSession(token);
  if (!session) return { error: 'Token inválido o expirado. Por favor inicie sesión nuevamente.' };
  return session;
}

function requirePerfil(usuario, perfilesPermitidos) {
  if (!perfilesPermitidos.includes(usuario.perfil)) {
    throw new Error('Permiso denegado. Se requiere uno de: ' + perfilesPermitidos.join(', '));
  }
}

// ─── OAUTH CALLBACK (GET) ───────────────────────────────────
// Recibe el code de Google y redirige al frontend via HTML redirect

function handleOAuthCallback(e) {
  const code  = e.parameter.code  || '';
  const error = e.parameter.error || '';

  // URL del frontend — hardcodeada para evitar depender de CONFIG
  const frontendUrl = 'https://datamegashare.github.io/inventario';

  if (error) {
    return HtmlService.createHtmlOutput(
      '<script>window.location.replace("' + frontendUrl + '/#/login?error=' + encodeURIComponent(error) + '")</script>'
    );
  }

  if (code) {
    return HtmlService.createHtmlOutput(
      '<script>window.location.replace("' + frontendUrl + '/#/auth/callback?code=' + encodeURIComponent(code) + '")</script>'
    );
  }

  return HtmlService.createHtmlOutput(
    '<script>window.location.replace("' + frontendUrl + '/#/login?error=invalid_callback")</script>'
  );
}
