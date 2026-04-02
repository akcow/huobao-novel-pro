<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useSettingsStore } from '../stores/settings'
import { sendStoryChatMessage, summarizeChatToSettings } from '../api/chat'
import { VoiceWebSocketClient } from '../api/voice-websocket'
import { AudioRecorder, AudioPlayer, checkAudioSupport } from '../api/audio-handler'
import { NButton, NInput, NSpin, NIcon, NEmpty, NTag, useMessage, useDialog, NSlider, NTooltip } from 'naive-ui'
import { SendOutline, SparklesOutline, TrashOutline, ChatbubblesOutline, CheckmarkCircleOutline, CreateOutline, SaveOutline, CloseOutline, MicOutline, StopOutline, VolumeHighOutline, VolumeMuteOutline, SettingsOutline } from '@vicons/ionicons5'

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

// Voice mode state - 语音模式状态
const voiceMode = ref(false) // 是否处于语音模式
const isVoiceConnecting = ref(false)
const isVoiceRecording = ref(false)
const isVoicePlaying = ref(false)
const voiceSupported = ref(false)

// Voice clients - 语音客户端
let voiceClient = null
let audioRecorder = null
let audioPlayer = null

// Voice conversation state - 语音对话状态
const currentASRText = ref('') // 当前识别的语音文本
const currentChatText = ref('') // 当前AI回复文本
const voiceVolume = ref(1.0)
const voiceSpeed = ref(1.0)

// Edit state - 编辑状态
const isEditing = ref(false)
const editContent = ref('')

// Get chat messages - 获取对话消息
const chatMessages = computed(() => {
  return props.project?.storyChat?.messages || []
})

// Check if API is configured - 检查 API 是否已配置
const isApiConfigured = computed(() => {
  return !!settings.apiConfig.apiKey
})

