const express = require('express');
const compression = require('compression');

const { mountBackendRoutes } = require('./backend');
const { DEFAULT_DIST_DIR, ensureDistExists, mountFrontend } = require('./frontend');

const DEFAULT_HOST = process.env.OPENALEX_GUI_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.OPENALEX_GUI_PORT || 18400);

function createLocalApp(options = {}) {
  const app = express();
  const distDir = options.distDir || DEFAULT_DIST_DIR;

  app.use(compression());
  mountBackendRoutes(app);
  mountFrontend(app, {
    distDir,
    preferSeaAssets: options.preferSeaAssets !== false,
  });

  return app;
}

async function startLocalApp(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = Number(options.port ?? DEFAULT_PORT);
  const distDir = options.distDir || DEFAULT_DIST_DIR;
  const logger = options.logger || console;
  const shouldRequireBuiltDist = options.requireBuiltDist !== false;

  if (shouldRequireBuiltDist && !ensureDistExists(distDir)) {
    throw new Error(
      `Frontend build not found at ${distDir}. Run "npm run build" before starting the local app.`,
    );
  }

  const app = createLocalApp(options);

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const resolvedHost = typeof address === 'object' && address?.address ? address.address : host;
      const resolvedPort = typeof address === 'object' && address?.port ? address.port : port;
      const url = `http://${resolvedHost}:${resolvedPort}`;

      logger.log(`OpenAlex GUI Plus local app listening on ${url}`);
      logger.log(`Open this URL in your browser: ${url}`);

      resolve({
        app,
        server,
        url,
      });
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startLocalApp()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  createLocalApp,
  startLocalApp,
};
