<template>
  <v-card
    v-if="shouldRenderCard"
    variant="outlined"
    class="literature-brief-card mt-4"
  >
    <div class="d-flex align-start justify-space-between ga-3">
      <div>
        <div class="text-overline literature-brief-card__eyebrow">Literature brief</div>
        <div class="text-body-2 font-weight-medium">
          {{ titleText }}
        </div>
      </div>
      <div class="d-flex align-center ga-1">
        <v-btn
          icon
          size="x-small"
          variant="text"
          :disabled="loading || !isConfigured"
          aria-label="Refresh literature brief"
          @click="scheduleGenerate(true)"
        >
          <v-icon size="18">mdi-refresh</v-icon>
        </v-btn>
        <v-btn
          icon
          size="x-small"
          variant="text"
          :to="{ name: 'settings-literature-brief' }"
          aria-label="Open literature brief settings"
        >
          <v-icon size="18">mdi-cog-outline</v-icon>
        </v-btn>
      </div>
    </div>

    <div v-if="!isConfigured" class="literature-brief-card__state mt-3 text-body-2 text-medium-emphasis">
      Add an API key, base URL, and model in settings to enable AI literature briefs.
    </div>

    <div v-else-if="errorMessage" class="literature-brief-card__state mt-3 text-body-2 text-medium-emphasis">
      {{ errorMessage }}
    </div>

    <div v-else-if="brief" class="mt-3">
      <div class="d-flex flex-wrap ga-2 mb-3">
        <v-chip size="small" color="primary" variant="tonal">
          OA abstract
        </v-chip>
        <v-chip v-if="brief.model" size="small" variant="outlined">
          {{ brief.model }}
        </v-chip>
        <v-chip v-if="brief.cached" size="small" variant="outlined">
          Cached
        </v-chip>
      </div>

      <div
        class="literature-brief-card__content markdown-content"
        v-html="renderedBriefHtml"
      />
      <div
        v-if="loading"
        class="literature-brief-card__streaming-indicator text-caption text-medium-emphasis mt-2"
      >
        Streaming...
      </div>
    </div>

    <div v-else-if="loading" class="literature-brief-card__state literature-brief-card__state--loading mt-3">
      <v-progress-circular indeterminate size="18" width="2" color="primary" />
      <span class="text-body-2 text-medium-emphasis">
        Generating a quick read of the abstract...
      </span>
    </div>
  </v-card>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { api } from '@/api';
import {
  loadLiteratureBriefSettings,
  normalizeLiteratureBriefSettings,
} from '@/literatureBrief/config';
import { renderLiteratureBriefMarkdown } from '@/literatureBrief/markdown';
import {
  extractWorkAbstract,
  hasOpenAccess,
  pickSourceName,
} from '@/literatureBrief/utils';

defineOptions({ name: 'EntityLiteratureBriefCard' });

const briefCache = new Map();

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

const emit = defineEmits(['state-change']);

const settings = ref(loadLiteratureBriefSettings());
const loading = ref(false);
const brief = ref(null);
const errorMessage = ref('');
const timerId = ref(null);
const abortController = ref(null);
const currentKey = ref('');
const streamingContent = ref('');

const abstractText = computed(() => extractWorkAbstract(props.entityData));
const isOpenAccess = computed(() => hasOpenAccess(props.entityData));
const isEligible = computed(() => props.entityType === 'works' && isOpenAccess.value && !!abstractText.value);
const shouldRenderCard = computed(() => settings.value.enabled === true && isEligible.value);
const isConfigured = computed(() => {
  return !!(settings.value.apiKey && settings.value.baseUrl && settings.value.model);
});

const titleText = computed(() => {
  if (loading.value) return 'Generating abstract walkthrough';
  if (brief.value) return 'AI summary of the abstract';
  if (!isConfigured.value) return 'Model setup required';
  if (errorMessage.value) return 'Literature brief unavailable';
  return 'Ready to summarize the abstract';
});

const renderedBriefHtml = computed(() => {
  return renderLiteratureBriefMarkdown(brief.value?.content || streamingContent.value || '');
});

function emitState(overrides = {}) {
  emit('state-change', {
    enabled: settings.value.enabled === true,
    configured: isConfigured.value,
    eligible: isEligible.value,
    loading: loading.value,
    ready: !!brief.value?.content,
    content: brief.value?.content || streamingContent.value || '',
    error: errorMessage.value || '',
    ...overrides,
  });
}

function buildWorkPayload() {
  return {
    id: props.entityData?.id,
    title: props.entityData?.title || props.entityData?.display_name || '',
    display_name: props.entityData?.display_name || '',
    publication_year: props.entityData?.publication_year || null,
    abstract: props.entityData?.abstract || '',
    abstract_inverted_index: props.entityData?.abstract_inverted_index || null,
    open_access: props.entityData?.open_access || null,
    best_oa_location: props.entityData?.best_oa_location || null,
    primary_location: props.entityData?.primary_location || null,
    host_venue: props.entityData?.host_venue || null,
    source_name: pickSourceName(props.entityData),
  };
}

