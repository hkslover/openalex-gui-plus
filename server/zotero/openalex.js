const axios = require('axios');
const { openAlexShortId } = require('./utils');

const OPENALEX_API_BASE = 'https://api.openalex.org';

function createOpenAlexClient(config = {}) {
  return axios.create({
    baseURL: OPENALEX_API_BASE,
    timeout: config.timeoutMs || 30000,
    headers: {
      'User-Agent': 'openalex-gui-zotero-importer/1.0',
    },
  });
}

async function fetchWorkById(client, openalexId, config = {}) {
  const shortId = openAlexShortId(openalexId);
  if (!shortId) {
    throw new Error('OpenAlex work id is required');
  }

  const response = await client.get(`/works/${shortId}`, {
    params: {
      mailto: config.mailto || 'ui@openalex.org',
    },
  });

  return response.data;
}

async function fetchWorksByIds(openalexIds = [], config = {}) {
  const client = createOpenAlexClient(config);
  const ids = Array.from(new Set((openalexIds || []).filter(Boolean)));
  const results = [];

  for (const id of ids) {
    try {
      const work = await fetchWorkById(client, id, config);
      results.push({
        status: 'success',
        input: id,
        work,
      });
    } catch (error) {
      const status = error?.response?.status;
      const message = status
        ? `OpenAlex request failed with ${status}`
        : error.message;
      results.push({
        status: 'failed',
        input: id,
        error: message,
      });
    }
  }

  return results;
}

module.exports = {
  fetchWorksByIds,
};
