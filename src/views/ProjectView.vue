<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNovelStore } from '../stores/novel'
import { useSettingsStore } from '../stores/settings'
import { generateArchitecture, generateChapterBlueprint, parseChapterBlueprint, exportNovelToText, exportNovelToMarkdown } from '../api/generator'
import { useMessage, useDialog, NButton, NTabs, NTabPane, NCard, NProgress, NTag, NIcon } from 'naive-ui'
import { ArrowBackOutline, WarningOutline, GridOutline, ListOutline, PencilOutline, DownloadOutline, DocumentTextOutline, ReloadOutline, CompassOutline, ChatbubblesOutline } from '@vicons/ionicons5'
import ArchitecturePanel from '../components/ArchitecturePanel.vue'
import ChapterBlueprintPanel from '../components/ChapterBlueprintPanel.vue'
import ChapterWriterPanel from '../components/ChapterWriterPanel.vue'
import InspirationCompass from '../components/compass/InspirationCompass.vue'
import StoryChatPanel from '../components/StoryChatPanel.vue'

const route = useRoute()
const router = useRouter()
const novelStore = useNovelStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// Current tab - 当前标签页
const activeTab = ref('chat')

// Generation state - 生成状态
const isGenerating = ref(false)
const generationStep = ref('')
const generationProgress = ref({ current: 0, total: 0 })

// Get current project - 获取当前项目
const project = computed(() => {
  return novelStore.projects.find(p => p.id === route.params.id)
})

// Parsed chapters - 解析后的章节
const chapters = computed(() => {
  if (!project.value?.chapterBlueprint) return []
  return parseChapterBlueprint(project.value.chapterBlueprint)
})

// Check if API is configured - 检查 API 是否已配置
const isApiConfigured = computed(() => {
  return !!settings.apiConfig.apiKey
})

const genreText = computed(() => {
  const genre = project.value?.genre
  if (Array.isArray(genre)) return genre.join(' / ')
  return genre || ''
})

// Load project on mount - 加载项目
onMounted(() => {
  if (!project.value) {
    message.error('项目不存在')
    router.push('/')
  }
})

// Generate architecture - 生成架构
async function handleGenerateArchitecture() {
  if (!isApiConfigured.value) {
    message.warning('请先在设置中配置 API Key')
    return
  }

  try {
    isGenerating.value = true
    
    const results = await generateArchitecture(
      project.value,
      settings.getStageConfig('architecture'),
      (step, current, total) => {
        generationStep.value = step
        generationProgress.value = { current, total }
      }
    )

    novelStore.updateProject(project.value.id, {
      ...results,
      architectureGenerated: true
    })

    message.success('小说架构生成完成!')
  } catch (error) {
    console.error('Generation error:', error)
    message.error('生成失败: ' + error.message)
  } finally {
    isGenerating.value = false
    generationStep.value = ''
  }
}

// Generate chapter blueprint - 生成章节大纲
async function handleGenerateBlueprint() {
  if (!isApiConfigured.value) {
    message.warning('请先在设置中配置 API Key')
    return
  }

  if (!project.value.architectureGenerated) {
    message.warning('请先生成小说架构')
    return
  }

  try {
    isGenerating.value = true
    
    const blueprint = await generateChapterBlueprint(
      project.value,
      settings.getStageConfig('blueprint'),
      (step, current, total) => {
        generationStep.value = step
        generationProgress.value = { current, total }
      }
    )

    novelStore.updateProject(project.value.id, {
      chapterBlueprint: blueprint,
      blueprintGenerated: true
    })

    message.success('章节大纲生成完成!')
  } catch (error) {
    console.error('Generation error:', error)
    message.error('生成失败: ' + error.message)
  } finally {
    isGenerating.value = false
    generationStep.value = ''
  }
}

// Written chapters count - 已写章节数
const writtenChaptersCount = computed(() => {
  return Object.keys(project.value?.chapters || {}).length
})

// Chat messages count - 对话消息数
const chatMessagesCount = computed(() => {
  return project.value?.storyChat?.messages?.length || 0
})

