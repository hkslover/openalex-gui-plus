const axios = require('axios');
const { matchAll, normalizeIssn, stripTags } = require('./utils');

const ABLESCI_BASE_URL = 'https://www.ablesci.com';
const ABLESCI_SEARCH_URL = `${ABLESCI_BASE_URL}/journal/index`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1800;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const cache = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function normalizeJournalRankingSettings(settings = {}) {
  return {
    enabled: settings.enabled !== false,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function extractSection(html, id) {
  const marker = `id="${id}"`;
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) return '';

  const tableStart = html.indexOf('<table', startIndex);
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableStart === -1 || tableEnd === -1) return '';

  return html.slice(tableStart, tableEnd + 8);
}

function parseNameCell(html) {
  const fullNameMatch = html.match(/class="journal-fullname"[^>]*>([\s\S]*?)<\/span>/i);
  const abbrMatch = html.match(/class="journal-abbrname"[^>]*>([\s\S]*?)<\/span>/i);
  const hrefMatch = html.match(/<a[^>]+class="journal-name"[^>]+href="([^"]+)"/i);

  return {
    fullName: stripTags(fullNameMatch?.[1] || ''),
    abbreviation: stripTags(abbrMatch?.[1] || ''),
    detailUrl: hrefMatch?.[1]
      ? new URL(hrefMatch[1], `${ABLESCI_BASE_URL}/`).toString()
      : '',
  };
}

function parseImpactFactorCell(html) {
  const spans = matchAll(html, /<span([^>]*)>([\s\S]*?)<\/span>/gi);
  const primaryValue = stripTags(spans[0]?.[2] || '');
  const deltaValue = stripTags(spans[1]?.[2] || '');
  const deltaTitle = spans[1]?.[1]?.match(/title=['"]([^'"]+)['"]/i)?.[1] || '';

  return {
    value: primaryValue,
    delta: deltaValue,
    deltaDescription: deltaTitle,
  };
}

function parseCategoryCell(html) {
  const zoneMatch = html.match(/class="cas-category-num"[^>]*>([\s\S]*?)<\/span>/i);
  const nameMatch = html.match(/class="cas-category-name"[^>]*>([\s\S]*?)<\/span>/i);

  return {
    zone: stripTags(zoneMatch?.[1] || ''),
    name: stripTags(nameMatch?.[1] || ''),
  };
}

function parseSmallCategoriesCell(html) {
  const categoryMatches = matchAll(
    html,
    /class="cas-category-num"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="cas-category-name"[^>]*>([\s\S]*?)<\/span>/gi,
  );

  return categoryMatches.map((match) => ({
    zone: stripTags(match[1] || ''),
    name: stripTags(match[2] || ''),
  }));
}

function parseJcrCell(html) {
  const quartiles = matchAll(html, /class="cas-category-num"[^>]*>([\s\S]*?)<\/span>/gi)
    .map((match) => stripTags(match[1] || ''))
    .filter(Boolean);

  return {
    quartiles,
    summary: Array.from(new Set(quartiles)).join(', '),
  };
}

function parseResultRow(cells) {
  const nameCell = parseNameCell(cells[0]);
  const issn = normalizeIssn(stripTags(cells[1]));
  const impactFactor = parseImpactFactorCell(cells[2]);
  const casLargeCategory = parseCategoryCell(cells[3]);
  const casSmallCategories = parseSmallCategoriesCell(cells[4]);
  const jcr = parseJcrCell(cells[5]);

  return {
    issn,
    journalName: nameCell.fullName,
    journalAbbreviation: nameCell.abbreviation,
    detailUrl: nameCell.detailUrl,
    impactFactor,
    casLargeCategory,
    casSmallCategories,
    jcr,
  };
}

function parseSearchResults(html, issn) {
  const section = extractSection(html, 'search-results');
  if (!section) return null;

  const tbodyMatch = section.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;

  const rows = matchAll(tbodyMatch[1], /<tr>([\s\S]*?)<\/tr>/gi);
  const parsedRows = rows
    .map((rowMatch) => {
      const cells = matchAll(rowMatch[1], /<td\b[^>]*>([\s\S]*?)<\/td>/gi).map((cell) => cell[1]);
      if (cells.length < 6) return null;
      return parseResultRow(cells);
    })
    .filter(Boolean);

  if (!parsedRows.length) return null;

  return parsedRows.find((row) => row.issn === issn) || parsedRows[0];
}

async function fetchJournalRankingHtml(issn) {
  requestQueue = requestQueue
    .catch(() => null)
    .then(async () => {
      await waitForRateLimit();

      const response = await axios.get(ABLESCI_SEARCH_URL, {
        params: { keywords: issn },
        timeout: 30000,
        responseType: 'text',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: ABLESCI_BASE_URL,
        },
      });

      return response.data;
    });

  return requestQueue;
}

async function lookupJournalRankingByIssn(issn) {
  const normalizedIssn = normalizeIssn(issn);
  if (!normalizedIssn) {
    return null;
  }

  const cached = cache.get(normalizedIssn);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const html = await fetchJournalRankingHtml(normalizedIssn);
  const parsed = parseSearchResults(html, normalizedIssn);

  const result = parsed
    ? {
        ...parsed,
        source: 'ablesci',
        sourceUrl: `${ABLESCI_SEARCH_URL}?keywords=${encodeURIComponent(normalizedIssn)}`,
      }
    : null;

  cache.set(normalizedIssn, {
    cachedAt: Date.now(),
    data: result,
  });

  return result;
}

async function lookupFirstJournalRanking(issns = []) {
  const normalizedIssns = Array.from(
    new Set((issns || []).map(normalizeIssn).filter(Boolean)),
  );

  for (const issn of normalizedIssns) {
    const result = await lookupJournalRankingByIssn(issn);
    if (result) {
      return result;
    }
  }

  return null;
}

module.exports = {
  lookupFirstJournalRanking,
  lookupJournalRankingByIssn,
  normalizeJournalRankingSettings,
};
