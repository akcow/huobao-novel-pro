import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'

// Default model config - 默认模型配置
const DEFAULT_MODEL = 'deepseek-chat'

// Default voice API config - 默认语音 API 配置
const DEFAULT_VOICE_CONFIG = {
  appId: '',
  accessKey: '',
  model: '1.2.1.1',  // 1.2.1.1 = O2.0版本, 2.2.0.0 = SC2.0版本
  speaker: 'zh_female_vv_jupiter_bigtts',  // 默认音色
  speechRate: 0,  // 语速 [-50, 100]
  loudnessRate: 0,  // 音量 [-50, 100]
  botName: '创作顾问',  // 机器人名称
  systemRole: '你是一位专业的小说创作顾问，正在通过语音通话帮助作者构思故事。请用简短、自然的口语化方式回复，每次只问一个问题，控制在2-4句话内。',  // 系统角色
  speakingStyle: '亲切、专业、简洁'  // 说话风格
}

// Settings store - 设置状态管理
export const useSettingsStore = defineStore('settings', () => {
  // State
  const isDark = ref(localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches))
  
  const apiConfig = ref(JSON.parse(localStorage.getItem('api_config') || JSON.stringify({
    channel: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: DEFAULT_MODEL,
    temperature: 0.7,
    maxTokens: 8192,
    timeout: 600
  })))

  // Voice API config - 语音 API 配置
  const voiceConfig = ref(JSON.parse(localStorage.getItem('voice_config') || JSON.stringify(DEFAULT_VOICE_CONFIG)))

  // Stage-specific model configs - 各环节模型配置
  const stageModels = ref(JSON.parse(localStorage.getItem('stage_models') || JSON.stringify({
    architecture: '',  // 架构生成
    blueprint: '',     // 大纲生成
    chapter: '',       // 章节生成
    finalize: '',      // 定稿（摘要/状态更新）
    enrich: ''         // 扩写
  })))

  // Get config for specific stage - 获取特定环节的配置
  function getStageConfig(stage) {
    const stageModel = stageModels.value[stage]
    if (stageModel) {
      return { ...apiConfig.value, model: stageModel }
    }
    return apiConfig.value
  }

  // Check if voice API is configured - 检查语音 API 是否已配置
  const isVoiceConfigured = computed(() => {
    return !!voiceConfig.value.appId && !!voiceConfig.value.accessKey
  })

  // Watch theme changes and apply - 监听主题变化并应用
  watch(isDark, (newValue) => {
    if (newValue) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, { immediate: true })

  // Actions
  // Toggle dark mode - 切换深色模式
  function toggleDark() {
    isDark.value = !isDark.value
  }

  // Update API config - 更新 API 配置
  function updateApiConfig(config) {
    apiConfig.value = { ...apiConfig.value, ...config }
    localStorage.setItem('api_config', JSON.stringify(apiConfig.value))
  }

  // Update stage models - 更新环节模型配置
  function updateStageModels(models) {
    stageModels.value = { ...stageModels.value, ...models }
    localStorage.setItem('stage_models', JSON.stringify(stageModels.value))
  }

  // Update voice config - 更新语音 API 配置
  function updateVoiceConfig(config) {
    voiceConfig.value = { ...voiceConfig.value, ...config }
    localStorage.setItem('voice_config', JSON.stringify(voiceConfig.value))
  }

  return {
    isDark,
    apiConfig,
    voiceConfig,
    isVoiceConfigured,
    stageModels,
    toggleDark,
    updateApiConfig,
    updateVoiceConfig,
    updateStageModels,
    getStageConfig
  }
})
