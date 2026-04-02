<script setup>
import { ref, watch, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useMessage } from 'naive-ui'
import { NModal, NCard, NForm, NFormItem, NInput, NButton, NSpace, NIcon, NTooltip, NTabs, NTabPane, NSelect, NAutoComplete, NSlider, NInputNumber } from 'naive-ui'
import { FlashOutline, HelpCircleOutline, MicOutline } from '@vicons/ionicons5'

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue'])

const settings = useSettingsStore()
const message = useMessage()

// Current settings tab - 当前设置标签页
const currentTab = ref('api')

// Channel configurations - 渠道配置
const channels = [
  { 
    id: 'chatfire', 
    name: 'Chatfire',
    baseUrl:'https://api.chatfire.site/v1',
    models: [
      'gemini-3-flash-preview',
      'doubao-seed-1-8-251228',
      'gemini-3-pro-preview',
      // 'gpt-4o',
      // 'claude-sonnet-4-5-20250929',
      // 'kimi-k2-thinking',
      // 'gemini-2.5-pro'
    ]
  },
    {
    id: 'deepseek', 
    name: 'DeepSeek',
    baseUrl:'https://api.deepseek.com/v1',
    models: [
        'deepseek-chat',
        'deepseek-reasoner',
        'deepseek-coder'
    ]
  },
    {
    id: '12ai', 
    name: '12ai',
    baseUrl:'https://cdn.12ai.org/v1',
    models: [
        'gemini-3-pro-preview',
        'gpt-5.1'
    ]
  }
  // { 
  //   id: 'openai', 
  //   name: 'OpenAI',
  //   baseUrl: 'https://api.openai.com/v1',
  //   models: ['gpt-5.2', 'gpt-4o', 'gpt-4o-mini']
  // },
  // { 
  //   id: 'gemini', 
  //   name: 'Google Gemini',
  //   baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  //   models: ['gemini-2.5-pro', 'gemini-3-pro-preview']
  // }
]

// Current channel - 当前渠道
const currentChannel = ref('deepseek')

// Channel options for select - 渠道选项
const channelOptions = channels.map(c => ({ label: c.name, value: c.id }))

// Current channel models - 当前渠道的模型列表
const currentChannelModels = computed(() => {
  const channel = channels.find(c => c.id === currentChannel.value)
  return channel?.models.map(m => ({ label: m, value: m })) || []
})

// Initialize with default values - 使用默认值初始化
const localConfig = ref({
  channel: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 8192,
  timeout: 600
})

// Voice API config - 语音 API 配置
const localVoiceConfig = ref({
  appId: '',
  accessKey: '',
  model: '1.2.1.1',
  speaker: 'zh_female_vv_jupiter_bigtts',
  speechRate: 0,
  loudnessRate: 0,
  botName: '创作顾问',
  systemRole: '你是一位专业的小说创作顾问，正在通过语音通话帮助作者构思故事。请用简短、自然的口语化方式回复，每次只问一个问题，控制在2-4句话内。',
  speakingStyle: '亲切、专业、简洁'
})

// Voice model options - 语音模型选项
const voiceModelOptions = [
  { label: 'O2.0版本 (推荐，支持精品音色)', value: '1.2.1.1' },
  { label: 'SC2.0版本 (支持克隆音色)', value: '2.2.0.0' }
]

// Speaker options - 音色选项
const speakerOptions = computed(() => {
  if (localVoiceConfig.value.model === '1.2.1.1') {
    // O2.0版本音色
    return [
      { label: 'vv - 活泼灵动的女声', value: 'zh_female_vv_jupiter_bigtts' },
      { label: 'xiaohe - 甜美活泼的女声(台湾口音)', value: 'zh_female_xiaohe_jupiter_bigtts' },
      { label: 'yunzhou - 清爽沉稳的男声', value: 'zh_male_yunzhou_jupiter_bigtts' },
      { label: 'xiaotian - 清爽磁性的男声', value: 'zh_male_xiaotian_jupiter_bigtts' }
    ]
  } else {
    // SC2.0版本音色
    return [
      { label: '傲娇女友', value: 'saturn_zh_female_aojiaonvyou_tob' },
      { label: '冰娇姐姐', value: 'saturn_zh_female_bingjiaojiejie_tob' },
      { label: '成熟姐姐', value: 'saturn_zh_female_chengshujiejie_tob' },
      { label: '可爱女生', value: 'saturn_zh_female_keainvsheng_tob' },
      { label: '暖心学姐', value: 'saturn_zh_female_nuanxinxuejie_tob' },
      { label: '贴心女友', value: 'saturn_zh_female_tiexinnvyou_tob' },
      { label: '温柔文雅', value: 'saturn_zh_female_wenrouwenya_tob' },
      { label: '雾媚御姐', value: 'saturn_zh_female_wumeiyujie_tob' },
      { label: '性感御姐', value: 'saturn_zh_female_xingganyujie_tob' },
      { label: '爱妻令仁', value: 'saturn_zh_male_aiqilingren_tob' },
      { label: '傲娇公子', value: 'saturn_zh_male_aojiaogongzi_tob' },
      { label: '傲娇精英', value: 'saturn_zh_male_aojiaojingying_tob' },
      { label: '傲慢少爷', value: 'saturn_zh_male_aomanshaoye_tob' },
      { label: '霸道少爷', value: 'saturn_zh_male_badaoshaoye_tob' },
      { label: '冰娇白莲', value: 'saturn_zh_male_bingjiaobailian_tob' },
      { label: '不羁青年', value: 'saturn_zh_male_bujiqingnian_tob' },
      { label: '成熟总裁', value: 'saturn_zh_male_chengshuzongcai_tob' },
      { label: '痴性男桑', value: 'saturn_zh_male_cixingnansang_tob' },
      { label: '粗京男尤', value: 'saturn_zh_male_cujingnanyou_tob' },
      { label: '风发少年', value: 'saturn_zh_male_fengfashaonian_tob' },
      { label: '腹黑公子', value: 'saturn_zh_male_fuheigongzi_tob' }
    ]
  }
})

