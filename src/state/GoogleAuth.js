/**
 * GoogleAuth
 * ----------
 * Optional "Sign in with Google" using Google Identity Services (GIS). Purely
 * client-side: it loads Google's SDK, renders the official button, and decodes
 * the returned ID token (a JWT) to read the player's name / picture. That name
 * becomes the player's multiplayer identity instead of a typed username.
 *
 * Requires a Google OAuth **Client ID** (create one in Google Cloud Console and
 * add your site's origin — e.g. your GitHub Pages URL — as an Authorized
 * JavaScript origin). Provide it via `window.VOXELCRAFT_GOOGLE_CLIENT_ID`
 * (e.g. a small inline <script> in index.html). When it isn't configured, the
 * button is hidden and the game falls back to a manual username.
 *
 * Note: with no backend the ID token isn't verified server-side, so this is a
 * convenience identity, not a security boundary (P2P has no trusted server).
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let _scriptPromise = null;

function loadGis() {
  if (_scriptPromise) return _scriptPromise;
  _scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google Sign-In (offline or blocked).'));
    document.head.appendChild(s);
  });
  return _scriptPromise;
}

/** Decode a JWT payload without verifying the signature (display use only). */
function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export class GoogleAuth {
  /** @returns {string} the configured OAuth client id, or '' if unset. */
  static get clientId() {
    return (typeof window !== 'undefined' && window.VOXELCRAFT_GOOGLE_CLIENT_ID) || '';
  }

  /** @returns {boolean} whether sign-in is configured for this deployment. */
  static isConfigured() {
    return !!GoogleAuth.clientId;
  }

  /**
   * Render the official Google button into `container`. Calls `onUser` with
   * { name, email, picture, sub } when the player signs in.
   * @param {HTMLElement} container
   * @param {(user: {name:string,email:string,picture:string,sub:string}) => void} onUser
   * @returns {Promise<boolean>} whether the button was rendered
   */
  static async renderButton(container, onUser) {
    if (!GoogleAuth.isConfigured()) return false;
    await loadGis();
    window.google.accounts.id.initialize({
      client_id: GoogleAuth.clientId,
      callback: (resp) => {
        const u = decodeJwt(resp.credential);
        if (u) onUser({ name: u.name, email: u.email, picture: u.picture, sub: u.sub });
      }
    });
    window.google.accounts.id.renderButton(container, {
      theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', width: 240
    });
    return true;
  }
}

export default GoogleAuth;