// Check if voice API is configured - 检查语音 API 是否已配置
const isVoiceApiConfigured = computed(() => {
  return settings.isVoiceConfigured
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

// Check voice support - 检查语音支持
function checkVoiceSupport() {
  const support = checkAudioSupport()
  voiceSupported.value = support.mediaDevices && support.audioContext
  if (!voiceSupported.value) {
    console.warn('[Voice] Voice not supported:', support)
  }
}

// Initialize voice mode - 初始化语音模式
async function initVoiceMode() {
  if (!voiceSupported.value) {
    message.error('您的浏览器不支持语音功能')
    return false
  }
  
  if (!isVoiceApiConfigured.value) {
    message.warning('请先在设置中配置语音 API')
    return false
  }
  
  try {
    // Initialize audio recorder
    audioRecorder = new AudioRecorder()
    audioRecorder.onError = (error) => {
      message.error(error.error)
      stopVoiceRecording()
    }
    audioRecorder.onAudioData = (audioData) => {
      if (voiceClient && voiceClient.isSessionActive) {
        voiceClient.sendAudio(audioData)
      }
    }
    await audioRecorder.init()
    
    // Initialize audio player
    audioPlayer = new AudioPlayer()
    audioPlayer.onPlaybackEnded = () => {
      isVoicePlaying.value = false
    }
    audioPlayer.onPlaybackStarted = () => {
      isVoicePlaying.value = true
    }
    await audioPlayer.init()
    
    // Initialize voice WebSocket client
    const voiceConfig = settings.voiceConfig
    voiceClient = new VoiceWebSocketClient({
      appId: voiceConfig.appId,
      accessKey: voiceConfig.accessKey,
      model: voiceConfig.model,
      speaker: voiceConfig.speaker,
      speechRate: voiceConfig.speechRate,
      loudnessRate: voiceConfig.loudnessRate,
      botName: voiceConfig.botName,
      systemRole: voiceConfig.systemRole,
      speakingStyle: voiceConfig.speakingStyle
    })
    
    // Set up callbacks
    voiceClient.onConnectionStarted = () => {
      console.log('[Voice] Connection started')
    }
    
    voiceClient.onConnectionFailed = (error) => {
      message.error('语音服务连接失败: ' + (error.error || '未知错误'))
      isVoiceConnecting.value = false
    }
    
    voiceClient.onSessionStarted = (data) => {
      console.log('[Voice] Session started:', data)
      isVoiceConnecting.value = false
      message.success('语音对话已连接')
    }
    
    voiceClient.onSessionFailed = (error) => {
      message.error('语音会话启动失败')
      isVoiceConnecting.value = false
    }
    
    voiceClient.onASRText = (data) => {
      // User speech recognition result
      console.log('[Voice] ASR text:', data.text, 'isInterim:', data.isInterim)
      if (data.isInterim) {
        currentASRText.value = data.text
      } else {
        // Final result - add to chat
        if (data.text.trim()) {
          addVoiceMessage('user', data.text)
        }
        currentASRText.value = ''
      }
    }
    
    voiceClient.onASREnded = () => {
      // User stopped speaking
      console.log('[Voice] User stopped speaking')
    }
    
    // 累积 AI 回复文本
    let accumulatedResponse = ''
    let lastQuestionId = null
    
    voiceClient.onChatResponse = (data) => {
      // AI text response - 累积文本
      console.log('[Voice] Chat response:', data.content)
      if (data.questionId !== lastQuestionId) {
        // 新的一轮回复
        accumulatedResponse = ''
        lastQuestionId = data.questionId
      }
      accumulatedResponse += data.content || ''
      currentChatText.value = accumulatedResponse
    }
    
    voiceClient.onTTSSentenceStart = (data) => {
      // New TTS sentence
      console.log('[Voice] TTS sentence start:', data.text)
      if (data.text) {
        // 先显示当前句子
        currentChatText.value = data.text
      }
    }
    
    voiceClient.onTTSAudio = (data) => {
      // AI audio data - play it
      if (audioPlayer) {
        audioPlayer.queue(data.audioData)
      }
    }
    
    voiceClient.onTTSEnded = (data) => {
      // TTS ended - 将累积的回复添加到聊天
      console.log('[Voice] TTS ended, accumulated:', accumulatedResponse)
      if (accumulatedResponse.trim()) {
        addVoiceMessage('assistant', accumulatedResponse.trim())
        accumulatedResponse = ''
      }
      currentChatText.value = ''
    }
    
    voiceClient.onError = (error) => {
      console.error('[Voice] Error:', error)
      if (error.status_code === '45000003') {
        message.warning('语音对话超时，正在重连...')
      } else {
        message.error('语音服务错误: ' + (error.message || error.error || '未知错误'))
      }
    }
    
    voiceClient.onDisconnected = () => {
      isVoiceConnecting.value = false
      isVoiceRecording.value = false
    }
    
    return true
  } catch (error) {
    console.error('[Voice] Init failed:', error)
    message.error('语音模式初始化失败: ' + error.message)
    return false
  }
}

// Toggle voice mode - 切换语音模式
async function toggleVoiceMode() {
  if (voiceMode.value) {
    // Exit voice mode
    await exitVoiceMode()
  } else {
    // Enter voice mode
    const success = await initVoiceMode()
    if (success) {
      voiceMode.value = true
      await connectVoiceService()
    }
  }
}

// Connect to voice service - 连接语音服务
async function connectVoiceService() {
  if (!voiceClient) return
  
  isVoiceConnecting.value = true
  try {
    await voiceClient.connectWithAuth()
    await voiceClient.startSession()
  } catch (error) {
    console.error('[Voice] Connect failed:', error)
    isVoiceConnecting.value = false
    message.error('语音服务连接失败: ' + error.message)
  }
}

// Exit voice mode - 退出语音模式
async function exitVoiceMode() {
  stopVoiceRecording()
  
  if (audioPlayer) {
    audioPlayer.stop()
  }
  
  if (voiceClient) {
    voiceClient.disconnect()
    voiceClient = null
  }
  
  if (audioRecorder) {
    audioRecorder.destroy()
    audioRecorder = null
  }
  
  if (audioPlayer) {
    audioPlayer.destroy()
    audioPlayer = null
  }
  
  voiceMode.value = false
  isVoiceConnecting.value = false
  isVoiceRecording.value = false
  isVoicePlaying.value = false
  currentASRText.value = ''
  currentChatText.value = ''
}

// Start voice recording - 开始录音
function startVoiceRecording() {
  if (!audioRecorder || !voiceClient?.isSessionActive) {
    message.warning('语音服务未连接')
    return
  }
  
  // Stop any playing audio
  if (audioPlayer) {
    audioPlayer.stop()
  }
  
  audioRecorder.start()
  isVoiceRecording.value = true
  console.log('[Voice] Recording started')
}

// Stop voice recording - 停止录音
function stopVoiceRecording() {
  if (audioRecorder) {
    audioRecorder.stop()
  }
  
  if (voiceClient?.isSessionActive) {
    voiceClient.endASR()
  }
  
  isVoiceRecording.value = false
  console.log('[Voice] Recording stopped')
}

// Toggle recording - 切换录音状态
function toggleRecording() {
  if (isVoiceRecording.value) {
    stopVoiceRecording()
  } else {
    startVoiceRecording()
  }
}

// Add voice message to chat - 添加语音消息到对话
function addVoiceMessage(role, content) {
  if (!content.trim()) return
  
  console.log('[Voice] Adding message:', role, content.substring(0, 50))
  
  novelStore.addChatMessage(props.project.id, {
    role,
    content: content.trim()
  })
  
  scrollToBottom()
}

// Stop voice playback - 停止语音播放
function stopVoicePlayback() {
  if (audioPlayer) {
    audioPlayer.stop()
  }
}

// Set voice volume - 设置音量
function setVoiceVolume(value) {
  voiceVolume.value = value
  if (audioPlayer) {
    audioPlayer.setVolume(value)
  }
}

// Set voice speed - 设置语速
function setVoiceSpeed(value) {
  voiceSpeed.value = value
  if (audioPlayer) {
    audioPlayer.setPlaybackRate(value)
  }
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

// Start editing summary - 开始编辑摘要
function startEdit() {
  editContent.value = props.project?.storyChat?.summary || ''
  isEditing.value = true
}

// Cancel editing - 取消编辑
function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

// Save edited summary - 保存编辑的摘要
function saveEdit() {
  if (!editContent.value.trim()) {
    message.warning('摘要内容不能为空')
    return
  }
  novelStore.updateChatSummary(props.project.id, editContent.value.trim())
  isEditing.value = false
  editContent.value = ''
  message.success('故事设定摘要已更新')
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
  checkVoiceSupport()
})

// Cleanup on unmount - 卸载时清理
onUnmounted(() => {
  exitVoiceMode()
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
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ voiceMode ? '语音对话模式' : '与 AI 编辑逐步完善故事设定' }}
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <!-- Voice mode toggle - 语音模式切换 -->
        <n-tooltip trigger="hover" v-if="voiceSupported">
          <template #trigger>
            <n-button 
              size="small" 
              :type="voiceMode ? 'primary' : 'default'"
              :loading="isVoiceConnecting"
              @click="toggleVoiceMode"
            >
              <template #icon>
                <n-icon><MicOutline /></n-icon>
              </template>
              {{ voiceMode ? '退出语音' : '语音模式' }}
            </n-button>
          </template>
          {{ voiceMode ? '退出语音对话模式' : '进入语音对话模式（需要启动代理服务器）' }}
        </n-tooltip>
        
        <n-tag v-if="isSummarized" type="success" size="small" :bordered="false" round>
          <template #icon>
            <n-icon><CheckmarkCircleOutline /></n-icon>
          </template>
          已整理
        </n-tag>
        <n-button 
          v-if="hasMessages && !voiceMode"
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
      <div v-if="!hasMessages && !isSending && !voiceMode" class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
          <ChatbubblesOutline class="w-10 h-10 text-indigo-500 dark:text-indigo-400" />
        </div>
        <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">开始与 AI 编辑对话</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          告诉 AI 你的故事想法，它会通过提问帮你完善角色、世界观和情节
        </p>
      </div>

      <!-- Voice mode empty state - 语音模式空状态 -->
      <div v-if="!hasMessages && voiceMode && !isVoiceConnecting" class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mb-4">
          <MicOutline class="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">语音对话已就绪</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          点击下方麦克风按钮开始说话
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
        <div class="flex items-center gap-2">
          <n-button
            v-if="!isEditing"
            size="small"
            secondary
            @click="startEdit"
          >
            <template #icon>
              <n-icon><CreateOutline /></n-icon>
            </template>
            编辑
          </n-button>
          <n-button
            v-if="!isEditing"
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
      </div>
      
      <!-- View mode - 查看模式 -->
      <div v-if="!isEditing" class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
        {{ project.storyChat.summary }}
      </div>
      
      <!-- Edit mode - 编辑模式 -->
      <div v-else class="space-y-3">
        <n-input
          v-model:value="editContent"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 15 }"
          placeholder="编辑故事设定摘要..."
          class="w-full"
        />
        <div class="flex justify-end gap-2">
          <n-button size="small" @click="cancelEdit">
            <template #icon>
              <n-icon><CloseOutline /></n-icon>
            </template>
            取消
          </n-button>
          <n-button size="small" type="primary" @click="saveEdit">
            <template #icon>
              <n-icon><SaveOutline /></n-icon>
            </template>
            保存
          </n-button>
        </div>
      </div>
    </div>

    <!-- Input area - 输入区域 -->
    <div class="mt-4">
      <!-- Voice mode controls - 语音模式控制 -->
      <div v-if="voiceMode" class="space-y-3">
        <!-- Current ASR text display - 当前识别文本显示 -->
        <div v-if="currentASRText" class="bg-white dark:bg-[#27272a] rounded-xl p-3 border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">正在识别...</div>
          <div class="text-sm text-gray-700 dark:text-gray-300">{{ currentASRText }}</div>
        </div>
        
        <!-- Voice controls - 语音控制 -->
        <div class="flex items-center justify-center gap-4">
          <!-- Recording button - 录音按钮 -->
          <n-button
            :type="isVoiceRecording ? 'error' : 'primary'"
            size="large"
            circle
            :disabled="isVoiceConnecting"
            @click="toggleRecording"
            class="!w-16 !h-16"
          >
            <template #icon>
              <n-icon :size="28">
                <MicOutline v-if="!isVoiceRecording" />
                <StopOutline v-else />
              </n-icon>
            </template>
          </n-button>
        </div>
        
        <!-- Recording status - 录音状态 -->
        <div class="text-center text-sm">
          <span v-if="isVoiceConnecting" class="text-gray-500">正在连接语音服务...</span>
          <span v-else-if="isVoiceRecording" class="text-red-500 font-medium">正在录音，点击停止</span>
          <span v-else-if="isVoicePlaying" class="text-emerald-500">AI 正在回复...</span>
          <span v-else class="text-gray-500">点击麦克风开始说话</span>
        </div>
        
        <!-- Audio controls - 音频控制 -->
        <div class="flex items-center justify-center gap-6 pt-2">
          <!-- Volume control - 音量控制 -->
          <div class="flex items-center gap-2">
            <n-icon :size="18" class="text-gray-500">
              <VolumeMuteOutline v-if="voiceVolume < 0.3" />
              <VolumeHighOutline v-else />
            </n-icon>
            <n-slider
              v-model:value="voiceVolume"
              :min="0"
              :max="1"
              :step="0.1"
              @update:value="setVoiceVolume"
              style="width: 80px"
            />
          </div>
          
          <!-- Stop playback - 停止播放 -->
          <n-button 
            v-if="isVoicePlaying"
            size="small"
            secondary
            @click="stopVoicePlayback"
          >
            <template #icon>
              <n-icon><StopOutline /></n-icon>
            </template>
            停止播放
          </n-button>
        </div>
      </div>
      
      <!-- Text mode input - 文字模式输入 -->
      <div v-else class="flex gap-3">
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
    </div>

    <!-- API warning - API 警告 -->
    <div v-if="!isApiConfigured && !voiceMode" class="mt-3 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
      <n-icon><SparklesOutline class="w-4 h-4" /></n-icon>
      请先在设置中配置 API Key
    </div>
    
    <!-- Voice API warning - 语音 API 警告 -->
    <div v-if="voiceMode && !isVoiceApiConfigured" class="mt-3 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
      <n-icon><MicOutline class="w-4 h-4" /></n-icon>
      请先在设置中配置语音 API（App ID 和 Access Token）
    </div>
    
    <!-- Proxy server hint - 代理服务器提示 -->
    <div v-if="voiceMode && isVoiceApiConfigured && !isVoiceConnecting && !voiceClient?.isConnected" class="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm">
      <div class="flex items-start gap-2">
        <n-icon class="text-blue-500 mt-0.5"><SettingsOutline /></n-icon>
        <div>
          <div class="font-medium text-blue-700 dark:text-blue-300">启动代理服务器</div>
          <div class="text-blue-600 dark:text-blue-400 mt-1">
            在终端运行：<code class="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">node voice-proxy-server.js</code>
          </div>
        </div>
      </div>
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
