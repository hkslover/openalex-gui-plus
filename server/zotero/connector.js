const axios = require('axios');
const fs = require('fs/promises');
const { generateWriteToken, openAlexShortId } = require('./utils');

function buildConnectorBaseURL(endpoint) {
  const normalized = String(endpoint || 'http://localhost:23119/api').replace(/\/$/, '');
  return normalized.replace(/\/api\/?$/, '');
}

async function connectorRequest(endpoint, reqPath, options = {}) {
  const url = `${buildConnectorBaseURL(endpoint)}${reqPath}`;
  const response = await axios({
    url,
    method: options.method || 'POST',
    headers: options.headers || {},
    data: options.data,
    timeout: options.timeout || 30000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
    responseType: 'text',
    transformResponse: [(data) => data],
  });

  const contentType = response.headers['content-type'] || '';
  let parsedData = response.data;
  if (contentType.includes('application/json') && typeof response.data === 'string' && response.data.length) {
    try {
      parsedData = JSON.parse(response.data);
    } catch (error) {
      parsedData = response.data;
    }
  }

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string' ? response.data.slice(0, 600) : JSON.stringify(parsedData);
    throw new Error(
      `Zotero Connector request failed ${response.status} ${response.statusText}: ${reqPath}\n${detail}`,
    );
  }

  return {
    status: response.status,
    headers: response.headers,
    data: parsedData,
    raw: response.data,
  };
}

async function checkLocalClient(config = {}) {
  const endpoint = config.endpoint || 'http://localhost:23119/api';
  const url = `${buildConnectorBaseURL(endpoint)}/connector/ping`;

  try {
    const response = await axios.get(url, {
      timeout: config.timeoutMs || 5000,
      responseType: 'text',
      transformResponse: [(data) => data],
      validateStatus: () => true,
    });

    return {
      running: response.status >= 200 && response.status < 300,
      status: response.status,
      version: response.headers['x-zotero-version'] || null,
      connectorApiVersion: response.headers['x-zotero-connector-api-version'] || null,
      body: response.data,
      url,
    };
  } catch (error) {
    return {
      running: false,
      status: null,
      version: null,
      connectorApiVersion: null,
      body: null,
      url,
      error: error.message,
    };
  }
}

async function getSelectedLibrary(config = {}) {
  const response = await connectorRequest(config.endpoint, '/connector/getSelectedCollection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({
      switchToReadableLibrary: false,
    }),
    timeout: config.timeoutMs || 5000,
  });

  const data = response.data || {};
  const currentTargetId = data.id ? `C${data.id}` : `L${data.libraryID}`;

  return {
    ...data,
    currentTargetId,
  };
}

function normalizeConnectorNotes(notes) {
  if (!notes) return [];
  const values = Array.isArray(notes) ? notes : [notes];
  return values
    .filter(Boolean)
    .map((note) => {
      if (typeof note === 'string') {
        return { note };
      }
      return {
        note: note.note || '',
        tags: note.tags,
      };
    })
    .filter((note) => note.note && note.note.trim());
}

function toConnectorItem(zoteroItem, connectorItemID, notes) {
  const item = {
    ...zoteroItem,
    id: connectorItemID,
    complete: true,
    attachments: [],
  };

  if (Array.isArray(item.tags)) {
    item.tags = item.tags
      .map((tag) => (typeof tag === 'string' ? tag : tag?.tag))
      .filter(Boolean);
  }

  const normalizedNotes = normalizeConnectorNotes(notes);
  if (normalizedNotes.length) {
    item.notes = normalizedNotes;
  }

  return item;
}

async function createItemViaConnector(config, zoteroItem, work, notes) {
  const sessionID = generateWriteToken();
  const connectorItemID = `openalex-${openAlexShortId(work?.id) || Date.now()}`;

  await connectorRequest(config.endpoint, '/connector/saveItems', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({
      sessionID,
      uri: zoteroItem.url || work?.id || '',
      items: [toConnectorItem(zoteroItem, connectorItemID, notes)],
    }),
    timeout: config.timeoutMs || 30000,
  });

  return {
    sessionID,
    connectorItemID,
  };
}

async function updateSessionTarget(config, sessionID, target) {
  if (!sessionID || !target) return;

  await connectorRequest(config.endpoint, '/connector/updateSession', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({
      sessionID,
      target,
    }),
    timeout: config.timeoutMs || 30000,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachPdfViaConnector(config, sessionID, parentConnectorItemID, pdfPath, title, sourceUrl) {
  const buffer = await fs.readFile(pdfPath);
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await connectorRequest(config.endpoint, '/connector/saveAttachment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(buffer.length),
          'X-Metadata': JSON.stringify({
            sessionID,
            parentItemID: parentConnectorItemID,
            title,
            url: sourceUrl || '',
          }),
        },
        data: buffer,
        timeout: 120000,
      });

      const responseText = typeof response.raw === 'string' ? response.raw.trim() : '';
      if (/files are not editable/i.test(responseText)) {
        throw new Error(responseText);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

module.exports = {
  attachPdfViaConnector,
  checkLocalClient,
  createItemViaConnector,
  getSelectedLibrary,
  updateSessionTarget,
};
