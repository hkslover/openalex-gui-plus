<template>
  <v-card variant="outlined" class="zotero-card bg-white">
    <v-toolbar flat color="transparent" class="zotero-toolbar">
      <v-icon color="grey-darken-2" start>mdi-bookshelf</v-icon>
      <v-toolbar-title class="font-weight-bold">Zotero</v-toolbar-title>
      <v-chip
        size="small"
        :color="statusChipColor"
        :variant="status?.client?.running ? 'tonal' : 'outlined'"
        class="mr-1"
      >
        {{ statusTitle }}
      </v-chip>
      <v-btn
        icon
        variant="text"
        size="small"
        :loading="statusLoading"
        aria-label="Refresh Zotero status"
        @click="refreshStatus"
      >
        <v-icon color="grey-darken-2">mdi-refresh</v-icon>
      </v-btn>
      <v-btn
        icon
        variant="text"
        size="small"
        :to="{ name: 'settings-zotero' }"
        aria-label="Open Zotero settings"
      >
        <v-icon color="grey-darken-2">mdi-cog-outline</v-icon>
      </v-btn>
    </v-toolbar>

    <v-divider />

    <div class="pa-4">
      <!-- <div class="text-body-2 text-medium-emphasis mb-4">
        Pick papers on the left, then import the selected records and open-access PDFs into Zotero.
      </div> -->

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-chip size="small" variant="outlined">
          {{ selectedCount }} selected
        </v-chip>
        <v-chip v-if="oaSelectedCount" size="small" color="primary" variant="outlined">
          {{ oaSelectedCount }} OA PDF{{ oaSelectedCount === 1 ? '' : 's' }}
        </v-chip>
      </div>

      <div v-if="showStatusPanel" class="zotero-panel mb-4" :class="statusPanelClass">
        <div class="d-flex align-center ga-2 mb-2">
          <v-icon size="16" :color="status?.client?.running ? 'success' : 'error'">
            {{ statusIcon }}
          </v-icon>
          <span class="text-body-2 font-weight-medium">{{ statusHeadline }}</span>
        </div>
        <div class="text-body-2 text-medium-emphasis">
          {{ statusDescription }}
        </div>
      </div>

      <div class="mb-4">
        <div class="text-caption text-medium-emphasis mb-2">Current target</div>
        <v-select
          v-if="availableTargets.length"
          v-model="targetId"
          :items="availableTargets"
          item-title="label"
          item-value="id"

          variant="outlined"
          hide-details
          
          class="zotero-target-select"
        />
        <div v-else class="text-body-2 text-medium-emphasis zotero-target-fallback">
          {{ currentTargetLabel || 'Open Zotero to load editable libraries and collections.' }}
        </div>
      </div>

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          variant="outlined"
          size="small"
          :disabled="!visibleWorks.length"
          @click="$emit('select-all-visible')"
        >
          Select all
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          :disabled="!selectedCount"
          @click="$emit('clear-selection')"
        >
          Clear
        </v-btn>
      </div>

      <div v-if="selectedWorks.length" class="selected-preview mb-4">
        <div class="text-caption text-medium-emphasis mb-2">Queued for import</div>
        <div class="selected-preview-list">
          <div
            v-for="work in selectedPreview"
            :key="work.id"
            class="selected-preview-item"
          >
            <span class="selected-preview-title">{{ work.title }}</span>
            <v-icon v-if="work.isOa" size="15" color="primary">mdi-file-pdf-box</v-icon>
          </div>
        </div>
        <div v-if="selectedCount > selectedPreview.length" class="text-caption text-medium-emphasis mt-2">
          +{{ selectedCount - selectedPreview.length }} more selected
        </div>
      </div>

      <v-alert
        v-if="errorMessage"
        type="error"
        variant="tonal"
        density="comfortable"
        class="mb-4"
      >
        {{ errorMessage }}
      </v-alert>

      <v-alert
        v-if="importSummary"
        :type="importSummaryType"
        variant="tonal"
        class="mb-4"
      >
        {{ importSummary }}
      </v-alert>

      <v-btn
        block
        color="success"
        size="small"
        :disabled="!canImport"
        :loading="importing"
        @click="importSelected"
      >
        Import {{ selectedCount || '' }}
      </v-btn>
    </div>
  </v-card>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';

import { api } from '@/api';
import { loadJournalRankingSettings } from '@/journalRanking/config';
import { loadZoteroSettings, saveZoteroSettings } from '@/zotero/config';

defineOptions({ name: 'ZoteroImportCard' });

const props = defineProps({
  selectedWorks: {
    type: Array,
    default: () => [],
  },
  visibleWorks: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  'clear-selection',
  'remove-imported',
  'select-all-visible',
]);

const store = useStore();
const downloadPdfEnabled = computed(() => loadZoteroSettings().downloadPdf !== false);

const statusLoading = ref(false);
const importing = ref(false);
const status = ref(null);
const statusError = ref('');
const errorMessage = ref('');
const importResult = ref(null);
const targetId = ref(loadZoteroSettings().targetId);

const selectedCount = computed(() => props.selectedWorks.length);
const oaSelectedCount = computed(() => props.selectedWorks.filter((work) => work.isOa).length);
const selectedPreview = computed(() => props.selectedWorks.slice(0, 4));
const hasValidTarget = computed(() => !downloadPdfEnabled.value || availableTargets.value.length > 0);
const canImport = computed(() => (
  selectedCount.value > 0 &&
  status.value?.client?.running &&
  hasValidTarget.value &&
  !importing.value
));

