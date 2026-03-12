<template>
  <v-container fluid class="pt-0">
    <!-- Desktop two-column layout -->
    <template v-if="mdAndUp">
      <serp-right-toolbar :results-object="resultsObject" style="margin-top: 14px; margin-bottom: 6px;" />
      <v-row>
        <v-col cols="6">
          <search-box style="width: 100%;" class="mb-4" />

          <!-- Filters: no filters available, or normal -->
          <div v-if="!hasFiltersAvailable" class="d-flex align-center mb-4" style="min-height: 40px; margin-left: 20px;">
            <span class="text-body-2" style="color: rgba(0,0,0,0.38);">No filters available</span>
          </div>
          <template v-else>
            <template v-if="filterMode === 'basic'">
              <div class="d-flex align-center ga-1 mb-4">
                <div class="flex-grow-1">
                  <novice-filter-chips />
                </div>
                <filter-style-menu :filter-mode="filterMode" @set-mode="setFilterMode" />
              </div>
            </template>
            <filter-list v-else class="mt-0 mb-4">
              <template #toolbar-append>
                <filter-style-menu :filter-mode="filterMode" @set-mode="setFilterMode" />
              </template>
            </filter-list>
          </template>

          <serp-api-editor v-if="url.isViewSet($route, 'api')" class="mb-6" />

          <!-- Results card -->
          <v-card variant="outlined" class="bg-white" style="margin-top: 84px;">
            <!-- Results header -->
            <div class="d-flex align-center mb-1 pa-4 pb-0">
              <div class="text-body-2 text-medium-emphasis flex-grow-1">
                <template v-if="!resultsObject?.meta">
                </template>
                <template v-else-if="isSemanticSearch">
                  50 most semantically similar works
                </template>
                <template v-else-if="resultsObject.meta.count === 0">
                  There are no results for this search.
                </template>
                <template v-else>
                  {{ isCountRounded ? 'About ' : '' }}{{ filters.toPrecision(resultsObject.meta.count) }} {{ entityDisplayName }}
                </template>
              </div>
              <novice-sort-button />
            </div>

            <v-divider />

            <!-- Results list -->
            <div v-if="resultsObject?.results" class="results-container px-4">
              <serp-results-list-item
                v-for="result in resultsObject.results"
                :key="result.id"
                :result="result"
                :selectable="isWorks"
                :selected="!!selectedWorksById[result.id]"
                @toggle-select="toggleWorkSelection"
              />
            </div>

            <!-- No results -->
            <div
              v-if="resultsObject?.meta?.count === 0"
              class="text-medium-emphasis text-center py-8"
            >
              Try adjusting your search or filters.
            </div>

            <!-- Pagination -->
            <v-pagination
              v-if="showPagination"
              class="pb-8 pt-4"
              rounded
              active-color="primary"
              v-model="page"
              :length="numPages"
              :total-visible="7"
            />
          </v-card>
        </v-col>
        <v-col cols="6">
          <template v-if="isSemanticSearch">
            <group-by-views
              v-if="showDesktopRightPanel"
              :results-object="resultsObject"
              hide-toolbar
              hide-results-count
              :show-zotero-card="isWorks"
              :zotero-selected-works="selectedWorks"
              :zotero-visible-works="visibleWorks"
              @select-all-visible="selectAllVisibleWorks"
              @clear-selection="clearSelectedWorks"
              @remove-imported="removeImportedWorks"
            />
            <div class="d-flex align-center justify-center text-body-2" style="color: rgba(0,0,0,0.3); margin-top: calc(50vh - 200px);">
              <v-icon size="18" class="mr-2">mdi-information-outline</v-icon>
              Semantic search doesn't support faceting.
            </div>
          </template>
          <template v-else>
            <group-by-views
              v-if="showDesktopRightPanel"
              :results-object="resultsObject"
              hide-toolbar
              hide-results-count
              :show-zotero-card="isWorks"
              :zotero-selected-works="selectedWorks"
              :zotero-visible-works="visibleWorks"
              @select-all-visible="selectAllVisibleWorks"
              @clear-selection="clearSelectedWorks"
              @remove-imported="removeImportedWorks"
            />
          </template>
        </v-col>
      </v-row>
    </template>

    <!-- Fallback: stacked layout (mobile) -->
    <template v-else>
      <serp-right-toolbar :results-object="resultsObject" style="margin-top: 14px; margin-bottom: 6px;" />
      <div class="d-flex justify-center mb-4 mt-2">
        <search-box style="max-width: 800px; width: 100%;" />
      </div>

      <!-- Mobile: filter chips/list + toggle -->
      <div class="mx-auto" style="max-width: 800px; width: 100%;">
        <!-- Filters: no filters available, or normal -->
        <div v-if="!hasFiltersAvailable" class="d-flex align-center mb-4" style="min-height: 40px; margin-left: 20px;">
          <span class="text-body-2" style="color: rgba(0,0,0,0.38);">No filters available</span>
        </div>
        <template v-else>
          <template v-if="filterMode === 'basic'">
            <div class="d-flex align-center ga-1 mb-4">
              <div class="flex-grow-1">
                <novice-filter-chips />
              </div>
              <filter-style-menu :filter-mode="filterMode" @set-mode="setFilterMode" />
            </div>
          </template>
          <filter-list v-else class="mt-0 mb-4">
            <template #toolbar-append>
              <filter-style-menu :filter-mode="filterMode" @set-mode="setFilterMode" />
            </template>
          </filter-list>
        </template>
      </div>

      <serp-api-editor v-if="url.isViewSet($route, 'api')" class="mb-6"/>

      <!-- Mobile: stacked results -->
      <div class="mx-auto" style="max-width: 800px; width: 100%;">
        <zotero-import-card
          v-if="isWorks"
          class="mb-4"
          :selected-works="selectedWorks"
          :visible-works="visibleWorks"
          @select-all-visible="selectAllVisibleWorks"
          @clear-selection="clearSelectedWorks"
          @remove-imported="removeImportedWorks"
        />
        <v-card
          variant="outlined"
          class="bg-white"
          :style="{ marginTop: isWorks ? '16px' : '84px' }"
        >
          <!-- Results header -->
          <div class="d-flex align-center mb-1 pa-4 pb-0">
            <div class="text-body-2 text-medium-emphasis flex-grow-1">
              <template v-if="!resultsObject?.meta">
              </template>
              <template v-else-if="isSemanticSearch">
                50 most semantically similar works
              </template>
              <template v-else-if="resultsObject.meta.count === 0">
                There are no results for this search.
              </template>
              <template v-else>
                {{ isCountRounded ? 'About ' : '' }}{{ filters.toPrecision(resultsObject.meta.count) }} {{ entityDisplayName }}
              </template>
            </div>
            <novice-sort-button />
          </div>
          <v-divider />

          <div v-if="resultsObject?.results" class="px-4">
            <serp-results-list-item
              v-for="result in resultsObject.results"
              :key="result.id"
              :result="result"
              :selectable="isWorks"
              :selected="!!selectedWorksById[result.id]"
              @toggle-select="toggleWorkSelection"
            />
          </div>
          <div
            v-if="resultsObject?.meta?.count === 0"
            class="text-medium-emphasis text-center py-8"
          >
            Try adjusting your search or filters.
          </div>
          <v-pagination
            v-if="showPagination"
            class="pb-8 pt-4"
            rounded
            active-color="primary"
            v-model="page"
            :length="numPages"
            :total-visible="7"
          />
        </v-card>
      </div>
    </template>

    <!-- Snackbar for filter mode switching -->
    <v-snackbar v-model="filterModeSnackbar" :timeout="4000" location="bottom">
      Some advanced filters were removed when switching to basic mode
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useStore } from 'vuex';

