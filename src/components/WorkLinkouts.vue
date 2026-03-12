<template>
  <div v-if="data" class="d-flex align-center flex-wrap ga-3">
    <v-btn
      rounded
      variant="flat"
      :href="data.primary_location.landing_page_url"
      target="_blank"
      :color="data.primary_location?.is_oa ? 'primary' : 'grey darken-1'"
    >
      <template v-if="data.primary_location?.source?.display_name === 'PubMed'">
        PubMed
      </template>
      <template v-else-if="isOaAtPublisher">
        HTML
      </template>
      <template v-else>
        <v-icon start>mdi-lock</v-icon>
        HTML
      </template>
      <v-icon size="small" class="ml-1">mdi-open-in-new</v-icon>
    </v-btn>

    <!--   PDF anywhere -->
    <v-btn
      rounded
      variant="flat"
      color="primary"
      :href="pdfUrl"
      target="_blank"
      v-if="pdfUrl"
    >
      PDF
    </v-btn>

    <v-select
      v-if="availableTargets.length"
      v-model="targetId"
      :items="availableTargets"
      item-title="label"
      item-value="id"
      size="small"
      hide-details
      variant="outlined"
      class="work-linkouts-target"
    />

    <div
      v-else
      class="work-linkouts-target-fallback text-caption text-medium-emphasis"
    >
      {{ targetLabel || 'Open Zotero to load targets' }}
    </div>

    <v-btn
      rounded
      variant="flat"
      color="primary"
      :loading="importing"
      :disabled="!canImport"
      @click="importToZotero"
    >
      Import to Zotero
    </v-btn>

    <span
      v-if="importHint"
      class="text-caption text-medium-emphasis"
    >
      {{ importHint }}
    </span>
  </div>
</template>


<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';

import { api } from '@/api';
import { renderLiteratureBriefMarkdown } from '@/literatureBrief/markdown';
import { loadZoteroSettings, saveZoteroSettings } from '@/zotero/config';

defineOptions({ name: 'WorkLinkouts' });

const props = defineProps({
  data: Object,
  literatureBriefState: {
    type: Object,
    default: () => ({
      enabled: false,
      configured: false,
      eligible: false,
      loading: false,
      ready: false,
      content: '',
      error: '',
    }),
  },
});

const store = useStore();
const downloadPdfEnabled = computed(() => loadZoteroSettings().downloadPdf !== false);

const pdfUrl = computed(() => props.data.best_oa_location?.pdf_url);
const isOaAtPublisher = computed(() =>
  props.data.open_access?.is_oa && props.data.open_access?.oa_status !== 'green'
);

const importing = ref(false);
const statusLoading = ref(false);
const zoteroStatus = ref(null);
const zoteroError = ref('');
const targetId = ref(loadZoteroSettings().targetId);

const availableTargets = computed(() => {
  const targets = Array.isArray(zoteroStatus.value?.library?.targets) ? zoteroStatus.value.library.targets : [];
  const filteredTargets = downloadPdfEnabled.value
    ? targets.filter((target) => target.filesEditable)
    : targets;

  return filteredTargets.map((target) => ({
    id: target.id,
    label: `${'— '.repeat(target.level || 0)}${target.name}`,
  }));
});

const currentTargetId = computed(() => zoteroStatus.value?.library?.currentTargetId || null);
const targetLabel = computed(() => {
  const match = availableTargets.value.find((item) => item.id === targetId.value)
    || availableTargets.value.find((item) => item.id === currentTargetId.value);
  return match?.label?.trim() || '';
});

const requiresLiteratureBrief = computed(() => {
  return !!(
    props.literatureBriefState?.enabled &&
    props.literatureBriefState?.configured &&
    props.literatureBriefState?.eligible
  );
});

const hasValidTarget = computed(() => !downloadPdfEnabled.value || availableTargets.value.length > 0);

