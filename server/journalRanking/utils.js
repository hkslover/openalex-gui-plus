function normalizeIssn(issn) {
  const cleaned = String(issn || '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');

  if (cleaned.length !== 8) return '';
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

function stripTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, '\'')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAll(source, pattern) {
  return Array.from(String(source || '').matchAll(pattern));
}

function extractWorkIssns(work) {
  const candidates = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const normalized = normalizeIssn(value);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  add(work?.primary_location?.source?.issn_l);
  add(work?.primary_location?.source?.issn);
  add(work?.best_oa_location?.source?.issn_l);
  add(work?.best_oa_location?.source?.issn);
  add(work?.host_venue?.issn_l);
  add(work?.host_venue?.issn);

  return Array.from(new Set(candidates));
}

module.exports = {
  extractWorkIssns,
  matchAll,
  normalizeIssn,
  stripTags,
};
