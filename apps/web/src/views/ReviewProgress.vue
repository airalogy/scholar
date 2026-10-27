<template>
  <main class="review-progress-page"><router-link to="/reviews">{{ $t('governance.myReviews') }}</router-link><ReviewProgressPanel :case-id="caseId" /></main>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ReviewProgressPanel from '@/components/ReviewProgressPanel.vue'
const route = useRoute()
const caseId = computed(() => String(route.params.caseId))
</script>
<style scoped>
.review-progress-page { max-width: 1280px; min-width: 0; margin: auto; padding: 24px; }
@media (max-width: 600px) { .review-progress-page { padding: 16px; } }
</style>
