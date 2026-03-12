export function abstractFromInvertedIndex(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';

  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      words[position] = word;
    }
  }

  return words.filter(Boolean).join(' ').trim();
}

export function extractWorkAbstract(work) {
  return String(
    work?.abstract ||
      work?.summary ||
      abstractFromInvertedIndex(work?.abstract_inverted_index) ||
      '',
  ).trim();
}

export function hasOpenAccess(work) {
  return !!(
    work?.open_access?.is_oa ||
    work?.open_access?.oa_url ||
    work?.best_oa_location?.pdf_url ||
    work?.best_oa_location?.landing_page_url
  );
}

export function pickSourceName(work) {
  return (
    work?.primary_location?.source?.display_name ||
    work?.best_oa_location?.source?.display_name ||
    work?.host_venue?.display_name ||
    ''
  );
}
