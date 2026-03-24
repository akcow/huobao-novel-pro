<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useSettingsStore } from '../stores/settings'
import { sendStoryChatMessage, summarizeChatToSettings } from '../api/chat'
import { NButton, NInput, NSpin, NIcon, NEmpty, NTag, useMessage, useDialog } from 'naive-ui'
import { SendOutline, SparklesOutline, TrashOutline, ChatbubblesOutline, CheckmarkCircleOutline } from '@vicons/ionicons5'

const props = defineProps({
  project: Object
})

const emit = defineEmits(['switch-to-architecture'])

const novelStore = useNovelStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// Chat state - 对话状态
const inputMessage = ref('')
const isSending = ref(false)
const isSummarizing = ref(false)
const streamingContent = ref('')
const messagesContainer = ref(null)

// Get chat messages - 获取对话消息
const chatMessages = computed(() => {
  return props.project?.storyChat?.messages || []
})

// Check if API is configured - 检查 API 是否已配置
const isApiConfigured = computed(() => {
  return !!settings.apiConfig.apiKey
})

// Has messages - 是否有消息
const hasMessages = computed(() => chatMessages.value.length > 0)

// Check if summarized - 是否已整理
const isSummarized = computed(() => {
  return !!props.project?.storyChat?.summarizedAt
})

// Scroll to bottom - 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// Send message - 发送消息
async function handleSend() {
  if (!inputMessage.value.trim() || isSending.value) return
  
  if (!isApiConfigured.value) {
    message.warning('请先在设置中配置 API Key')
    return
  }

  const userContent = inputMessage.value.trim()
  inputMessage.value = ''
  
  // Add user message - 添加用户消息
  novelStore.addChatMessage(props.project.id, {
    role: 'user',
    content: userContent
  })
  
  scrollToBottom()
  
  try {
    isSending.value = true
    streamingContent.value = ''
    
    // Build history from existing messages - 从现有消息构建历史
    const history = chatMessages.value
      .filter(m => m.role !== 'system')
      .slice(0, -1) // Exclude the message we just added
      .map(m => ({ role: m.role, content: m.content }))
    
    // Send message with streaming - 发送消息（流式）
    const response = await sendStoryChatMessage(
      history,
      userContent,
      settings.getStageConfig('architecture'),
      (delta, fullContent) => {
        streamingContent.value = fullContent
        scrollToBottom()
      }
    )
    
    // Add AI response - 添加 AI 响应
    novelStore.addChatMessage(props.project.id, {
      role: 'assistant',
      content: response
    })
    
    streamingContent.value = ''
    scrollToBottom()
  } catch (error) {
    console.error('Chat error:', error)
    message.error('发送失败: ' + error.message)
  } finally {
    isSending.value = false
  }
}

// Handle enter key - 处理回车键
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Summarize chat to settings - 整理对话为设定
async function handleSummarize() {
  if (!hasMessages.value || isSummarizing.value) return
  
  try {
    isSummarizing.value = true
    message.loading('正在整理对话内容...')
    
    const summary = await summarizeChatToSettings(
      chatMessages.value,
      settings.getStageConfig('architecture')
    )
    
    novelStore.updateChatSummary(props.project.id, summary)
    message.success('整理完成！可以在下方查看设定摘要')
  } catch (error) {
    console.error('Summarize error:', error)
    message.error('整理失败: ' + error.message)
  } finally {
    isSummarizing.value = false
  }
}

// Clear chat - 清空对话
function handleClearChat() {
  dialog.warning({
    title: '清空对话',
    content: '确定要清空所有对话记录吗？此操作不可恢复。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      novelStore.clearChat(props.project.id)
      message.success('对话已清空')
    }
  })
}

// Apply to architecture - 应用到架构
function handleApply() {
  dialog.success({
    title: '提示',
    content: '已经应用通过对话提供的故事设定，请移步到「小说架构」标签页。',
    positiveText: '确定',
    onPositiveClick: () => {
      emit('switch-to-architecture')
    }
  })
}

