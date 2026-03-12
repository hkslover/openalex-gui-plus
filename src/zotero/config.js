export const ZOTERO_SETTINGS_KEY = 'openalex-zotero-settings';

export const defaultZoteroSettings = {
  endpoint: 'http://localhost:23119/api',
  downloadPdf: true,
  includeMetadataNote: true,
  mailto: 'ui@openalex.org',
  targetId: null,
};

export function normalizeZoteroSettings(settings = {}) {
  return {
    ...defaultZoteroSettings,
    ...settings,
    endpoint: String(settings.endpoint || defaultZoteroSettings.endpoint).trim() || defaultZoteroSettings.endpoint,
    downloadPdf: settings.downloadPdf !== false,
    includeMetadataNote: settings.includeMetadataNote !== false,
    mailto: String(settings.mailto || defaultZoteroSettings.mailto).trim() || defaultZoteroSettings.mailto,
    targetId: settings.targetId ? String(settings.targetId) : null,
  };
}

export function loadZoteroSettings() {
  try {
    const raw = localStorage.getItem(ZOTERO_SETTINGS_KEY);
    if (!raw) return normalizeZoteroSettings();
    return normalizeZoteroSettings(JSON.parse(raw));
  } catch (error) {
    return normalizeZoteroSettings();
  }
}

export function saveZoteroSettings(settings = {}) {
  const normalized = normalizeZoteroSettings(settings);
  localStorage.setItem(ZOTERO_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}
