export function normalizeIssn(issn) {
  const cleaned = String(issn || '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');

  if (cleaned.length !== 8) return '';
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function extractWorkIssns(work) {
  const values = [];

  const add = (input) => {
    if (Array.isArray(input)) {
      input.forEach(add);
      return;
    }

    const normalized = normalizeIssn(input);
    if (normalized) {
      values.push(normalized);
    }
  };

  add(work?.primary_location?.source?.issn_l);
  add(work?.primary_location?.source?.issn);
  add(work?.best_oa_location?.source?.issn_l);
  add(work?.best_oa_location?.source?.issn);
  add(work?.host_venue?.issn_l);
  add(work?.host_venue?.issn);

  return Array.from(new Set(values));
}
