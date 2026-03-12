<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-6">Zotero</h1>

    <SettingsSection title="Connection">
      <SettingsRow
        label="Connector endpoint"
        description="Local Zotero connector endpoint used by the backend to push items into Zotero Desktop."
        full-width
      >
        <input
          v-model="editableSettings.endpoint"
          type="text"
          class="settings-text-input settings-text-input--full"
          placeholder="http://localhost:23119/api"
        />
      </SettingsRow>

      <SettingsRow
        label="Connection status"
        description="Checks whether Zotero Desktop is reachable from this machine."
      >
        <div class="d-flex align-center ga-3">
          <span class="settings-status" :class="statusClass">
            {{ statusLabel }}
          </span>
          <v-btn
            variant="text"
            class="settings-action"
            :loading="statusLoading"
            @click="checkConnection"
          >
            Test connection
          </v-btn>
        </div>
      </SettingsRow>

      <SettingsRow
        v-if="libraryDescription"
        label="Current target"
        description="Items will be imported into the library or collection currently selected in Zotero."
      >
        <span class="text-body-2">{{ libraryDescription }}</span>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Import behavior">
      <SettingsRow
        label="Download open access PDFs"
        description="When a selected work exposes an OA PDF URL, download it on the backend and attach it to the imported Zotero item."
      >
        <v-switch
          v-model="editableSettings.downloadPdf"
          color="primary"
          hide-details
          inset
        />
      </SettingsRow>

      <SettingsRow
        label="Attach OpenAlex metadata note"
        description="Adds a child note to each Zotero item with the original OpenAlex metadata snapshot."
      >
        <v-switch
          v-model="editableSettings.includeMetadataNote"
          color="primary"
          hide-details
          inset
        />
      </SettingsRow>

      <SettingsRow
        label="OpenAlex contact email"
        description="Sent with backend OpenAlex requests as the mailto parameter."
        full-width
      >
        <input
          v-model="editableSettings.mailto"
          type="email"
          class="settings-text-input settings-text-input--full"
          placeholder="ui@openalex.org"
        />
      </SettingsRow>
    </SettingsSection>

    <div class="d-flex align-center ga-3 mt-6">
      <v-btn color="primary" @click="saveSettings">
        Save settings
      </v-btn>
      <v-btn variant="text" class="settings-action" @click="resetSettings">
        Reset defaults
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { useHead } from '@unhead/vue';

import { api } from '@/api';
import SettingsSection from '@/components/Settings/SettingsSection.vue';
import SettingsRow from '@/components/Settings/SettingsRow.vue';
import {
  defaultZoteroSettings,
  loadZoteroSettings,
  normalizeZoteroSettings,
  saveZoteroSettings,
} from '@/zotero/config';

defineOptions({ name: 'SettingsZotero' });

useHead({ title: 'Zotero' });

const store = useStore();

const editableSettings = ref(loadZoteroSettings());
const statusLoading = ref(false);
const status = ref(null);

const statusClass = computed(() => {
  if (!status.value) return 'settings-status--unknown';
  return status.value?.client?.running ? 'settings-status--success' : 'settings-status--error';
});

const statusLabel = computed(() => {
  if (statusLoading.value) return 'Checking...';
  if (!status.value) return 'Not checked';
  return status.value?.client?.running ? 'Ready' : 'Unavailable';
});

const libraryDescription = computed(() => {
  const library = status.value?.library;
  if (!library || library.error) return '';
  const libraryName = library.libraryName || library.name || '';
  const collectionName = library.collectionName || '';
  if (libraryName && collectionName) {
    return `${libraryName} / ${collectionName}`;
  }
  return libraryName || collectionName || '';
});

async function checkConnection() {
  statusLoading.value = true;
  try {
    status.value = await api.getZoteroStatus(normalizeZoteroSettings(editableSettings.value));
  } catch (error) {
    status.value = {
      client: {
        running: false,
      },
      error: error.response?.data?.error || error.message,
    };
    store.commit('snackbar', {
      msg: status.value.error,
      color: 'error',
    });
  } finally {
    statusLoading.value = false;
  }
}

function saveSettings() {
  editableSettings.value = saveZoteroSettings(editableSettings.value);
  store.commit('snackbar', {
    msg: 'Zotero settings saved',
    color: 'success',
  });
}

function resetSettings() {
  editableSettings.value = saveZoteroSettings(defaultZoteroSettings);
  status.value = null;
  store.commit('snackbar', {
    msg: 'Zotero settings reset to defaults',
    color: 'success',
  });
}
</script>

<style scoped>
.settings-text-input {
  font-size: 14px;
  padding: 0 12px;
  height: 32px;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  background: #FFFFFF;
  color: #1A1A1A;
  min-width: 240px;
  outline: none;
  transition: border-color 0.15s;
}

.settings-text-input:hover {
  border-color: #D0D0D0;
}

.settings-text-input:focus {
  border-color: #1A1A1A;
}

.settings-text-input--full {
  width: 100%;
}

.settings-status {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}

.settings-status--unknown {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.55);
}

.settings-status--success {
  background: rgba(46, 125, 50, 0.1);
  color: #2e7d32;
}

.settings-status--error {
  background: rgba(211, 47, 47, 0.1);
  color: #d32f2f;
}
</style>