// Export novel - 导出小说
function handleExport(format) {
  if (!project.value) return
  
  const content = format === 'markdown' 
    ? exportNovelToMarkdown(project.value)
    : exportNovelToText(project.value)
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.value.title}.${format === 'markdown' ? 'md' : 'txt'}`
  a.click()
  URL.revokeObjectURL(url)
  
  message.success('导出成功')
}

// Regenerate confirmation - 重新生成确认
async function confirmRegenerate(type) {
  dialog.warning({
    title: '重新生成确认',
    content: `确定要重新生成${type === 'architecture' ? '小说架构' : '章节大纲'}吗？现有内容将被覆盖。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      if (type === 'architecture') {
        novelStore.updateProject(project.value.id, {
          coreSeed: '',
          characterDynamics: '',
          worldBuilding: '',
          plotArchitecture: '',
          characterState: '',
          architectureGenerated: false
        })
        handleGenerateArchitecture()
      } else {
        novelStore.updateProject(project.value.id, {
          chapterBlueprint: '',
          blueprintGenerated: false
        })
        handleGenerateBlueprint()
      }
    }
  })
}
</script>

<template>
  <div v-if="project" class="max-w-5xl mx-auto px-4">
    <!-- Project header - 项目头部 -->
    <div class="mb-6">
      <div class="flex items-center gap-3 mb-4">
        <n-button text @click="router.push('/')">
          <template #icon>
            <n-icon><ArrowBackOutline /></n-icon>
          </template>
          返回
        </n-button>
      </div>
      
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
            {{ project.title }}
          </h1>
          <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <n-tag :bordered="false" round size="small">{{ genreText }}</n-tag>
            <span>{{ project.numberOfChapters }} 章</span>
            <span>·</span>
            <span>每章 {{ project.wordNumber }} 字</span>
          </div>
        </div>

        <!-- API status indicator - API 状态指示器 -->
        <div v-if="!isApiConfigured" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
          <WarningOutline class="w-5 h-5" />
          <span class="text-sm font-medium">请配置 API Key</span>
        </div>
      </div>
    </div>

    <!-- Generation progress - 生成进度 -->
    <div v-if="isGenerating" class="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-5 border border-indigo-200/50 dark:border-indigo-700/50">
      <div class="flex items-center gap-4">
        <ReloadOutline class="w-6 h-6 text-indigo-500 animate-spin" />
        <div class="flex-1">
          <div class="text-gray-800 dark:text-white font-medium mb-2">
            {{ generationStep }}
          </div>
          <n-progress 
            type="line"
            :percentage="generationProgress.total > 0 ? Math.round((generationProgress.current / generationProgress.total) * 100) : 0"
            :height="8"
            :border-radius="4"
            :fill-border-radius="4"
            :show-indicator="false"
          />
        </div>
      </div>
    </div>

    <!-- Tabs - 标签页 -->
    <n-tabs v-model:value="activeTab" type="segment" animated class="novel-tabs">
      <!-- Story Chat tab - 故事对话标签页 -->
      <n-tab-pane name="chat">
        <template #tab>
          <div class="flex items-center gap-2">
            <ChatbubblesOutline class="w-4 h-4" />
            <span>故事对话</span>
            <n-tag v-if="chatMessagesCount > 0" type="info" size="small" :bordered="false" round>
              {{ chatMessagesCount }}
            </n-tag>
          </div>
        </template>
        
        <StoryChatPanel :project="project" @switch-to-architecture="activeTab = 'architecture'" />
      </n-tab-pane>

      <!-- Architecture tab - 架构标签页 -->
      <n-tab-pane name="architecture">
        <template #tab>
          <div class="flex items-center gap-2">
            <GridOutline class="w-4 h-4" />
            <span>小说架构</span>
            <n-tag v-if="project.architectureGenerated" type="success" size="small" :bordered="false" round>
              已生成
            </n-tag>
          </div>
        </template>
        
        <ArchitecturePanel 
          :project="project"
          :is-generating="isGenerating"
          @generate="handleGenerateArchitecture"
          @regenerate="confirmRegenerate('architecture')"
        />
      </n-tab-pane>

      <!-- Chapter blueprint tab - 章节大纲标签页 -->
      <n-tab-pane name="blueprint">
        <template #tab>
          <div class="flex items-center gap-2">
            <ListOutline class="w-4 h-4" />
            <span>章节大纲</span>
            <n-tag v-if="project.blueprintGenerated" type="success" size="small" :bordered="false" round>
              已生成
            </n-tag>
          </div>
        </template>

        <ChapterBlueprintPanel
          :project="project"
          :chapters="chapters"
          :is-generating="isGenerating"
          :architecture-generated="project.architectureGenerated"
          @generate="handleGenerateBlueprint"
          @regenerate="confirmRegenerate('blueprint')"
        />
      </n-tab-pane>

      <!-- Chapter writer tab - 章节写作标签页 -->
      <n-tab-pane name="writer">
        <template #tab>
          <div class="flex items-center gap-2">
            <PencilOutline class="w-4 h-4" />
            <span>章节写作</span>
            <n-tag v-if="writtenChaptersCount > 0" type="success" size="small" :bordered="false" round>
              {{ writtenChaptersCount }}/{{ project.numberOfChapters }}
            </n-tag>
          </div>
        </template>

        <ChapterWriterPanel
          :project="project"
          :is-generating="isGenerating"
          @update:is-generating="isGenerating = $event"
        />
      </n-tab-pane>

      <!-- Inspiration Compass tab - 灵感罗盘标签页 -->
      <n-tab-pane name="compass">
        <template #tab>
          <div class="flex items-center gap-2">
            <CompassOutline class="w-4 h-4" />
            <span>灵感罗盘</span>
            <n-tag v-if="project.graphData?.graphGenerated" type="success" size="small" :bordered="false" round>
              已生成
            </n-tag>
          </div>
        </template>

        <InspirationCompass
          :project="project"
          :is-generating="isGenerating"
          @update:is-generating="isGenerating = $event"
        />
      </n-tab-pane>

      <!-- Export tab - 导出标签页 -->
      <n-tab-pane name="export">
        <template #tab>
          <div class="flex items-center gap-2">
            <DownloadOutline class="w-4 h-4" />
            <span>导出</span>
          </div>
        </template>

        <div class="bg-white dark:bg-[#1f1f23] rounded-2xl p-8 border border-gray-200/80 dark:border-gray-700/50">
          <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-6">导出小说</h3>
          
          <!-- Export stats - 导出统计 -->
          <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl p-5 text-center">
              <div class="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">{{ writtenChaptersCount }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">已完成章节</div>
            </div>
            <div class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-5 text-center">
              <div class="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{{ project.numberOfChapters }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">总章节数</div>
            </div>
            <div class="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/20 rounded-xl p-5 text-center">
              <div class="text-4xl font-bold bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">
                {{ Object.values(project.chapters || {}).reduce((a, b) => a + b.length, 0) }}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">总字数</div>
            </div>
          </div>

          <!-- Export options - 导出选项 -->
          <div class="flex gap-4">
            <n-button size="large" @click="handleExport('txt')" :disabled="writtenChaptersCount === 0" secondary>
              <template #icon>
                <n-icon><DocumentTextOutline /></n-icon>
              </template>
              导出为 TXT
            </n-button>
            <n-button size="large" @click="handleExport('markdown')" :disabled="writtenChaptersCount === 0" secondary>
              <template #icon>
                <n-icon><DocumentTextOutline /></n-icon>
              </template>
              导出为 Markdown
            </n-button>
          </div>

          <div v-if="writtenChaptersCount === 0" class="flex items-center gap-2 mt-6 text-amber-600 dark:text-amber-400 text-sm">
            <WarningOutline class="w-4 h-4" />
            还没有已完成的章节，请先在「章节写作」中生成章节内容
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>

  <!-- Not found state - 未找到状态 -->
  <div v-else class="text-center py-20">
    <WarningOutline class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
    <p class="text-gray-500 dark:text-gray-400 mb-6">项目不存在或已被删除</p>
    <n-button type="primary" @click="router.push('/')">
      返回首页
    </n-button>
  </div>
</template>

<style>
.novel-tabs .n-tabs-nav {
  @apply bg-white dark:bg-[#1f1f23] rounded-xl p-1.5 border border-gray-200/80 dark:border-gray-700/50;
}

.novel-tabs .n-tabs-pane-wrapper {
  @apply pt-6;
}

.novel-tabs .n-tab-pane {
  @apply px-0;
}
</style>
