<template>
  <div class="paper-card" :class="className">
    <div v-if="keywords.length" class="paper-keywords">
      <span v-for="keyword in keywords" :key="keyword" class="paper-keyword">{{ keyword }}</span>
    </div>
    <h3 class="paper-title">{{ paper.title }}</h3>
    <div class="paper-meta">
      <div class="authors-list">
        <span
          v-for="(author, aIdx) in paper.authors"
          :key="aIdx"
          class="author-tag"
          :class="`author-${author.type}`"
        >
          <template v-if="author.type !== 'normal'">
            <span class="author-avatar">
              <img
                v-if="author.type === 'pi'"
                src="@/assets/author-tags/pi-icon.svg?url"
                alt=""
                class="avatar-icon"
              />
              <img
                v-else
                src="@/assets/author-tags/user-icon.svg?url"
                alt=""
                class="avatar-icon"
              />
            </span>
          </template>
          <span class="author-name">{{ author.name }}</span>
        </span>
      </div>

      <template v-if="paper.journal">
        <span v-if="paper.authors.length" class="meta-sep" />
        <span class="meta-text">{{ paper.journal }}</span>
      </template>
      <template v-if="hasPaperPublishYear">
        <span v-if="paper.authors.length || paper.journal" class="meta-sep" />
        <span class="meta-text">{{ paper.publishYear }}</span>
      </template>
    </div>

    <p class="paper-summary">{{ paper.summary }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { hasPublishYear } from '@/utils/papers'

const props = withDefaults(defineProps<{ paper: PaperInfo, className?: string, keywords?: string[] }>(), {
  keywords: () => []
})

const keywords = props.keywords
const hasPaperPublishYear = computed(() => hasPublishYear(props.paper.publishYear))

interface Author {
  name: string
  type: 'pi' | 'online' | 'normal'
}

export interface PaperInfo {
  title: string
  authors: Author[]
  publishYear: number | null
  journal: string
  summary: string
}
</script>

<style lang="sass" scoped>
.paper-card
  background: white
  border: 1.2px solid #F3F4F6
  border-radius: 14px
  padding: 24px
  margin-top: 4px
.paper-card:hover
  border-color: #00498F

.paper-keywords
  display: flex
  gap: 8px
  flex-wrap: wrap
  margin-bottom: 12px

.paper-keyword
  height: 20px
  line-height: 20px
  padding: 0 8px
  border-radius: 4px
  background: #f3f4f6
  color: #45556c
  font-size: 12px

.paper-title
  font-size: 18px
  font-weight: 600
  color: #00498f
  margin: 0 0 12px
  line-height: 1.4
  cursor: pointer
  text-decoration: none
  transition: all 0.2s ease

.paper-title:hover
  text-decoration: none

.paper-meta
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px
  margin-bottom: 10px

.meta-sep
  width: 4px
  height: 4px
  border-radius: 999px
  background: #cad5e2
  flex-shrink: 0

.meta-text
  font-size: 14px
  color: #62748e
  letter-spacing: -0.15px

.paper-summary
  margin: 0
  font-size: 14px
  color: #45556c
  line-height: 20px
  letter-spacing: -0.15px
  white-space: pre-wrap

.authors-list
  display: flex
  flex-wrap: wrap
  gap: 8px

.author-tag
  display: inline-flex
  align-items: center
  height: 26px
  font-size: 13px
  cursor: pointer
  border-radius: 13px
  transition: all 0.2s ease

.author-tag.author-pi
  background: #f2f6f9
  padding: 0 10px 0 3px
  gap: 5px

.author-tag.author-online
  background: #fef9f4
  padding: 0 10px 0 3px
  gap: 5px

.author-tag.author-normal
  background: #f5f7fb
  color: #999
  padding: 3px 10px

.author-avatar
  display: inline-flex
  align-items: center
  justify-content: center
  width: 20px
  height: 20px
  border-radius: 50%
  flex-shrink: 0

.author-tag.author-pi .author-avatar
  background: #d6e8f7

.author-tag.author-online .author-avatar
  background: #fde8cf

.author-name
  color: #4a5565
  line-height: 1

.author-tag.author-normal .author-name
  color: #999

.avatar-icon
  width: 12px
  height: 12px
</style>
