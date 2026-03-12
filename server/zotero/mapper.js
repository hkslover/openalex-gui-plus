const { escapeHtml, normalizeDoi } = require('./utils');

function abstractFromInvertedIndex(invertedIndex) {
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

function mapWorkTypeToZoteroItemType(work) {
  const type = work?.type || '';
  const map = {
    article: 'journalArticle',
    'book-chapter': 'bookSection',
    dissertation: 'thesis',
    book: 'book',
    dataset: 'dataset',
    report: 'report',
    'edited-book': 'book',
    standard: 'report',
    letter: 'journalArticle',
    editorial: 'journalArticle',
    erratum: 'journalArticle',
    'peer-review': 'journalArticle',
    other: 'journalArticle',
    paratext: 'journalArticle',
    'reference-entry': 'encyclopediaArticle',
    grant: 'report',
  };
  return map[type] || 'journalArticle';
}

function splitName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const first = rest.join(',').trim();
    if (first) {
      return { firstName: first, lastName: last.trim() };
    }
    return { name: trimmed };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { name: parts[0] };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function buildCreators(work) {
  const authorships = Array.isArray(work?.authorships) ? work.authorships : [];
  return authorships.slice(0, 100).map((authorship) => {
    const rawName =
      authorship?.author?.display_name ||
      authorship?.raw_author_name ||
      authorship?.author?.id ||
      'Unknown';
    const split = splitName(rawName);

    if (!split) return { creatorType: 'author', name: rawName };
    if (split.name) return { creatorType: 'author', name: split.name };

    return {
      creatorType: 'author',
      firstName: split.firstName,
      lastName: split.lastName,
    };
  });
}

function pickPrimarySource(work) {
  return (
    work?.primary_location?.source ||
    work?.best_oa_location?.source ||
    work?.host_venue?.source ||
    null
  );
}

function pickPublisher(work) {
  const source = pickPrimarySource(work);
  return (
    source?.host_organization_name ||
    source?.host_organization_lineage_names?.[0] ||
    source?.host_organization ||
    ''
  );
}

function pickIssn(work) {
  const source = pickPrimarySource(work);
  if (!source) return '';
  if (Array.isArray(source.issn) && source.issn.length > 0) {
    return source.issn[0];
  }
  return source.issn_l || '';
}

function buildPages(work) {
  const first = work?.biblio?.first_page || '';
  const last = work?.biblio?.last_page || '';
  if (first && last) return `${first}-${last}`;
  return first || last || '';
}

function buildTags(work) {
  const tags = new Set();

  if (work?.type) tags.add(`openalex:type:${work.type}`);
  if (work?.open_access?.oa_status) {
    tags.add(`openalex:oa_status:${work.open_access.oa_status}`);
  }
  if (typeof work?.cited_by_count === 'number') {
    tags.add(`openalex:cited_by:${work.cited_by_count}`);
  }

  const concepts = Array.isArray(work?.concepts) ? work.concepts : [];
  for (const concept of concepts.slice(0, 12)) {
    if (concept?.display_name) {
      tags.add(concept.display_name);
    }
  }

  return Array.from(tags).map((tag) => ({ tag }));
}

function buildRelations(work) {
  const relations = [];
  if (work?.id) relations.push(work.id);
  if (Array.isArray(work?.referenced_works)) {
    relations.push(...work.referenced_works.slice(0, 20));
  }
  return relations.length ? { 'dc:relation': relations } : undefined;
}

function buildExtra(work) {
  const lines = [];

  if (work?.id) lines.push(`OpenAlex ID: ${work.id}`);
  if (work?.doi) lines.push(`DOI: ${normalizeDoi(work.doi)}`);
  if (typeof work?.cited_by_count === 'number') {
    lines.push(`Cited by: ${work.cited_by_count}`);
  }
  if (work?.open_access) {
    lines.push(`Open access: ${work.open_access.is_oa ? 'yes' : 'no'}`);
    if (work.open_access.oa_status) {
      lines.push(`OA status: ${work.open_access.oa_status}`);
    }
    if (work.open_access.oa_url) {
      lines.push(`OA URL: ${work.open_access.oa_url}`);
    }
  }

  return lines.join('\n');
}

function buildMetadataNote(work) {
  const summaryLines = [];
  summaryLines.push(`<p><strong>OpenAlex metadata snapshot</strong></p>`);
  summaryLines.push('<p>');
  if (work?.id) summaryLines.push(`${escapeHtml(work.id)}<br>`);
  if (work?.doi) summaryLines.push(`DOI: ${escapeHtml(work.doi)}<br>`);
  if (typeof work?.cited_by_count === 'number') {
    summaryLines.push(`Cited by: ${escapeHtml(work.cited_by_count)}<br>`);
  }
  if (work?.open_access?.oa_url) {
    summaryLines.push(`OA URL: ${escapeHtml(work.open_access.oa_url)}<br>`);
  }
  summaryLines.push('</p>');
  summaryLines.push(
    `<pre>${escapeHtml(JSON.stringify(work, null, 2))}</pre>`,
  );
  return summaryLines.join('');
}

function mapOpenAlexWorkToZoteroItem(work) {
  const source = pickPrimarySource(work);
  const title = work?.title || work?.display_name || 'Untitled';
  const abstractNote =
    work?.abstract ||
    abstractFromInvertedIndex(work?.abstract_inverted_index) ||
    '';

  const item = {
    itemType: mapWorkTypeToZoteroItemType(work),
    title,
    creators: buildCreators(work),
    abstractNote,
    date: work?.publication_date || String(work?.publication_year || ''),
    tags: buildTags(work),
    relations: buildRelations(work),
    url: work?.doi || work?.id || '',
    accessDate: new Date().toISOString(),
    DOI: normalizeDoi(work?.doi),
    ISSN: pickIssn(work),
    language: work?.language || '',
    pages: buildPages(work),
    publicationTitle: source?.display_name || '',
    publisher: pickPublisher(work),
    volume: work?.biblio?.volume || '',
    issue: work?.biblio?.issue || '',
    extra: buildExtra(work),
  };

  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || value === null) {
      delete item[key];
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      delete item[key];
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete item[key];
    }
  }

  return item;
}

module.exports = {
  abstractFromInvertedIndex,
  buildMetadataNote,
  mapOpenAlexWorkToZoteroItem,
  mapWorkTypeToZoteroItemType,
};
