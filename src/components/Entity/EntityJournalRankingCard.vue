<template>
  <v-card
    v-if="isEnabled && shouldShowCard"
    variant="outlined"
    class="journal-ranking-card mt-4"
  >
    <div class="d-flex align-start justify-space-between ga-3">
      <div>
        <div class="text-overline journal-ranking-card__eyebrow">Journal ranking</div>
        <div class="text-body-2 font-weight-medium">
          {{ cardTitle }}
        </div>
      </div>
      <v-btn
        icon
        size="x-small"
        variant="text"
        :to="{ name: 'settings-journal-ranking' }"
        aria-label="Open journal ranking settings"
      >
        <v-icon size="18">mdi-cog-outline</v-icon>
      </v-btn>
    </div>

    <div v-if="loading" class="journal-ranking-card__state journal-ranking-card__state--loading">
      <v-progress-circular
        indeterminate
        size="18"
        width="2"
        color="primary"
      />
      <span class="text-body-2 text-medium-emphasis">
        Looking up AbleSci journal ranking by ISSN...
      </span>
    </div>

    <div v-else-if="ranking" class="mt-3">
      <div class="d-flex flex-wrap ga-2 mb-3">
        <v-chip
          v-if="ranking.impactFactor?.value"
          size="small"
          color="primary"
          variant="tonal"
        >
          IF {{ ranking.impactFactor.value }}
        </v-chip>
        <v-chip
          v-if="casLargeSummary"
          size="small"
          color="success"
          variant="tonal"
        >
          CAS {{ casLargeSummary }}
        </v-chip>
        <v-chip
          v-if="ranking.jcr?.summary"
          size="small"
          color="grey-darken-1"
          variant="outlined"
        >
          JCR {{ ranking.jcr.summary }}
        </v-chip>
      </div>

      <div class="journal-ranking-card__meta">
        <div v-if="ranking.journalName" class="journal-ranking-card__line">
          <span class="journal-ranking-card__label">Journal</span>
          <span>{{ ranking.journalName }}</span>
        </div>
        <div v-if="ranking.issn" class="journal-ranking-card__line">
          <span class="journal-ranking-card__label">ISSN</span>
          <span>{{ ranking.issn }}</span>
        </div>
        <div
          v-if="ranking.casSmallCategories?.length"
          class="journal-ranking-card__line journal-ranking-card__line--stack"
        >
          <span class="journal-ranking-card__label">CAS small categories</span>
          <div class="d-flex flex-wrap ga-2">
            <span
              v-for="category in ranking.casSmallCategories"
              :key="`${category.zone}-${category.name}`"
              class="journal-ranking-card__pill"
            >
              {{ [category.zone, category.name].filter(Boolean).join(' ') }}
            </span>
          </div>
        </div>
      </div>

      <div class="mt-3">
        <a
          :href="ranking.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="journal-ranking-card__link"
        >
          View AbleSci source
        </a>
      </div>
    </div>

    <div
      v-else-if="lookupError"
      class="journal-ranking-card__state text-body-2 text-medium-emphasis mt-3"
    >
      {{ lookupError }}
    </div>

    <div
      v-else-if="issns.length"
      class="journal-ranking-card__state text-body-2 text-medium-emphasis mt-3"
    >
      No ranking match found on AbleSci for {{ issns.join(', ') }}.
    </div>

    <div
      v-else
      class="journal-ranking-card__state text-body-2 text-medium-emphasis mt-3"
    >
      No journal ISSN is available in the OpenAlex record for this work.
    </div>
  </v-card>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { api } from '@/api';
import { loadJournalRankingSettings } from '@/journalRanking/config';
import { extractWorkIssns } from '@/journalRanking/utils';

defineOptions({ name: 'EntityJournalRankingCard' });

const rankingCache = new Map();

const props = defineProps({
  entityData: {
    type: Object,
    default: null,
  },
  entityType: {
    type: String,
    default: '',
  },
});

