<template>
  <div class="library-page">
    <div class="library-container">
      <div class="library-header">
        <h1 class="library-title">{{ $t('myLibrary.title') }}</h1>
        <span class="library-count">{{ $t('common.counts.favorites', { count: total }) }}</span>
      </div>

      <div v-if="isLoading" class="library-empty">{{ $t('common.loading') }}</div>

      <div v-else-if="!papers.length" class="library-empty">
        <IconBookmark class="library-empty-icon" />
        <p>{{ $t('myLibrary.empty') }}</p>
        <router-link to="/papers" class="library-go-btn">{{ $t('common.goBrowsePapers') }}</router-link>
      </div>

      <div v-else class="library-list">
        <div v-for="item in papers" :key="item.id" class="library-item">
          <router-link :to="`/papers/${item.paperId}`" class="library-item-link">
            <div class="library-item-title">{{ item.title }}</div>
            <div class="library-item-meta">
              <span v-if="item.journal">{{ item.journal }}</span>
              <span v-if="item.journal && item.year"> · </span>
              <span v-if="item.year">{{ item.year }}</span>
            </div>
            <div v-if="item.abstract" class="library-item-abstract">{{ item.abstract }}</div>
            <div v-if="item.keywords.length" class="library-item-keywords">
              <span v-for="kw in item.keywords.slice(0, 4)" :key="kw" class="library-kw-tag">{{ kw }}</span>
            </div>
          </router-link>
          <button class="library-remove-btn" type="button" @click="removeItem(item.paperId)">
            <IconBookmark />
          </button>
        </div>
      </div>

      <div v-if="papers.length < total" class="library-load-more">
        <button class="load-more-btn" type="button" :disabled="isLoadingMore" @click="loadMore">
          {{ isLoadingMore ? $t('common.loading') : $t('common.loadMore') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { IconBookmark } from '@arco-design/web-vue/es/icon'
import { listBookmarks, removeBookmark } from '@/api/bookmarks'
import { getPaper } from '@/api/papers'

interface LibraryPaper {
  id: string
  paperId: string
  title: string
  abstract: string | null
  journal: string | null
  year: number | null
  keywords: string[]
}

const isLoading = ref(false)
const isLoadingMore = ref(false)
const papers = ref<LibraryPaper[]>([])
const total = ref(0)
const PAGE_SIZE = 20

async function fetchPage(offset: number) {
  const res = await listBookmarks(PAGE_SIZE, offset)
  total.value = res.total
  const fetched = await Promise.all(
    res.items.map(async (b) => {
      try {
        const p = await getPaper(b.paperId)
        return {
          id: b.id,
          paperId: b.paperId,
          title: p.title,
          abstract: p.abstract,
          journal: p.journal_name,
          year: p.publish_year,
          keywords: p.keywords,
        }
      } catch {
        return null
      }
    }),
  )
  return fetched.filter(Boolean) as LibraryPaper[]
}

onMounted(async () => {
  isLoading.value = true
  try {
    papers.value = await fetchPage(0)
  } finally {
    isLoading.value = false
  }
})

async function loadMore() {
  isLoadingMore.value = true
  try {
    const more = await fetchPage(papers.value.length)
    papers.value.push(...more)
  } finally {
    isLoadingMore.value = false
  }
}

async function removeItem(paperId: string) {
  await removeBookmark(paperId)
  papers.value = papers.value.filter((p) => p.paperId !== paperId)
  total.value -= 1
}
</script>

<style lang="sass" scoped>
.library-page
  display: flex
  justify-content: center
  padding: 32px 0 60px

.library-container
  width: 860px
  max-width: 100%
  padding: 0 30px

.library-header
  display: flex
  align-items: baseline
  gap: 12px
  margin-bottom: 24px

.library-title
  font-size: 26px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0
  letter-spacing: -0.5px

.library-count
  font-size: 14px
  color: var(--scholar-text-3)

.library-empty
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  min-height: 300px
  font-size: 14px
  color: var(--scholar-text-3)
  gap: 8px

.library-empty-icon
  margin-bottom: 12px
  opacity: 0.3
  font-size: 48px

.library-go-btn
  margin-top: 8px
  height: 36px
  padding: 0 20px
  border-radius: 10px
  background: var(--scholar-primary)
  color: #fff
  font-size: 14px
  font-weight: 500
  text-decoration: none
  display: inline-flex
  align-items: center
  cursor: pointer

.library-go-btn:hover
  background: var(--scholar-primary-hover)

.library-list
  display: flex
  flex-direction: column
  gap: 14px

.library-item
  position: relative
  background: #fff
  border: 1px solid var(--scholar-border-light)
  border-radius: 16px
  padding: 22px 56px 22px 24px
  transition: border-color 0.2s

.library-item:hover
  border-color: rgba(0, 73, 143, 0.2)

.library-item-link
  display: block
  text-decoration: none
  color: inherit

.library-item-title
  font-size: 17px
  font-weight: 600
  color: var(--scholar-text-1)
  line-height: 1.5
  margin-bottom: 6px

.library-item-meta
  font-size: 13px
  color: var(--scholar-text-3)
  margin-bottom: 10px

.library-item-abstract
  font-size: 13px
  color: var(--scholar-text-2)
  line-height: 1.7
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical
  overflow: hidden
  margin-bottom: 12px

.library-item-keywords
  display: flex
  flex-wrap: wrap
  gap: 6px

.library-kw-tag
  height: 24px
  line-height: 24px
  padding: 0 10px
  border: 1px solid var(--scholar-border-light)
  border-radius: 999px
  font-size: 12px
  color: var(--scholar-text-3)

.library-remove-btn
  position: absolute
  right: 18px
  top: 22px
  width: 30px
  height: 30px
  border: none
  background: transparent
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  border-radius: 999px

  :deep(.arco-icon)
    font-size: 16px
    color: #f18b1c

.library-remove-btn:hover
  background: #fff7ed

.library-load-more
  display: flex
  justify-content: center
  margin-top: 24px

.load-more-btn
  height: 36px
  padding: 0 28px
  border-radius: 10px
  border: 1px solid var(--scholar-border-light)
  background: #fff
  font-size: 14px
  color: var(--scholar-text-2)
  cursor: pointer

.load-more-btn:hover
  border-color: var(--scholar-primary)
  color: var(--scholar-primary)

.load-more-btn:disabled
  opacity: 0.5
  cursor: not-allowed
</style>
