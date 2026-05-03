/**
 * Water Benders IITH – API layer
 * Communicates with the Google Apps Script web app.
 *
 * POST requests use Content-Type: text/plain to avoid a CORS preflight,
 * which is the standard workaround for Google Apps Script endpoints.
 */
const API = (() => {
  const url = () => CONFIG.APPS_SCRIPT_URL;

  // GET via JSONP – injects a <script> tag so there are zero CORS restrictions.
  // Works universally with Google Apps Script deployments.
  function get(action, params = {}) {
    return new Promise((resolve, reject) => {
      const cb = `_wb${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out after 15 s'));
      }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }

      window[cb] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('Failed to reach Apps Script')); };

      const qs = new URLSearchParams({ action, ...params, callback: cb });
      script.src = `${url()}?${qs}`;
      document.head.appendChild(script);
    });
  }

  // POST via fetch with Content-Type: text/plain to avoid a CORS preflight.
  function withTimeout(promise, ms = 15000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  }

  async function post(data) {
    const res = await withTimeout(fetch(url(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
    }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return {
    ping:         ()       => get('ping'),
    getBowls:     ()       => get('getBowls'),
    getBenders:   (bowlId) => get('getBenders', { bowlId }),
    getHistory:   (bowlId, limit = 10) => get('getHistory', { bowlId, limit }),

    addBowl:      (data)   => post({ action: 'addBowl', ...data }),
    updateBowl:   (data)   => post({ action: 'updateBowl', ...data }),
    deleteBowl:   (id)     => post({ action: 'deleteBowl', id }),

    fillBowl:     (bowlId, filledBy, notes) =>
                    post({ action: 'fillBowl', bowlId, filledBy, notes }),

    addBender:    (bowlId, name, phone) =>
                    post({ action: 'addBender', bowl_id: bowlId, name, phone }),
    removeBender: (id)     => post({ action: 'removeBender', id }),

    verifyAdmin:  (passcode) => post({ action: 'verifyAdmin', passcode }),

    uploadImage:  (imageData, mimeType, fileName) =>
                    post({ action: 'uploadImage', imageData, mimeType, fileName }),
  };
})();
