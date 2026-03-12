const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  checkLocalClient,
  createItemViaConnector,
  attachPdfViaConnector,
  getSelectedLibrary,
  updateSessionTarget,
} = require('./connector');
const { mapOpenAlexWorkToZoteroItem, buildMetadataNote } = require('./mapper');
const { fetchWorksByIds } = require('./openalex');
const { downloadOaPdf } = require('./pdf');
const { openAlexShortId } = require('./utils');

const DEFAULT_SETTINGS = {
  endpoint: 'http://localhost:23119/api',
  downloadPdf: true,
  includeMetadataNote: true,
  mailto: 'ui@openalex.org',
  timeoutMs: 30000,
  targetId: null,
};

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    endpoint: String(settings.endpoint || DEFAULT_SETTINGS.endpoint).trim() || DEFAULT_SETTINGS.endpoint,
    downloadPdf: settings.downloadPdf !== false,
    includeMetadataNote: settings.includeMetadataNote !== false,
    mailto: String(settings.mailto || DEFAULT_SETTINGS.mailto).trim() || DEFAULT_SETTINGS.mailto,
    timeoutMs: Number(settings.timeoutMs) > 0 ? Number(settings.timeoutMs) : DEFAULT_SETTINGS.timeoutMs,
    targetId: settings.targetId ? String(settings.targetId) : null,
  };
}

async function getClientStatus(settings = {}) {
  const normalized = normalizeSettings(settings);
  const client = await checkLocalClient(normalized);

  let library = null;
  if (client.running) {
    try {
      library = await getSelectedLibrary(normalized);
    } catch (error) {
      library = {
        error: error.message,
      };
    }
  }

  return {
    settings: normalized,
    client,
    library,
  };
}

async function importWorksToZotero({ openalexIds = [], settings = {} } = {}) {
  const normalized = normalizeSettings(settings);
  const ids = Array.from(new Set((openalexIds || []).filter(Boolean)));

  if (!ids.length) {
    throw new Error('No OpenAlex works were selected');
  }

  const clientStatus = await checkLocalClient(normalized);
  if (!clientStatus.running) {
    throw new Error(
      `Zotero client is not available at ${clientStatus.url}: ${
        clientStatus.error || `HTTP ${clientStatus.status}`
      }`,
    );
  }

  let library = null;
  try {
    library = await getSelectedLibrary(normalized);
  } catch (error) {
    library = {
      error: error.message,
    };
  }

  const resolvedWorks = await fetchWorksByIds(ids, normalized);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openalex-gui-zotero-'));

  const summary = {
    requested: ids.length,
    fetched: 0,
    imported: 0,
    downloadedPdf: 0,
    attachedPdf: 0,
    failed: 0,
  };
  const results = [];

  try {
    for (const resolved of resolvedWorks) {
      if (resolved.status !== 'success') {
        summary.failed += 1;
        results.push({
          status: 'failed',
          input: resolved.input,
          openalexId: openAlexShortId(resolved.input),
          stage: 'fetch',
          error: resolved.error,
        });
        continue;
      }

      summary.fetched += 1;

      const work = resolved.work;
      const zoteroItem = mapOpenAlexWorkToZoteroItem(work);
      const notes = normalized.includeMetadataNote ? [buildMetadataNote(work)] : [];

      try {
        const created = await createItemViaConnector(normalized, zoteroItem, work, notes);
        const targetToUse = normalized.targetId || library?.currentTargetId || null;

        if (targetToUse) {
          await updateSessionTarget(normalized, created.sessionID, targetToUse);
        }

        let pdf = null;
        let pdfAttached = false;

        if (normalized.downloadPdf) {
          try {
            pdf = await downloadOaPdf(work, tempDir);
            if (pdf) {
              summary.downloadedPdf += 1;
              await attachPdfViaConnector(
                normalized,
                created.sessionID,
                created.connectorItemID,
                pdf.filePath,
                `${zoteroItem.title || 'OpenAlex paper'} (PDF)`,
                pdf.url,
              );
              summary.attachedPdf += 1;
              pdfAttached = true;
            }
          } catch (error) {
            results.push({
              status: 'warning',
              input: resolved.input,
              openalexId: openAlexShortId(work.id),
              title: zoteroItem.title || work.display_name || work.title || 'Untitled',
              connectorItemID: created.connectorItemID,
              pdfAttached: false,
              error: `Paper imported, but PDF push failed: ${error.message}`,
            });
            summary.imported += 1;
            continue;
          }
        }

        summary.imported += 1;
        results.push({
          status: 'success',
          input: resolved.input,
          openalexId: openAlexShortId(work.id),
          title: zoteroItem.title || work.display_name || work.title || 'Untitled',
          connectorItemID: created.connectorItemID,
          pdfAttached,
          hasOaPdf: !!pdf,
        });
      } catch (error) {
        summary.failed += 1;
        results.push({
          status: 'failed',
          input: resolved.input,
          openalexId: openAlexShortId(work.id),
          title: work.display_name || work.title || 'Untitled',
          stage: 'import',
          error: error.message,
        });
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return {
    settings: normalized,
    client: clientStatus,
    library,
    summary,
    results,
  };
}

module.exports = {
  getClientStatus,
  importWorksToZotero,
  normalizeSettings,
};