// Handle channel change - 处理渠道切换
function handleChannelChange(channelId) {
  currentChannel.value = channelId
  const channel = channels.find(c => c.id === channelId)
  if (channel) {
    localConfig.value.channel = channelId
    localConfig.value.baseUrl = channel.baseUrl
    localConfig.value.model = channel.models[0] || ''
  }
}

// Stage-specific models - 各环节模型配置
const localStageModels = ref({
  architecture: '',
  blueprint: '',
  chapter: '',
  finalize: '',
  enrich: ''
})

// Stage labels - 环节标签
const stageLabels = {
  architecture: '架构生成',
  blueprint: '大纲生成',
  chapter: '章节生成',
  finalize: '定稿处理',
  enrich: '章节扩写'
}

// Sync local config when dialog opens - 打开对话框时同步本地配置
watch(() => props.modelValue, (val) => {
  if (val) {
    localConfig.value = { ...settings.apiConfig }
    localStageModels.value = { ...settings.stageModels }
    localVoiceConfig.value = { ...settings.voiceConfig }
    currentChannel.value = localConfig.value.channel || 'deepseek'
  }
}, { immediate: true })

// Save settings - 保存设置
function saveSettings() {
  if (!localConfig.value.apiKey) {
    message.warning('请输入 API Key')
    return
  }
  settings.updateApiConfig(localConfig.value)
  settings.updateStageModels(localStageModels.value)
  settings.updateVoiceConfig(localVoiceConfig.value)
  message.success('设置已保存')
  emit('update:modelValue', false)
}

// Test connection - 测试连接
async function testConnection() {
  if (!localConfig.value.apiKey) {
    message.warning('请先输入 API Key')
    return
  }
  
  try {
    const response = await fetch(`${localConfig.value.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${localConfig.value.apiKey}`
      }
    })
    
    if (response.ok) {
      message.success('连接成功!')
    } else {
      message.error('连接失败: ' + response.status)
    }
  } catch (error) {
    message.error('连接失败: ' + error.message)
  }
}

function goToGetKey() {
  window.open('https://platform.deepseek.com/api_keys', '_blank') 
  //window.open('https://api.chatfire.site/login?inviteCode=EEE80324', '_blank')
}
</script>