const loading = ref(false);
const ranking = ref(null);
const lookupError = ref('');
const currentLookupKey = ref('');
const settings = ref(loadJournalRankingSettings());
const lookupTimerId = ref(null);
const abortController = ref(null);

const isEnabled = computed(() => settings.value.enabled !== false);
const issns = computed(() => extractWorkIssns(props.entityData));
const shouldShowCard = computed(() => props.entityType === 'works');
const casLargeSummary = computed(() => {
  if (!ranking.value?.casLargeCategory) return '';
  return [ranking.value.casLargeCategory.zone, ranking.value.casLargeCategory.name]
    .filter(Boolean)
    .join(' ');
});

const cardTitle = computed(() => {
  if (loading.value) return 'Checking journal ranking';
  if (ranking.value?.journalName) return ranking.value.journalName;
  if (lookupError.value) return 'Journal ranking unavailable';
  if (issns.value.length) return 'No ranking found';
  return 'Missing ISSN';
});

function clearPendingWork() {
  if (lookupTimerId.value) {
    window.clearTimeout(lookupTimerId.value);
    lookupTimerId.value = null;
  }
  if (abortController.value) {
    abortController.value.abort();
    abortController.value = null;
  }
}

async function refreshRankingNow(nextLookupKey) {
  if (rankingCache.has(nextLookupKey)) {
    ranking.value = rankingCache.get(nextLookupKey);
    lookupError.value = '';
    loading.value = false;
    return;
  }

  abortController.value = new AbortController();

  try {
    const response = await api.lookupJournalRanking(
      issns.value,
      settings.value,
      { signal: abortController.value.signal },
    );
    if (currentLookupKey.value !== nextLookupKey) return;
    ranking.value = response?.result || null;
    rankingCache.set(nextLookupKey, ranking.value);
  } catch (error) {
    if (error?.code === 'ERR_CANCELED') return;
    if (currentLookupKey.value !== nextLookupKey) return;
    ranking.value = null;
    lookupError.value = error.response?.data?.error || error.message;
  } finally {
    if (currentLookupKey.value === nextLookupKey) {
      loading.value = false;
    }
    abortController.value = null;
  }
}

function scheduleRefreshRanking() {
  settings.value = loadJournalRankingSettings();
  clearPendingWork();

  if (!isEnabled.value || !shouldShowCard.value) {
    ranking.value = null;
    lookupError.value = '';
    loading.value = false;
    return;
  }

  if (!props.entityData?.id || !issns.value.length) {
    ranking.value = null;
    lookupError.value = '';
    loading.value = false;
    return;
  }

  const nextLookupKey = `${props.entityData?.id || ''}:${issns.value.join(',')}`;
  currentLookupKey.value = nextLookupKey;
  loading.value = true;
  lookupError.value = '';

  lookupTimerId.value = window.setTimeout(() => {
    lookupTimerId.value = null;
    refreshRankingNow(nextLookupKey);
  }, 180);
}

watch(
  () => [props.entityData?.id, props.entityType, ...issns.value],
  scheduleRefreshRanking,
  { immediate: true, flush: 'post' },
);

onBeforeUnmount(() => {
  clearPendingWork();
});
</script>

<style scoped>
.journal-ranking-card {
  border-radius: 14px;
  padding: 16px 18px;
  background:
    radial-gradient(circle at top right, rgba(46, 125, 50, 0.06), transparent 40%),
    #fff;
}

.journal-ranking-card__eyebrow {
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.52);
}

.journal-ranking-card__state {
  min-height: 24px;
}

.journal-ranking-card__state--loading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.journal-ranking-card__meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.journal-ranking-card__line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.journal-ranking-card__line--stack {
  align-items: flex-start;
  flex-direction: column;
}

.journal-ranking-card__label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.5);
  min-width: 92px;
}

.journal-ranking-card__pill {
  font-size: 12px;
  line-height: 1.2;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
}

.journal-ranking-card__link {
  color: #0f6a44;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.journal-ranking-card__link:hover {
  text-decoration: underline;
}
</style>
