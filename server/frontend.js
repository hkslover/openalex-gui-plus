const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');

const DEFAULT_DIST_DIR = path.resolve(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.eot': 'application/vnd.ms-fontobject',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function tryGetSeaRuntime() {
  try {
    return require('node:sea');
  } catch (error) {
    return null;
  }
}

function normalizeRequestPath(requestPath = '/') {
  const pathname = String(requestPath || '/').split('?')[0].split('#')[0];
  const trimmed = pathname.replace(/^\/+/, '');
  const normalized = path.posix.normalize(trimmed || 'index.html');

  if (!normalized || normalized === '.' || normalized === '/') {
    return 'index.html';
  }
  if (normalized.startsWith('../')) {
    return 'index.html';
  }
  return normalized;
}

function contentTypeForAsset(assetPath) {
  return MIME_TYPES[path.extname(assetPath).toLowerCase()] || 'application/octet-stream';
}

function getSeaAssetBuffer(assetKey) {
  const sea = tryGetSeaRuntime();
  if (!sea?.isSea()) return null;

  try {
    const asset = sea.getAsset(assetKey);
    return Buffer.from(asset);
  } catch (error) {
    return null;
  }
}

function sendSeaAsset(res, assetPath) {
  const assetKey = `frontend/${assetPath}`;
  const buffer = getSeaAssetBuffer(assetKey);
  if (!buffer) return false;

  res.setHeader('Content-Type', contentTypeForAsset(assetPath));
  res.send(buffer);
  return true;
}

function mountFrontend(app, options = {}) {
  const distDir = options.distDir || DEFAULT_DIST_DIR;
  const preferSeaAssets = options.preferSeaAssets !== false;
  const sea = tryGetSeaRuntime();
  const useSeaAssets = preferSeaAssets && !!sea?.isSea?.();

  if (useSeaAssets) {
    app.get('*', (req, res) => {
      const requestedAsset = normalizeRequestPath(req.path);
      if (sendSeaAsset(res, requestedAsset)) {
        return;
      }

      sendSeaAsset(res, 'index.html');
    });
    return;
  }

  app.use(serveStatic(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

function ensureDistExists(distDir = DEFAULT_DIST_DIR) {
  const indexPath = path.join(distDir, 'index.html');
  return fs.existsSync(indexPath);
}

module.exports = {
  DEFAULT_DIST_DIR,
  contentTypeForAsset,
  ensureDistExists,
  mountFrontend,
};