<template>
  <n-modal
    :show="modelValue"
    @update:show="emit('update:modelValue', $event)"
    :mask-closable="false"
    preset="card"
    title="设置"
    style="width: 560px"
    :bordered="false"
    class="!rounded-2xl"
  >
    <n-tabs v-model:value="currentTab" type="line" animated>
      <!-- API Settings Tab -->
      <n-tab-pane name="api" tab="API 设置">
        <n-form label-placement="top" class="space-y-1 mt-2">
          <!-- Channel Select -->
          <n-form-item label="渠道">
            <n-select
              :value="currentChannel"
              :options="channelOptions"
              @update:value="handleChannelChange"
            />
          </n-form-item>

          <!-- API Base URL -->
          <n-form-item label="API Base URL">
            <n-input 
              v-model:value="localConfig.baseUrl" 
              placeholder="https://api.chatfire.site/v1"
            />
          </n-form-item>

          <!-- API Key -->
          <n-form-item label="API Key">
            <n-input 
              v-model:value="localConfig.apiKey" 
              type="password"
              placeholder="请输入 API Key"
              show-password-on="click"
            />
          </n-form-item>

          <!-- Default Model -->
          <n-form-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>默认模型</span>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-icon class="text-gray-400 cursor-help" :size="14">
                      <HelpCircleOutline />
                    </n-icon>
                  </template>
                  未单独配置环节模型时使用此模型
                </n-tooltip>
              </div>
            </template>
            <n-auto-complete
              v-model:value="localConfig.model"
              :options="currentChannelModels"
              :get-show="() => true"
              placeholder="选择或输入模型名称"
              clearable
            />
          </n-form-item>

          <!-- Stage-specific Models -->
          <div class="mt-4">
            <div class="flex items-center gap-1 mb-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">各环节模型配置</span>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-icon class="text-gray-400 cursor-help" :size="14">
                    <HelpCircleOutline />
                  </n-icon>
                </template>
                留空则使用默认模型
              </n-tooltip>
            </div>
            <n-tabs type="segment" size="small">
              <n-tab-pane v-for="(label, key) in stageLabels" :key="key" :name="key" :tab="label">
                <n-auto-complete
                  v-model:value="localStageModels[key]"
                  :options="currentChannelModels"
                  :get-show="() => true"
                  placeholder="留空使用默认模型"
                  class="mt-3"
                  clearable
                />
              </n-tab-pane>
            </n-tabs>
          </div>
        </n-form>
      </n-tab-pane>

      <!-- Voice Settings Tab -->
      <n-tab-pane name="voice" tab="语音设置">
        <n-form label-placement="top" class="space-y-1 mt-2">
          <div class="flex items-center gap-2 mb-4 text-sm text-gray-500 dark:text-gray-400">
            <n-icon><MicOutline /></n-icon>
            <span>配置豆包实时语音大模型 API（用于语音对话功能）</span>
          </div>

          <!-- App ID -->
          <n-form-item label="App ID">
            <n-input 
              v-model:value="localVoiceConfig.appId" 
              placeholder="请输入 App ID"
            />
          </n-form-item>

          <!-- Access Key -->
          <n-form-item label="Access Token">
            <n-input 
              v-model:value="localVoiceConfig.accessKey" 
              type="password"
              placeholder="请输入 Access Token"
              show-password-on="click"
            />
          </n-form-item>

          <!-- Voice Model -->
          <n-form-item label="模型版本">
            <n-select
              v-model:value="localVoiceConfig.model"
              :options="voiceModelOptions"
            />
          </n-form-item>

          <!-- Speaker -->
          <n-form-item label="音色">
            <n-select
              v-model:value="localVoiceConfig.speaker"
              :options="speakerOptions"
              placeholder="选择音色"
            />
          </n-form-item>

          <!-- Speech Rate -->
          <n-form-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>语速</span>
                <span class="text-xs text-gray-400">({{ localVoiceConfig.speechRate }})</span>
              </div>
            </template>
            <n-slider
              v-model:value="localVoiceConfig.speechRate"
              :min="-50"
              :max="100"
              :step="5"
            />
          </n-form-item>

          <!-- Loudness Rate -->
          <n-form-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>音量</span>
                <span class="text-xs text-gray-400">({{ localVoiceConfig.loudnessRate }})</span>
              </div>
            </template>
            <n-slider
              v-model:value="localVoiceConfig.loudnessRate"
              :min="-50"
              :max="100"
              :step="5"
            />
          </n-form-item>

          <!-- Bot Name -->
          <n-form-item label="AI 名称">
            <n-input 
              v-model:value="localVoiceConfig.botName" 
              placeholder="AI 助手的名称"
              maxlength="20"
            />
          </n-form-item>

          <!-- System Role -->
          <n-form-item label="角色设定">
            <n-input 
              v-model:value="localVoiceConfig.systemRole" 
              type="textarea"
              placeholder="描述 AI 的角色背景"
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
          </n-form-item>

          <!-- Speaking Style -->
          <n-form-item label="说话风格">
            <n-input 
              v-model:value="localVoiceConfig.speakingStyle" 
              placeholder="描述 AI 的说话风格"
            />
          </n-form-item>

          <!-- Help link -->
          <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-2">
            <n-icon class="text-amber-500"><HelpCircleOutline /></n-icon>
            <span>获取凭证：</span>
            <a href="https://console.volcengine.com/speech/app" target="_blank" class="text-indigo-500 hover:underline">
              火山引擎控制台
            </a>
          </div>
        </n-form>
      </n-tab-pane>
    </n-tabs>

    <template #footer>
      <div class="flex justify-between">
        <n-space>
          <n-button v-if="currentTab === 'api'" @click="goToGetKey" tertiary>
            获取 Key
          </n-button>
          <n-button v-if="currentTab === 'api'" @click="testConnection" tertiary>
            <template #icon>
              <n-icon><FlashOutline /></n-icon>
            </template>
            测试连接
          </n-button>
        </n-space>
        <n-space>
          <n-button @click="emit('update:modelValue', false)">取消</n-button>
          <n-button type="primary" @click="saveSettings">保存</n-button>
        </n-space>
      </div>
    </template>
  </n-modal>
</template>
