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
const {
  lookupFirstJournalRanking,
  normalizeJournalRankingSettings,
} = require('../journalRanking/service');
const { extractWorkIssns } = require('../journalRanking/utils');

const DEFAULT_SETTINGS = {
  endpoint: 'http://localhost:23119/api',
  downloadPdf: true,
  includeMetadataNote: true,
  mailto: 'ui@openalex.org',
  timeoutMs: 30000,
  targetId: null,
  journalRanking: normalizeJournalRankingSettings(),
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
    journalRanking: normalizeJournalRankingSettings(settings.journalRanking || {}),
  };
}

function uniqueNoteKey(note) {
  if (!note) return '';
  if (typeof note === 'string') return note.trim();

  const normalized = {
    note: String(note.note || '').trim(),
    tags: Array.isArray(note.tags) ? note.tags : [],
  };

  return JSON.stringify(normalized);
}

function collectUniqueExtraNotes(extraNotesById, keys = []) {
  const seenKeys = new Set();
  const seenNotes = new Set();
  const notes = [];

  for (const key of keys.filter(Boolean)) {
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const values = Array.isArray(extraNotesById[key]) ? extraNotesById[key] : [extraNotesById[key]];
    for (const note of values.filter(Boolean)) {
      const noteKey = uniqueNoteKey(note);
      if (!noteKey || seenNotes.has(noteKey)) continue;

      seenNotes.add(noteKey);
      notes.push(note);
    }
  }

  return notes;
}

function pickTargetForImport(library, preferredTargetId, requireFilesEditable = false) {
  const targets = Array.isArray(library?.targets) ? library.targets : [];
  const fallbackTargets = requireFilesEditable
    ? targets.filter((target) => target.filesEditable)
    : targets;

  const preferredTarget = targets.find((target) => target.id === preferredTargetId);
  if (preferredTarget && (!requireFilesEditable || preferredTarget.filesEditable)) {
    return preferredTarget;
  }

  if (fallbackTargets.length) {
    return fallbackTargets[0];
  }

  return preferredTarget || null;
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

async function importWorksToZotero({ openalexIds = [], settings = {}, extraNotesById = {} } = {}) {
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
      let journalRanking = null;
      try {
        if (normalized.journalRanking?.enabled) {
          journalRanking = await lookupFirstJournalRanking(extractWorkIssns(work));
        }
      } catch (error) {
        journalRanking = null;
      }

      const zoteroItem = mapOpenAlexWorkToZoteroItem(work, { journalRanking });
      const notes = [];
      if (normalized.includeMetadataNote) {
        notes.push(buildMetadataNote(work, journalRanking));
      }

      const extraNotes = collectUniqueExtraNotes(extraNotesById, [
        resolved.input,
        work.id,
        openAlexShortId(work.id),
      ]);
      notes.push(...extraNotes);

      try {
        const created = await createItemViaConnector(normalized, zoteroItem, work, notes);
        const targetToUse = pickTargetForImport(
          library,
          normalized.targetId || library?.currentTargetId || null,
          normalized.downloadPdf,
        )?.id || null;

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
          journalRanking,
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
