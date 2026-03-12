const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const { openAlexShortId, sanitizeFilename } = require('./utils');

function pickPdfCandidate(work) {
  const candidates = [];
  const addCandidate = (url, source) => {
    if (!url || typeof url !== 'string') return;
    candidates.push({ url, source });
  };

  if (work?.best_oa_location?.pdf_url) {
    addCandidate(work.best_oa_location.pdf_url, 'best_oa_location.pdf_url');
  }
  if (work?.primary_location?.pdf_url) {
    addCandidate(work.primary_location.pdf_url, 'primary_location.pdf_url');
  }
  if (Array.isArray(work?.locations)) {
    for (const location of work.locations) {
      addCandidate(location?.pdf_url, 'locations[].pdf_url');
    }
  }
  if (work?.open_access?.oa_url && /\.pdf([?#].*)?$/i.test(work.open_access.oa_url)) {
    addCandidate(work.open_access.oa_url, 'open_access.oa_url');
  }

  const seen = new Set();
  return candidates.find((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }) || null;
}

async function downloadOaPdf(work, downloadDir) {
  if (!work?.open_access?.is_oa) return null;

  const candidate = pickPdfCandidate(work);
  if (!candidate) return null;

  await fs.mkdir(downloadDir, { recursive: true });

  const response = await axios.get(candidate.url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const buffer = Buffer.from(response.data || []);
  if (!buffer.length) {
    throw new Error(`Downloaded PDF is empty: ${candidate.url}`);
  }

  const shortId = openAlexShortId(work.id) || 'openalex-work';
  const title = sanitizeFilename(work?.title || work?.display_name || shortId);
  const filename = `${title}__${shortId}.pdf`;
  const filePath = path.join(downloadDir, filename);

  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    url: candidate.url,
    source: candidate.source,
  };
}

module.exports = {
  downloadOaPdf,
  pickPdfCandidate,
};
