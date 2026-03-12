<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-6">Journal ranking</h1>

    <SettingsSection title="Plugin">
      <SettingsRow
        label="Enable AbleSci journal ranking"
        description="Looks up journal impact factor, CAS partition, and JCR quartile by ISSN on the backend. The result is shown in work headers and included in Zotero imports."
      >
        <v-switch
          v-model="editableSettings.enabled"
          color="primary"
          hide-details
          inset
        />
      </SettingsRow>

      <SettingsRow
        label="How it works"
        description="Requests are sent from the backend with a browser-like user agent and a built-in rate limit to avoid frontend CORS issues and reduce the chance of anti-bot blocking."
      >
        <span class="text-body-2 text-medium-emphasis">Backend only</span>
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
import { ref } from 'vue';
import { useStore } from 'vuex';
import { useHead } from '@unhead/vue';

import SettingsSection from '@/components/Settings/SettingsSection.vue';
import SettingsRow from '@/components/Settings/SettingsRow.vue';
import {
  defaultJournalRankingSettings,
  loadJournalRankingSettings,
  saveJournalRankingSettings,
} from '@/journalRanking/config';

defineOptions({ name: 'SettingsJournalRanking' });

useHead({ title: 'Journal ranking' });

const store = useStore();
const editableSettings = ref(loadJournalRankingSettings());

function saveSettings() {
  editableSettings.value = saveJournalRankingSettings(editableSettings.value);
  store.commit('snackbar', {
    msg: 'Journal ranking settings saved',
    color: 'success',
  });
}

function resetSettings() {
  editableSettings.value = saveJournalRankingSettings(defaultJournalRankingSettings);
  store.commit('snackbar', {
    msg: 'Journal ranking settings reset to defaults',
    color: 'success',
  });
}
</script>
