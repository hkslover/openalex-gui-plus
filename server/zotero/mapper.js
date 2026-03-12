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

function buildJournalRankingTags(journalRanking) {
  if (!journalRanking) return [];

  const tags = new Set();
  if (journalRanking.casLargeCategory?.zone) {
    tags.add(`ablesci:cas-large:${journalRanking.casLargeCategory.zone}`);
  }
  if (journalRanking.jcr?.quartiles?.length) {
    for (const quartile of journalRanking.jcr.quartiles) {
      if (quartile) {
        tags.add(`ablesci:jcr:${quartile}`);
      }
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

function buildJournalRankingExtra(journalRanking) {
  if (!journalRanking) return [];

  const lines = [];
  if (journalRanking.issn) lines.push(`AbleSci ISSN: ${journalRanking.issn}`);
  if (journalRanking.impactFactor?.value) {
    lines.push(`AbleSci Impact Factor: ${journalRanking.impactFactor.value}`);
  }
  if (journalRanking.casLargeCategory?.zone || journalRanking.casLargeCategory?.name) {
    lines.push(
      `AbleSci CAS Large Category: ${[journalRanking.casLargeCategory.zone, journalRanking.casLargeCategory.name]
        .filter(Boolean)
        .join(' ')}`,
    );
  }
  if (Array.isArray(journalRanking.casSmallCategories) && journalRanking.casSmallCategories.length) {
    lines.push(
      `AbleSci CAS Small Categories: ${journalRanking.casSmallCategories
        .map((category) => [category.zone, category.name].filter(Boolean).join(' '))
        .join('; ')}`,
    );
  }
  if (journalRanking.jcr?.summary) {
    lines.push(`AbleSci JCR Quartile: ${journalRanking.jcr.summary}`);
  }
  if (journalRanking.sourceUrl) {
    lines.push(`AbleSci Source: ${journalRanking.sourceUrl}`);
  }

  return lines;
}

function buildExtra(work, journalRanking) {
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

  lines.push(...buildJournalRankingExtra(journalRanking));

  return lines.join('\n');
}

function buildMetadataNote(work, journalRanking) {
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
  if (journalRanking?.impactFactor?.value) {
    summaryLines.push(`AbleSci IF: ${escapeHtml(journalRanking.impactFactor.value)}<br>`);
  }
  if (journalRanking?.casLargeCategory?.zone || journalRanking?.casLargeCategory?.name) {
    summaryLines.push(
      `AbleSci CAS: ${escapeHtml(
        [journalRanking.casLargeCategory.zone, journalRanking.casLargeCategory.name]
          .filter(Boolean)
          .join(' '),
      )}<br>`,
    );
  }
  if (journalRanking?.jcr?.summary) {
    summaryLines.push(`AbleSci JCR: ${escapeHtml(journalRanking.jcr.summary)}<br>`);
  }
  summaryLines.push('</p>');
  if (journalRanking) {
    summaryLines.push('<p><strong>AbleSci journal ranking</strong></p>');
    summaryLines.push(
      `<pre>${escapeHtml(JSON.stringify(journalRanking, null, 2))}</pre>`,
    );
  }
  summaryLines.push(
    `<pre>${escapeHtml(JSON.stringify(work, null, 2))}</pre>`,
  );
  return summaryLines.join('');
}

function mapOpenAlexWorkToZoteroItem(work, options = {}) {
  const journalRanking = options.journalRanking || null;
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
    tags: [...buildTags(work), ...buildJournalRankingTags(journalRanking)],
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
    extra: buildExtra(work, journalRanking),
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
