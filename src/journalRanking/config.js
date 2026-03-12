export const JOURNAL_RANKING_SETTINGS_KEY = 'openalex-journal-ranking-settings';

export const defaultJournalRankingSettings = {
  enabled: true,
};

export function normalizeJournalRankingSettings(settings = {}) {
  return {
    ...defaultJournalRankingSettings,
    ...settings,
    enabled: settings.enabled !== false,
  };
}

export function loadJournalRankingSettings() {
  try {
    const raw = localStorage.getItem(JOURNAL_RANKING_SETTINGS_KEY);
    if (!raw) return normalizeJournalRankingSettings();
    return normalizeJournalRankingSettings(JSON.parse(raw));
  } catch (error) {
    return normalizeJournalRankingSettings();
  }
}

export function saveJournalRankingSettings(settings = {}) {
  const normalized = normalizeJournalRankingSettings(settings);
  localStorage.setItem(JOURNAL_RANKING_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}
