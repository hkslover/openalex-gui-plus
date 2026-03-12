const crypto = require('crypto');

function generateWriteToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

function openAlexShortId(id) {
  if (!id) return '';
  if (id.includes('/')) {
    const parts = id.split('/');
    return parts[parts.length - 1];
  }
  return id;
}

function normalizeDoi(doi) {
  if (!doi) return '';
  return doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim();
}

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  escapeHtml,
  generateWriteToken,
  normalizeDoi,
  openAlexShortId,
  sanitizeFilename,
};