import { url } from '@/url';
import filters from '@/filters';
import { filtersFromUrlStr, filtersAsUrlStr } from '@/filterConfigs';
import { getFacetConfig } from '@/facetConfigUtils';
import { entityConfigs } from '@/entityConfigs';
import * as openalexId from '@/openalexId';
import { toPrecision } from '@/util';
import { facetConfigs } from '@/facetConfigs';

import SerpResultsListItem from '@/components/SerpResultsListItem.vue';
import GroupByViews from '@/components/GroupByViews.vue';
import FilterList from '@/components/Filter/FilterList.vue';
import NoviceFilterChips from '@/components/NoviceFilterChips.vue';
import NoviceSortButton from '@/components/NoviceSortButton.vue';
import SerpRightToolbar from '@/components/SerpRightToolbar.vue';
import SerpApiEditor from '@/components/SerpApiEditor.vue';
import SearchBox from '@/components/SearchBox.vue';
import FilterStyleMenu from '@/components/FilterStyleMenu.vue';

defineOptions({ name: 'ExpertSerp' });

const props = defineProps({
  resultsObject: Object,
});

const store = useStore();
const route = useRoute();
const router = useRouter();
const { mdAndUp } = useDisplay();

const isSemanticSearch = computed(() => !!route.query['search.semantic']);
const entityType = computed(() => store.getters.entityType);
const isWorks = computed(() => entityType.value === 'works');
const showDesktopRightPanel = computed(() => {
  return isWorks.value || (!isSemanticSearch.value && url.isViewSet(route, 'report'));
});
const entityDisplayName = computed(() => entityConfigs[entityType.value]?.displayName || entityType.value);
const resultsCount = computed(() => props.resultsObject?.meta?.count);
const isCountRounded = computed(() => {
  const count = resultsCount.value;
  if (!count) return false;
  return Number(toPrecision(count).replace(/,/g, '')) !== count;
});
const hasFiltersAvailable = computed(() => {
  return facetConfigs(entityType.value).some(c => c.actions?.includes('filter'));
});
const filterModeSnackbar = ref(false);
const selectedWorksById = ref({});

