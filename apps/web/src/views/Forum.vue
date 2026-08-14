<template>
  <div class="forum-page">
    <div class="forum-container">
      <div class="forum-header">
        <button class="back-btn" type="button" @click="$router.back()">← {{ $t('common.back') }}</button>
        <h1 class="forum-title">{{ $t('forum.title') }}</h1>
      </div>

      <div class="new-post-card">
        <h3 class="new-post-title">{{ $t('forum.createTitle') }}</h3>
        <input
          v-model="newPostTitle"
          class="new-post-input"
          type="text"
          :placeholder="$t('forum.postTitlePlaceholder')"
        />
        <textarea
          v-model="newPostContent"
          class="new-post-textarea"
          :placeholder="$t('forum.postContentPlaceholder')"
          rows="4"
        />
        <div class="new-post-footer">
          <button
            class="post-submit-btn"
            type="button"
            :disabled="!newPostTitle.trim() || !newPostContent.trim() || isPosting"
            @click="submitPost"
          >
            {{ isPosting ? $t('forum.posting') : $t('forum.submitPost') }}
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="forum-loading">{{ $t('common.loading') }}</div>

      <div v-else-if="!posts.length" class="forum-empty">{{ $t('forum.empty') }}</div>

      <div v-else class="posts-list">
        <div v-for="post in posts" :key="post.id" class="post-card">
          <div class="post-header">
            <div class="post-meta">
              <span class="post-date">{{ formatDate(post.createdAt) }}</span>
            </div>
          </div>
          <h3 class="post-title">{{ post.title }}</h3>
          <p class="post-content" :class="{ 'post-content--collapsed': !expandedPosts.has(post.id) }">{{ post.content }}</p>
          <button
            v-if="post.content.length > 200"
            class="expand-btn"
            type="button"
            @click="toggleExpand(post.id)"
          >
            {{ expandedPosts.has(post.id) ? $t('forum.collapse') : $t('forum.expand') }}
          </button>

          <div class="post-actions">
            <button
              class="action-btn"
              :class="{ 'action-btn--liked': post.liked }"
              type="button"
              @click="handleLike(post.id)"
            >
              <IconHeart v-if="!post.liked" class="action-icon" />
              <IconHeartFill v-else class="action-icon action-icon--liked" />
              {{ post.like_count }}
            </button>
            <button
              class="action-btn"
              type="button"
              @click="toggleComments(post.id)"
            >
              <IconMessage class="action-icon" />
              {{ $t('forum.comments', { count: post.comment_count }) }}
            </button>
          </div>

          <div v-if="openComments.has(post.id)" class="comments-section">
            <div v-if="commentMap[post.id]" class="comments-list">
              <div v-for="comment in commentMap[post.id]" :key="comment.id" class="comment-item">
                <div class="comment-date">{{ formatDate(comment.createdAt) }}</div>
                <div class="comment-content">{{ comment.content }}</div>
              </div>
            </div>
            <div class="comment-input-row">
              <input
                v-model="commentInputs[post.id]"
                class="comment-input"
                type="text"
                :placeholder="$t('forum.commentPlaceholder')"
                @keydown.enter="submitComment(post.id)"
              />
              <button
                class="comment-submit"
                type="button"
                @click="submitComment(post.id)"
              >{{ $t('common.send') }}</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="posts.length < total" class="load-more">
        <button class="load-more-btn" type="button" :disabled="isLoadingMore" @click="loadMore">
          {{ isLoadingMore ? $t('common.loading') : $t('common.loadMore') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { IconHeart, IconHeartFill, IconMessage } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import {
  listPosts, createPost, toggleLike,
  listComments, createComment,
  type ForumPost, type ForumComment,
} from '@/api/forum'

const route = useRoute()
const paperId = computed(() => {
  const id = route.params.paperId
  return typeof id === 'string' ? id : ''
})

const isLoading = ref(false)
const isLoadingMore = ref(false)
const isPosting = ref(false)
const posts = ref<ForumPost[]>([])
const total = ref(0)
const newPostTitle = ref('')
const newPostContent = ref('')
const expandedPosts = ref(new Set<string>())
const openComments = ref(new Set<string>())
const commentMap = reactive<Record<string, ForumComment[]>>({})
const commentInputs = reactive<Record<string, string>>({})
const PAGE_SIZE = 20
const { locale } = useI18n()

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function toggleExpand(postId: string) {
  if (expandedPosts.value.has(postId)) {
    expandedPosts.value.delete(postId)
  } else {
    expandedPosts.value.add(postId)
  }
}

async function toggleComments(postId: string) {
  if (openComments.value.has(postId)) {
    openComments.value.delete(postId)
    return
  }
  openComments.value.add(postId)
  if (!commentMap[postId]) {
    const res = await listComments(postId, 50, 0)
    commentMap[postId] = res.items
  }
}

async function loadPage(offset: number) {
  const res = await listPosts(paperId.value, PAGE_SIZE, offset)
  total.value = res.total
  return res.items
}

onMounted(async () => {
  isLoading.value = true
  try {
    posts.value = await loadPage(0)
  } finally {
    isLoading.value = false
  }
})

async function loadMore() {
  isLoadingMore.value = true
  try {
    const more = await loadPage(posts.value.length)
    posts.value.push(...more)
  } finally {
    isLoadingMore.value = false
  }
}

async function submitPost() {
  if (!newPostTitle.value.trim() || !newPostContent.value.trim()) return
  isPosting.value = true
  try {
    const post = await createPost(paperId.value, newPostTitle.value.trim(), newPostContent.value.trim())
    posts.value.unshift(post)
    total.value += 1
    newPostTitle.value = ''
    newPostContent.value = ''
  } finally {
    isPosting.value = false
  }
}

async function handleLike(postId: string) {
  const idx = posts.value.findIndex((p) => p.id === postId)
  if (idx < 0) return
  const res = await toggleLike(postId)
  posts.value[idx].liked = res.liked
  posts.value[idx].like_count = res.like_count
}

async function submitComment(postId: string) {
  const content = commentInputs[postId]?.trim()
  if (!content) return
  const comment = await createComment(postId, content)
  if (!commentMap[postId]) commentMap[postId] = []
  commentMap[postId].push(comment)
  commentInputs[postId] = ''
  const idx = posts.value.findIndex((p) => p.id === postId)
  if (idx >= 0) posts.value[idx].comment_count += 1
}
</script>

<style lang="sass" scoped>
.forum-page
  display: flex
  justify-content: center
  padding: 32px 0 60px

.forum-container
  width: 860px
  max-width: 100%
  padding: 0 30px

.forum-header
  display: flex
  align-items: center
  gap: 16px
  margin-bottom: 24px

.back-btn
  height: 36px
  padding: 0 16px
  border-radius: 10px
  border: 1px solid var(--scholar-border-light)
  background: #fff
  font-size: 14px
  color: var(--scholar-text-2)
  cursor: pointer

.back-btn:hover
  border-color: var(--scholar-primary)
  color: var(--scholar-primary)

.forum-title
  font-size: 24px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0

.forum-loading,
.forum-empty
  text-align: center
  padding: 60px 0
  font-size: 14px
  color: var(--scholar-text-3)

.new-post-card
  background: #fff
  border: 1px solid var(--scholar-border-light)
  border-radius: 16px
  padding: 22px 24px
  margin-bottom: 24px

.new-post-title
  font-size: 15px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0 0 14px

.new-post-input
  width: 100%
  height: 38px
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 0 12px
  font-size: 14px
  color: var(--scholar-text-1)
  box-sizing: border-box
  margin-bottom: 10px
  outline: none

.new-post-input:focus
  border-color: var(--scholar-primary)

.new-post-textarea
  width: 100%
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 10px 12px
  font-size: 14px
  color: var(--scholar-text-1)
  box-sizing: border-box
  resize: vertical
  outline: none
  font-family: inherit
  line-height: 1.6

.new-post-textarea:focus
  border-color: var(--scholar-primary)

.new-post-footer
  display: flex
  justify-content: flex-end
  margin-top: 12px

.post-submit-btn
  height: 36px
  padding: 0 22px
  border-radius: 10px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 14px
  cursor: pointer

.post-submit-btn:disabled
  opacity: 0.4
  cursor: not-allowed

.posts-list
  display: flex
  flex-direction: column
  gap: 14px

.post-card
  background: #fff
  border: 1px solid var(--scholar-border-light)
  border-radius: 16px
  padding: 22px 24px

.post-header
  margin-bottom: 8px

.post-meta
  font-size: 12px
  color: var(--scholar-text-3)

.post-title
  font-size: 17px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0 0 10px

.post-content
  font-size: 14px
  color: var(--scholar-text-2)
  line-height: 1.7
  margin: 0 0 8px
  white-space: pre-wrap

.post-content--collapsed
  display: -webkit-box
  -webkit-line-clamp: 4
  -webkit-box-orient: vertical
  overflow: hidden

.expand-btn
  border: none
  background: none
  color: var(--scholar-primary)
  font-size: 13px
  cursor: pointer
  padding: 0
  margin-bottom: 10px

.post-actions
  display: flex
  gap: 16px
  margin-top: 14px
  padding-top: 14px
  border-top: 1px solid var(--scholar-border-light)

.action-btn
  display: flex
  align-items: center
  gap: 6px
  border: none
  background: none
  font-size: 13px
  color: var(--scholar-text-3)
  cursor: pointer
  padding: 4px 8px
  border-radius: 8px

.action-icon
  font-size: 14px

.action-icon--liked
  color: #f43f5e

.action-btn:hover
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)

.action-btn--liked
  color: #f43f5e

.comments-section
  margin-top: 16px
  padding-top: 16px
  border-top: 1px dashed var(--scholar-border-light)

.comments-list
  display: flex
  flex-direction: column
  gap: 12px
  margin-bottom: 14px

.comment-item
  background: #f8fafc
  border-radius: 10px
  padding: 10px 14px

.comment-date
  font-size: 11px
  color: var(--scholar-text-3)
  margin-bottom: 4px

.comment-content
  font-size: 13px
  color: var(--scholar-text-2)
  line-height: 1.6

.comment-input-row
  display: flex
  gap: 10px

.comment-input
  flex: 1
  height: 34px
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 0 12px
  font-size: 13px
  outline: none

.comment-input:focus
  border-color: var(--scholar-primary)

.comment-submit
  height: 34px
  padding: 0 16px
  border-radius: 10px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 13px
  cursor: pointer

.load-more
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