function buildCacheKey() {
  return JSON.stringify({
    id: props.entityData?.id || '',
    abstract: abstractText.value,
    model: settings.value.model,
    baseUrl: settings.value.baseUrl,
    prompt: settings.value.prompt,
  });
}

function clearPending() {
  if (timerId.value) {
    window.clearTimeout(timerId.value);
    timerId.value = null;
  }
  if (abortController.value) {
    abortController.value.abort();
    abortController.value = null;
  }
}

async function generateBrief(forceRefresh = false) {
  settings.value = normalizeLiteratureBriefSettings(loadLiteratureBriefSettings());
  clearPending();

  if (!shouldRenderCard.value) {
    brief.value = null;
    streamingContent.value = '';
    errorMessage.value = '';
    loading.value = false;
    emitState({ ready: false, content: '' });
    return;
  }

  if (!isConfigured.value) {
    brief.value = null;
    streamingContent.value = '';
    errorMessage.value = '';
    loading.value = false;
    emitState({ ready: false, content: '' });
    return;
  }

  const nextKey = buildCacheKey();
  currentKey.value = nextKey;
  if (!forceRefresh && briefCache.has(nextKey)) {
    brief.value = briefCache.get(nextKey);
    streamingContent.value = brief.value?.content || '';
    errorMessage.value = '';
    loading.value = false;
    emitState();
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  streamingContent.value = '';
  emitState({ loading: true, ready: false, content: '' });
  abortController.value = new AbortController();

  try {
    await api.streamLiteratureBrief(
      buildWorkPayload(),
      settings.value,
      {
        onStart: async () => {
          brief.value = {
            cached: false,
            model: settings.value.model,
            content: '',
          };
          emitState({ loading: true, ready: false, content: '' });
        },
        onDelta: async (payload) => {
          const delta = payload?.delta || '';
          streamingContent.value += delta;
          brief.value = {
            ...(brief.value || {}),
            cached: false,
            model: settings.value.model,
            content: streamingContent.value,
          };
          emitState({ loading: true, ready: !!streamingContent.value, content: streamingContent.value });
        },
        onDone: async (payload) => {
          brief.value = payload || {
            cached: false,
            model: settings.value.model,
            content: streamingContent.value,
          };
          if (!brief.value.content) {
            brief.value.content = streamingContent.value;
          }
          emitState({ loading: true, ready: !!brief.value.content, content: brief.value.content });
        },
        onError: async (payload) => {
          throw new Error(payload?.error || 'Streaming request failed');
        },
      },
      abortController.value.signal,
    );

    if (currentKey.value !== nextKey) return;
    if (!brief.value?.content && !streamingContent.value) {
      throw new Error('The streaming request finished without returning any content.');
    }
    if (brief.value) {
      briefCache.set(nextKey, brief.value);
    }
  } catch (error) {
    if (error?.code === 'ERR_CANCELED') return;
    if (currentKey.value !== nextKey) return;
    brief.value = null;
    errorMessage.value = error.response?.data?.error || error.message;
    emitState({ loading: false, ready: false, content: '', error: errorMessage.value });
  } finally {
    if (currentKey.value === nextKey) {
      loading.value = false;
      emitState();
    }
    abortController.value = null;
  }
}

function scheduleGenerate(forceRefresh = false) {
  settings.value = normalizeLiteratureBriefSettings(loadLiteratureBriefSettings());
  clearPending();

  if (!shouldRenderCard.value) {
    brief.value = null;
    streamingContent.value = '';
    errorMessage.value = '';
    loading.value = false;
    emitState({ ready: false, content: '' });
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  emitState({ loading: true, ready: !!brief.value?.content, content: brief.value?.content || '' });

  timerId.value = window.setTimeout(() => {
    timerId.value = null;
    generateBrief(forceRefresh);
  }, 220);
}

watch(
  () => [props.entityData?.id, props.entityType, isOpenAccess.value, abstractText.value],
  () => {
    brief.value = null;
    streamingContent.value = '';
    scheduleGenerate(false);
  },
  { immediate: true, flush: 'post' },
);

onBeforeUnmount(() => {
  clearPending();
  emitState({ loading: false });
});
</script>

<style scoped>
.literature-brief-card {
  border-radius: 14px;
  padding: 16px 18px;
  background:
    linear-gradient(135deg, rgba(15, 106, 68, 0.05), rgba(15, 106, 68, 0.01)),
    #fff;
}

.literature-brief-card__eyebrow {
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.52);
}

.literature-brief-card__state--loading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.literature-brief-card__content {
  font-size: 14px;
  line-height: 1.65;
  color: rgba(0, 0, 0, 0.82);
}

.literature-brief-card__streaming-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(blockquote),
.markdown-content :deep(pre) {
  margin: 0 0 10px;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 20px;
}

.markdown-content :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
}

.markdown-content :deep(pre code) {
  display: block;
  padding: 12px;
  overflow-x: auto;
}
</style>
