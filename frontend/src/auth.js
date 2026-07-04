const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI || '';
const LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI || '';

const TOKEN_KEY = 'logscan_tokens';
const VERIFIER_KEY = 'logscan_pkce_verifier';

export function isAuthConfigured() {
  return !!(COGNITO_DOMAIN && CLIENT_ID && REDIRECT_URI);
}

export function isAuthenticated() {
  const tokens = getTokens();
  return !!(tokens && tokens.access_token);
}

export function getAccessToken() {
  const tokens = getTokens();
  return tokens ? tokens.access_token : null;
}

export function getCurrentUser() {
  const tokens = getTokens();
  if (!tokens || !tokens.id_token) return null;
  try {
    const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
    return { email: payload.email, sub: payload.sub, ...payload };
  } catch {
    return null;
  }
}

export async function handleAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;

  try {
    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) return false;

    const tokens = await response.json();
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    sessionStorage.removeItem(VERIFIER_KEY);

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  } catch {
    return false;
  }
}

export async function login() {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid email profile',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  if (COGNITO_DOMAIN && LOGOUT_URI) {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      logout_uri: LOGOUT_URI,
    });
    window.location.href = `${COGNITO_DOMAIN}/logout?${params}`;
  }
}

// Internal helpers

function getTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function generateRandomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