const visibleWorks = computed(() => {
  const results = Array.isArray(props.resultsObject?.results) ? props.resultsObject.results : [];
  return results
    .filter((result) => openalexId.getEntityType(result.id) === 'works')
    .map((result) => ({
      id: result.id,
      title: result.display_name || 'Untitled',
      isOa: !!(
        result.open_access?.is_oa ||
        result.best_oa_location?.pdf_url ||
        result.primary_location?.pdf_url
      ),
    }));
});

const selectedWorks = computed(() => Object.values(selectedWorksById.value));

const selectionScopeKey = computed(() => {
  const query = { ...route.query };
  delete query.page;

  const sortedQuery = Object.keys(query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = query[key];
      return acc;
    }, {});

  return JSON.stringify({
    entityType: entityType.value,
    query: sortedQuery,
  });
});

// Filter mode: basic (chips) or advanced (FilterList)
const filterMode = ref(localStorage.getItem('serp-filter-mode') || 'basic');

function facetTypeToChipType(facetConfig) {
  if (facetConfig.type === 'selectEntity') return 'entity';
  if (facetConfig.type === 'boolean') return 'boolean';
  if (facetConfig.type === 'range' && facetConfig.key === 'publication_year') return 'year';
  if (facetConfig.type === 'range') return 'range';
  return null;
}

function setFilterMode(newMode) {
  if (newMode === filterMode.value) return;
  if (newMode === 'basic') {
    // Strip filters that can't be represented as chips
    const currentFilters = filtersFromUrlStr(entityType.value, route.query.filter);
    const compatible = currentFilters.filter(f => {
      const fc = getFacetConfig(entityType.value, f.key);
      return fc && facetTypeToChipType(fc) !== null;
    });
    if (compatible.length < currentFilters.length) {
      const newFilterStr = filtersAsUrlStr(compatible) || undefined;
      const newQuery = { ...route.query, filter: newFilterStr };
      if (!newFilterStr) delete newQuery.filter;
      url.pushToRoute(router, {
        name: route.name,
        params: route.params,
        query: newQuery,
      });
      filterModeSnackbar.value = true;
    }
  }
  filterMode.value = newMode;
  localStorage.setItem('serp-filter-mode', newMode);
}

function toggleWorkSelection({ result, selected }) {
  if (!result?.id || openalexId.getEntityType(result.id) !== 'works') return;

  if (selected) {
    selectedWorksById.value = {
      ...selectedWorksById.value,
      [result.id]: {
        id: result.id,
        title: result.display_name || 'Untitled',
        isOa: !!(
          result.open_access?.is_oa ||
          result.best_oa_location?.pdf_url ||
          result.primary_location?.pdf_url
        ),
      },
    };
  } else {
    const next = { ...selectedWorksById.value };
    delete next[result.id];
    selectedWorksById.value = next;
  }
}

function selectAllVisibleWorks() {
  const next = { ...selectedWorksById.value };
  for (const work of visibleWorks.value) {
    next[work.id] = work;
  }
  selectedWorksById.value = next;
}

function clearSelectedWorks() {
  selectedWorksById.value = {};
}

function removeImportedWorks(openalexIds = []) {
  const next = { ...selectedWorksById.value };
  for (const id of openalexIds) {
    delete next[id];
  }
  selectedWorksById.value = next;
}

watch(selectionScopeKey, (nextKey, previousKey) => {
  if (previousKey && nextKey !== previousKey) {
    clearSelectedWorks();
  }
});

// Pagination
const numPages = computed(() => {
  const count = props.resultsObject?.meta?.count || 0;
  const perPage = url.getPerPage();
  return Math.min(Math.ceil(count / perPage), 10);
});

const showPagination = computed(() => {
  return (props.resultsObject?.meta?.count || 0) > url.getPerPage();
});

const page = computed({
  get() {
    return props.resultsObject?.meta?.page ?? 1;
  },
  set(val) {
    url.setPage(val === 1 ? undefined : val);
  },
});
</script>