const canImport = computed(() => {
  const zoteroReady = !!zoteroStatus.value?.client?.running;
  const briefReady = !requiresLiteratureBrief.value || props.literatureBriefState?.ready;
  return zoteroReady && briefReady && hasValidTarget.value && !importing.value;
});

const importHint = computed(() => {
  if (statusLoading.value) return 'Checking Zotero target...';
  if (!zoteroStatus.value?.client?.running) {
    return zoteroError.value || 'Zotero Desktop is not connected.';
  }
  if (!hasValidTarget.value) {
    return 'No Zotero target with file editing is available for PDF import.';
  }
  if (requiresLiteratureBrief.value && props.literatureBriefState?.loading) {
    return 'Waiting for literature brief to finish before importing.';
  }
  if (requiresLiteratureBrief.value && !props.literatureBriefState?.ready) {
    return props.literatureBriefState?.error || 'Generate the literature brief first to include it as a Zotero note.';
  }
  return '';
});

function persistTarget(nextTargetId) {
  saveZoteroSettings({
    ...loadZoteroSettings(),
    targetId: nextTargetId || null,
  });
}

function buildLiteratureBriefNote() {
  const content = props.literatureBriefState?.content || '';
  if (!content.trim()) return '';

  const rendered = renderLiteratureBriefMarkdown(content);
  return `<p><strong>AI literature brief</strong></p>${rendered}`;
}

async function refreshZoteroStatus(preferLiveTarget = false) {
  if (statusLoading.value) {
    return zoteroStatus.value;
  }

  statusLoading.value = true;
  zoteroError.value = '';

  try {
    const settings = loadZoteroSettings();
    zoteroStatus.value = await api.getZoteroStatus(settings);

    const targetExists = availableTargets.value.some((target) => target.id === settings.targetId);
    const liveTargetId = zoteroStatus.value?.library?.currentTargetId || null;
    const nextTargetId = preferLiveTarget
      ? liveTargetId || availableTargets.value[0]?.id || null
      : targetExists
        ? settings.targetId
        : liveTargetId || availableTargets.value[0]?.id || null;
    if (nextTargetId !== targetId.value) {
      targetId.value = nextTargetId;
    }
    if (nextTargetId !== settings.targetId) {
      persistTarget(nextTargetId);
    }
  } catch (error) {
    zoteroStatus.value = null;
    zoteroError.value = error.response?.data?.error || error.message;
  } finally {
    statusLoading.value = false;
  }
}

async function importToZotero() {
  if (!canImport.value) return;

  importing.value = true;

  try {
    const settings = {
      ...loadZoteroSettings(),
      targetId: targetId.value,
    };
    const extraNotesById = {};
    const literatureBriefNote = requiresLiteratureBrief.value ? buildLiteratureBriefNote() : '';

    if (literatureBriefNote) {
      extraNotesById[props.data.id] = [literatureBriefNote];
    }

    const result = await api.importWorksToZotero(
      [props.data.id],
      settings,
      { extraNotesById },
    );

    store.commit('snackbar', {
      msg: result.summary.failed > 0
        ? `Imported to Zotero with ${result.summary.failed} issue(s).`
        : 'Imported to Zotero.',
      color: result.summary.failed > 0 ? 'warning' : 'success',
    });

    await refreshZoteroStatus();
  } catch (error) {
    store.commit('snackbar', {
      msg: error.response?.data?.error || error.message,
      color: 'error',
    });
  } finally {
    importing.value = false;
  }
}

watch(targetId, (nextTargetId) => {
  persistTarget(nextTargetId);
});

watch(
  () => props.data?.id,
  () => {
    refreshZoteroStatus();
  },
  { immediate: true },
);
</script>

<style scoped>
.work-linkouts-target {
  width: min(120px, 42vw);
}

.work-linkouts-target-fallback {
  padding: 0 10px;
}

@media (max-width: 960px) {
  .work-linkouts-target {
    width: 100%;
  }
}
</style>