// Format time - 格式化时间
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// Scroll to bottom on mount - 挂载时滚动到底部
onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
    <!-- Chat header - 对话头部 -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <ChatbubblesOutline class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-800 dark:text-white">故事对话</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">与 AI 编辑逐步完善故事设定</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <n-tag v-if="isSummarized" type="success" size="small" :bordered="false" round>
          <template #icon>
            <n-icon><CheckmarkCircleOutline /></n-icon>
          </template>
          已整理
        </n-tag>
        <n-button 
          v-if="hasMessages"
          size="small" 
          secondary 
          @click="handleClearChat"
          :disabled="isSending"
        >
          <template #icon>
            <n-icon><TrashOutline /></n-icon>
          </template>
          清空
        </n-button>
      </div>
    </div>

    <!-- Messages area - 消息区域 -->
    <div 
      ref="messagesContainer"
      class="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#18181b] rounded-2xl p-4 space-y-4"
    >
      <!-- Empty state - 空状态 -->
      <div v-if="!hasMessages && !isSending" class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
          <ChatbubblesOutline class="w-10 h-10 text-indigo-500 dark:text-indigo-400" />
        </div>
        <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">开始与 AI 编辑对话</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          告诉 AI 你的故事想法，它会通过提问帮你完善角色、世界观和情节
        </p>
      </div>

      <!-- Message list - 消息列表 -->
      <template v-else>
        <div 
          v-for="(msg, index) in chatMessages" 
          :key="index"
          :class="[
            'flex',
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          ]"
        >
          <div 
            :class="[
              'max-w-[80%] rounded-2xl px-4 py-3',
              msg.role === 'user' 
                ? 'bg-indigo-500 text-white rounded-br-sm' 
                : 'bg-white dark:bg-[#27272a] text-gray-800 dark:text-gray-200 rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700'
            ]"
          >
            <div class="text-sm leading-relaxed whitespace-pre-wrap">{{ msg.content }}</div>
            <div 
              :class="[
                'text-xs mt-2',
                msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400 dark:text-gray-500'
              ]"
            >
              {{ formatTime(msg.timestamp) }}
            </div>
          </div>
        </div>

        <!-- Streaming response - 流式响应 -->
        <div v-if="isSending && streamingContent" class="flex justify-start">
          <div class="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-[#27272a] text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="text-sm leading-relaxed whitespace-pre-wrap">{{ streamingContent }}</div>
          </div>
        </div>

        <!-- Loading indicator - 加载指示器 -->
        <div v-if="isSending && !streamingContent" class="flex justify-start">
          <div class="bg-white dark:bg-[#27272a] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <n-spin size="small" />
              <span class="text-sm">AI 正在思考...</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Summary display - 设定摘要显示 -->
    <div v-if="project?.storyChat?.summary" class="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-700/50">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <SparklesOutline class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span class="font-medium text-emerald-700 dark:text-emerald-300">故事设定摘要</span>
        </div>
        <n-button
          size="small"
          type="primary"
          @click="handleApply"
        >
          <template #icon>
            <n-icon><CheckmarkCircleOutline /></n-icon>
          </template>
          应用到小说架构进行生成
        </n-button>
      </div>
      <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
        {{ project.storyChat.summary }}
      </div>
    </div>

    <!-- Input area - 输入区域 -->
    <div class="mt-4 flex gap-3">
      <n-input
        v-model:value="inputMessage"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        placeholder="输入你的故事想法..."
        :disabled="isSending || !isApiConfigured"
        @keydown="handleKeydown"
        class="flex-1"
      />
      <div class="flex flex-col gap-2">
        <n-button 
          type="primary"
          :disabled="!inputMessage.trim() || isSending || !isApiConfigured"
          :loading="isSending"
          @click="handleSend"
          class="!h-[38px]"
        >
          <template #icon v-if="!isSending">
            <n-icon><SendOutline /></n-icon>
          </template>
          发送
        </n-button>
        <n-button 
          v-if="hasMessages"
          type="success"
          secondary
          :disabled="isSummarizing || isSending"
          :loading="isSummarizing"
          @click="handleSummarize"
          class="!h-[38px]"
        >
          <template #icon v-if="!isSummarizing">
            <n-icon><SparklesOutline /></n-icon>
          </template>
          整理成设定
        </n-button>
      </div>
    </div>

    <!-- API warning - API 警告 -->
    <div v-if="!isApiConfigured" class="mt-3 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
      <n-icon><SparklesOutline class="w-4 h-4" /></n-icon>
      请先在设置中配置 API Key
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar - 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.dark ::-webkit-scrollbar-thumb {
  background: #374151;
}
</style>
