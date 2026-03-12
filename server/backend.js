const express = require('express');
const { getClientStatus, importWorksToZotero, normalizeSettings } = require('./zotero/importer');
const {
  lookupFirstJournalRanking,
  normalizeJournalRankingSettings,
} = require('./journalRanking/service');
const {
  generateLiteratureBrief,
  normalizeLiteratureBriefSettings,
  streamLiteratureBrief,
  testLiteratureBriefConnection,
  writeSse,
} = require('./literatureBrief/service');

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
      const extraNotesById =
        req.body?.extraNotesById && typeof req.body.extraNotesById === 'object'
          ? req.body.extraNotesById
          : {};
      const settings = normalizeSettings(req.body?.settings || {});
      const result = await importWorksToZotero({ openalexIds, settings, extraNotesById });
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  });

  router.post('/journal-ranking/lookup', async (req, res) => {
    try {
      const issns = Array.isArray(req.body?.issns) ? req.body.issns : [];
      const settings = normalizeJournalRankingSettings(req.body?.settings || {});

      if (!settings.enabled) {
        res.json({
          enabled: false,
          result: null,
        });
        return;
      }

      const result = await lookupFirstJournalRanking(issns);
      res.json({
        enabled: true,
        result,
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  });

  router.post('/literature-brief/generate', async (req, res) => {
    try {
      const work = req.body?.work || {};
      const settings = normalizeLiteratureBriefSettings(req.body?.settings || {});

      if (!settings.enabled) {
        res.json({
          enabled: false,
          result: null,
        });
        return;
      }

      const result = await generateLiteratureBrief({ work, settings });
      res.json({
        enabled: true,
        result,
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  });

  router.post('/literature-brief/test', async (req, res) => {
    try {
      const settings = normalizeLiteratureBriefSettings(req.body?.settings || {});

      const result = await testLiteratureBriefConnection({ settings });
      res.json({
        enabled: settings.enabled,
        result,
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: error.code || null,
        status: error.status || null,
      });
    }
  });

  router.post('/literature-brief/stream', async (req, res) => {
    const work = req.body?.work || {};
    const settings = normalizeLiteratureBriefSettings(req.body?.settings || {});
    const abortController = new AbortController();

    res.on('close', () => {
      abortController.abort();
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      await streamLiteratureBrief({
        work,
        settings,
        signal: abortController.signal,
        onStart: async (payload) => {
          writeSse(res, 'start', payload);
        },
        onToken: async (delta) => {
          writeSse(res, 'delta', { delta });
        },
        onDone: async (result) => {
          writeSse(res, 'done', result);
        },
      });
    } catch (error) {
      if (!abortController.signal.aborted) {
        writeSse(res, 'error', {
          error: error.message,
          code: error.code || null,
          status: error.status || null,
        });
      }
    } finally {
      res.end();
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
