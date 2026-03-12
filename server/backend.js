const express = require('express');
const { getClientStatus, importWorksToZotero, normalizeSettings } = require('./zotero/importer');

function createBackendRouter() {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  router.post('/zotero/status', async (req, res) => {
    try {
      const settings = normalizeSettings(req.body?.settings || {});
      const status = await getClientStatus(settings);
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  });

  router.post('/zotero/import', async (req, res) => {
    try {
      const openalexIds = Array.isArray(req.body?.openalexIds) ? req.body.openalexIds : [];
      const settings = normalizeSettings(req.body?.settings || {});
      const result = await importWorksToZotero({ openalexIds, settings });
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  });

  return router;
}

function mountBackendRoutes(app) {
  app.use(express.json({ limit: '1mb' }));
  app.use('/backend', createBackendRouter());
}

module.exports = {
  createBackendRouter,
  mountBackendRoutes,
};
