'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'opsis-ui://app';
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
]);

function trustedUiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'opsis-ui:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}

function registerUiScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: 'opsis-ui', privileges: { standard: true, secure: true } }]);
}

function handleUiRequests(protocol) {
  protocol.handle('opsis-ui', async (request) => {
    if (request.method !== 'GET' || !trustedUiUrl(request.url)) return new Response(null, { status: 404 });
    const { pathname } = new URL(request.url);
    // Serve only application assets. Percent escapes and path separators other
    // than literal slashes never reach the filesystem.
    if (!/^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[a-z]+$/i.test(pathname)) return new Response(null, { status: 404 });
    const type = TYPES.get(path.extname(pathname));
    if (!type) return new Response(null, { status: 404 });
    try {
      const data = await fs.promises.readFile(path.join(__dirname, 'renderer', pathname.slice(1)));
      return new Response(data, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } });
    } catch { return new Response(null, { status: 404 }); }
  });
}

function loadUiPage(win, page, query = {}) {
  const url = new URL(page, ORIGIN + '/');
  url.search = new URLSearchParams(query).toString();
  return win.loadURL(url.href);
}

module.exports = { trustedUiUrl, registerUiScheme, handleUiRequests, loadUiPage };