const availableTargets = computed(() => {
  const targets = Array.isArray(status.value?.library?.targets) ? status.value.library.targets : [];
  const filteredTargets = downloadPdfEnabled.value
    ? targets.filter((target) => target.filesEditable)
    : targets;

  return filteredTargets.map((target) => ({
    id: target.id,
    label: `${'— '.repeat(target.level || 0)}${target.name}`,
    filesEditable: target.filesEditable,
  }));
});

const currentTargetId = computed(() => status.value?.library?.currentTargetId || null);
const currentTargetLabel = computed(() => {
  const match = availableTargets.value.find((target) => target.id === targetId.value)
    || availableTargets.value.find((target) => target.id === currentTargetId.value);
  return match?.label?.trim() || '';
});

const statusChipColor = computed(() => {
  return status.value?.client?.running ? 'success' : 'grey';
});

const statusPanelClass = computed(() => ({
  'zotero-panel--ready': status.value?.client?.running,
  'zotero-panel--error': status.value && !status.value?.client?.running,
}));

const showStatusPanel = computed(() => {
  return statusLoading.value || !status.value?.client?.running;
});

const statusIcon = computed(() => {
  if (statusLoading.value) return 'mdi-loading';
  return status.value?.client?.running ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline';
});

const statusTitle = computed(() => {
  if (statusLoading.value) return 'Checking';
  if (status.value?.client?.running) return 'Ready';
  return 'Offline';
});

const statusHeadline = computed(() => {
  if (statusLoading.value) return 'Checking local Zotero connector';
  if (status.value?.client?.running) return 'Zotero Desktop is connected';
  return 'Zotero Desktop is not reachable';
});

const statusDescription = computed(() => {
  if (statusLoading.value) {
    return 'Trying to reach the local Zotero connector and fetch editable targets.';
  }
  if (status.value?.client?.running && !hasValidTarget.value) {
    return 'No Zotero library or collection with file editing is currently available for PDF import.';
  }
  return statusError.value || 'Start Zotero Desktop and make sure the local connector server is available.';
});

const importSummary = computed(() => {
  const result = importResult.value;
  if (!result?.summary) return '';

  const { imported, failed, attachedPdf } = result.summary;
  if (failed > 0) {
    return `Imported ${imported} paper${imported === 1 ? '' : 's'}, attached ${attachedPdf} PDF${attachedPdf === 1 ? '' : 's'}, and ${failed} item${failed === 1 ? '' : 's'} still need attention.`;
  }
  return `Imported ${imported} paper${imported === 1 ? '' : 's'} and attached ${attachedPdf} PDF${attachedPdf === 1 ? '' : 's'}.`;
});

const importSummaryType = computed(() => {
  return importResult.value?.summary?.failed > 0 ? 'warning' : 'success';
});

function persistTarget(nextTargetId) {
  const settings = loadZoteroSettings();
  saveZoteroSettings({
    ...settings,
    targetId: nextTargetId || null,
  });
}

async function refreshStatus() {
  statusLoading.value = true;
  statusError.value = '';

  try {
    const settings = loadZoteroSettings();
    status.value = await api.getZoteroStatus(settings);

    const targetExists = availableTargets.value.some((target) => target.id === settings.targetId);
    const nextTargetId = targetExists
      ? settings.targetId
      : status.value?.library?.currentTargetId || availableTargets.value[0]?.id || null;

    targetId.value = nextTargetId;
    persistTarget(nextTargetId);
  } catch (error) {
    status.value = null;
    statusError.value = error.response?.data?.error || error.message;
  } finally {
    statusLoading.value = false;
  }
}

async function importSelected() {
  if (!canImport.value) return;

  importing.value = true;
  errorMessage.value = '';
  importResult.value = null;

  try {
    const result = await api.importWorksToZotero(
      props.selectedWorks.map((work) => work.id),
      {
        ...loadZoteroSettings(),
        journalRanking: loadJournalRankingSettings(),
        targetId: targetId.value,
      },
    );

    importResult.value = result;

    const importedIds = result.results
      .filter((item) => item.status === 'success' || item.status === 'warning')
      .map((item) => item.input);

    if (importedIds.length) {
      emit('remove-imported', importedIds);
    }

    store.commit('snackbar', {
      msg: result.summary.failed > 0
        ? `Imported ${result.summary.imported} item(s) to Zotero with ${result.summary.failed} issue(s).`
        : `Imported ${result.summary.imported} item(s) to Zotero.`,
      color: result.summary.failed > 0 ? 'warning' : 'success',
    });

    await refreshStatus();
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message;
  } finally {
    importing.value = false;
  }
}

watch(targetId, (nextTargetId) => {
  persistTarget(nextTargetId);
});

onMounted(() => {
  refreshStatus();
});
</script>

<style scoped>
.zotero-card {
  position: sticky;
  top: 84px;
}

.zotero-toolbar :deep(.v-toolbar-title__placeholder) {
  font-size: 16px;
}

.zotero-panel {
  border-radius: 12px;
  padding: 14px 16px;
  background: #f8f8f8;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.zotero-panel--ready {
  background: rgba(46, 125, 50, 0.05);
  border-color: rgba(46, 125, 50, 0.16);
}

.zotero-panel--error {
  background: rgba(211, 47, 47, 0.05);
  border-color: rgba(211, 47, 47, 0.14);
}

.zotero-target-select :deep(.v-field) {
  border-radius: 10px;
}

.zotero-target-fallback {
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8f8f8;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.selected-preview {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 16px;
}

.selected-preview-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-preview-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.selected-preview-title {
  font-size: 13px;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.76);
}

@media (max-width: 960px) {
  .zotero-card {
    position: static;
  }
}
</style>
