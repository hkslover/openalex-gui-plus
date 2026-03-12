<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-6">Literature brief</h1>

    <SettingsSection title="Plugin">
      <SettingsRow
        label="Enable AI literature brief"
        description="For open access works, send the abstract to a model on the backend and generate a quick reading guide in the entity detail view."
      >
        <v-switch
          v-model="editableSettings.enabled"
          color="primary"
          hide-details
          inset
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Model connection">
      <SettingsRow
        label="Base URL"
        description="OpenAI-compatible API base URL. Include <code>/v1</code> if your provider expects it."
        full-width
      >
        <input
          v-model="editableSettings.baseUrl"
          type="text"
          class="settings-text-input settings-text-input--full"
          placeholder="https://api.openai.com/v1"
        />
      </SettingsRow>

      <SettingsRow
        label="API key"
        description="Stored locally in this browser and sent only from the backend."
        full-width
      >
        <input
          v-model="editableSettings.apiKey"
          type="password"
          class="settings-text-input settings-text-input--full"
          placeholder="sk-..."
        />
      </SettingsRow>

      <SettingsRow
        label="Model ID"
        description="The exact model name to request from your provider."
        full-width
      >
        <input
          v-model="editableSettings.model"
          type="text"
          class="settings-text-input settings-text-input--full"
          placeholder="gpt-4.1-mini"
        />
      </SettingsRow>

      <SettingsRow
        label="Proxy URL"
        description="Optional outbound proxy used by the backend model request."
        full-width
      >
        <input
          v-model="editableSettings.proxyUrl"
          type="text"
          class="settings-text-input settings-text-input--full"
          placeholder="http://127.0.0.1:7890"
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Prompt">
      <SettingsRow
        label="Literature brief prompt"
        description="Controls how the model summarizes the abstract. Keep the prompt focused on the abstract only."
        full-width
      >
        <textarea
          v-model="editableSettings.prompt"
          class="settings-textarea settings-text-input--full"
          rows="10"
        />
      </SettingsRow>
    </SettingsSection>

    <div class="d-flex align-center ga-3 mt-6 flex-wrap">
      <v-btn color="primary" @click="saveSettings">
        Save settings
      </v-btn>
      <v-btn
        variant="outlined"
        :loading="testLoading"
        @click="runTest"
      >
        Test configuration
      </v-btn>
      <v-btn variant="text" class="settings-action" @click="resetSettings">
        Reset defaults
      </v-btn>
      <span v-if="testStatusLabel" class="settings-status" :class="testStatusClass">
        {{ testStatusLabel }}
      </span>
    </div>

    <div v-if="testMessage" class="text-body-2 text-medium-emphasis mt-3">
      {{ testMessage }}
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
  defaultLiteratureBriefSettings,
  loadLiteratureBriefSettings,
  normalizeLiteratureBriefSettings,
  saveLiteratureBriefSettings,
} from '@/literatureBrief/config';

defineOptions({ name: 'SettingsLiteratureBrief' });

useHead({ title: 'Literature brief' });

const store = useStore();
const editableSettings = ref(loadLiteratureBriefSettings());
const testLoading = ref(false);
const testState = ref(null);
const testMessage = ref('');

const testStatusClass = computed(() => {
  if (testState.value === 'success') return 'settings-status--success';
  if (testState.value === 'error') return 'settings-status--error';
  return 'settings-status--unknown';
});

const testStatusLabel = computed(() => {
  if (testLoading.value) return 'Testing...';
  if (testState.value === 'success') return 'Ready';
  if (testState.value === 'error') return 'Failed';
  return '';
});

function saveSettings() {
  editableSettings.value = saveLiteratureBriefSettings(editableSettings.value);
  store.commit('snackbar', {
    msg: 'Literature brief settings saved',
    color: 'success',
  });
}

function resetSettings() {
  editableSettings.value = saveLiteratureBriefSettings(defaultLiteratureBriefSettings);
  testState.value = null;
  testMessage.value = '';
  store.commit('snackbar', {
    msg: 'Literature brief settings reset to defaults',
    color: 'success',
  });
}

async function runTest() {
  testLoading.value = true;
  testState.value = null;
  testMessage.value = '';

  try {
    const normalized = normalizeLiteratureBriefSettings(editableSettings.value);
    const response = await api.testLiteratureBrief(normalized);
    testState.value = 'success';
    testMessage.value = response?.result?.content
      ? `Model responded successfully: ${response.result.content}`
      : 'Connection test succeeded.';
    store.commit('snackbar', {
      msg: 'Literature brief model connection succeeded',
      color: 'success',
    });
  } catch (error) {
    testState.value = 'error';
    testMessage.value = error.response?.data?.error || error.message;
    store.commit('snackbar', {
      msg: testMessage.value,
      color: 'error',
    });
  } finally {
    testLoading.value = false;
  }
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

.settings-text-input:focus,
.settings-textarea:focus {
  border-color: #1A1A1A;
}

.settings-text-input--full {
  width: 100%;
}

.settings-textarea {
  width: 100%;
  min-height: 220px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  background: #FFFFFF;
  color: #1A1A1A;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
}

.settings-textarea:hover {
  border-color: #D0D0D0;
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
