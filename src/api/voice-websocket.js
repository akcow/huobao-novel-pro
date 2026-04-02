/**
 * Voice WebSocket Client - 语音 WebSocket 客户端
 * 实现豆包端到端实时语音大模型 API 的 WebSocket 连接和二进制协议处理
 */

// WebSocket URL
const WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'

// Local proxy server URL (for browser compatibility)
const LOCAL_PROXY_URL = 'ws://localhost:3100'

// Whether to use local proxy
const USE_PROXY = true

// Event IDs - 事件ID
const EVENT_IDS = {
  // Client events - 客户端事件
  StartConnection: 1,
  FinishConnection: 2,
  StartSession: 100,
  FinishSession: 102,
  TaskRequest: 200,
  UpdateConfig: 201,
  SayHello: 300,
  EndASR: 400,
  ChatTTSText: 500,
  ChatTextQuery: 501,
  ChatRAGText: 502,
  ConversationCreate: 510,
  ConversationUpdate: 511,
  ConversationRetrieve: 512,
  ConversationTruncate: 513,
  ConversationDelete: 514,
  ClientInterrupt: 515,
  
  // Server events - 服务端事件
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  UsageResponse: 154,
  ConfigUpdated: 251,
  TTSSentenceStart: 350,
  TTSSentenceEnd: 351,
  TTSResponse: 352,
  TTSEnded: 359,
  ASRInfo: 450,
  ASRResponse: 451,
  ASREnded: 459,
  ChatResponse: 550,
  ChatTextQueryConfirmed: 553,
  ChatEnded: 559,
  ConversationCreated: 567,
  ConversationUpdated: 568,
  ConversationRetrieved: 569,
  ConversationTruncated: 570,
  ConversationDeleted: 571,
  DialogCommonError: 599
}

// Message Types - 消息类型
const MESSAGE_TYPES = {
  FullClientRequest: 0b0001,      // 客户端文本事件
  FullServerResponse: 0b1001,     // 服务端文本事件
  AudioOnlyRequest: 0b0010,       // 客户端音频数据
  AudioOnlyResponse: 0b1011,      // 服务端音频数据
  Error: 0b1111                   // 错误信息
}

/**
 * Build binary frame - 构建二进制帧
 * @param {number} messageType - 消息类型
 * @param {number} eventId - 事件ID
 * @param {string} sessionId - 会话ID
 * @param {Object|string} payload - 负载数据
 * @returns {Uint8Array} 二进制帧
 */
function buildFrame(messageType, eventId, sessionId, payload) {
  const isAudio = messageType === MESSAGE_TYPES.AudioOnlyRequest
  const payloadData = typeof payload === 'string' 
    ? new TextEncoder().encode(payload)
    : (payload instanceof Uint8Array ? payload : new TextEncoder().encode(JSON.stringify(payload)))
  
  // Build optional fields
  const optionalParts = []
  
  // Event ID (4 bytes)
  const eventIdBuffer = new ArrayBuffer(4)
  new DataView(eventIdBuffer).setUint32(0, eventId, false)
  optionalParts.push(new Uint8Array(eventIdBuffer))
  
  // Session ID (only for session-level events)
  if (sessionId && eventId >= 100) {
    const sessionIdBytes = new TextEncoder().encode(sessionId)
    const sessionIdSizeBuffer = new ArrayBuffer(4)
    new DataView(sessionIdSizeBuffer).setUint32(0, sessionIdBytes.length, false)
    optionalParts.push(new Uint8Array(sessionIdSizeBuffer))
    optionalParts.push(sessionIdBytes)
  }
  
  // Calculate sizes
  const optionalSize = optionalParts.reduce((sum, arr) => sum + arr.length, 0)
  const payloadSize = payloadData.length
  
  // Build header (4 bytes)
  const header = new Uint8Array(4)
  // Byte 0: Protocol Version (4 bits) + Header Size (4 bits)
  header[0] = 0b00010001  // v1, header size 1 (4 bytes)
  
  // Byte 1: Message Type (4 bits) + Message Type Specific Flags (4 bits)
  // Flags: 0b0100 = event field present
  header[1] = (messageType << 4) | 0b0100
  
  // Byte 2: Serialization Method (4 bits) + Compression Method (4 bits)
  // 0b0000 = Raw for audio, 0b0001 = JSON for text
  header[2] = isAudio ? 0b00000000 : 0b00010000
  
  // Byte 3: Reserved
  header[3] = 0x00
  
  // Build payload size (4 bytes)
  const payloadSizeBuffer = new ArrayBuffer(4)
  new DataView(payloadSizeBuffer).setUint32(0, payloadSize, false)
  const payloadSizeArray = new Uint8Array(payloadSizeBuffer)
  
  // Combine all parts
  const totalSize = header.length + optionalSize + payloadSizeArray.length + payloadSize
  const frame = new Uint8Array(totalSize)
  
  let offset = 0
  frame.set(header, offset)
  offset += header.length
  
  for (const part of optionalParts) {
    frame.set(part, offset)
    offset += part.length
  }
  
  frame.set(payloadSizeArray, offset)
  offset += payloadSizeArray.length
  
  frame.set(payloadData, offset)
  
  return frame
}

/**
 * Parse binary frame - 解析二进制帧
 * @param {ArrayBuffer} data - 二进制数据
 * @returns {Object} 解析结果 { messageType, eventId, sessionId, payload }
 */
function parseFrame(data) {
  const view = new DataView(data)
  const bytes = new Uint8Array(data)
  
  // Parse header
  const headerSize = bytes[0] & 0x0F
  const messageType = (bytes[1] >> 4) & 0x0F
  const flags = bytes[1] & 0x0F
  const serialization = (bytes[2] >> 4) & 0x0F
  
  let offset = headerSize * 4  // Header size is in 4-byte units
  
  // Parse optional fields based on flags
  let eventId = 0
  let sessionId = null
  let errorCode = null
  
  // Check for error code
  if (messageType === MESSAGE_TYPES.Error) {
    errorCode = view.getInt32(offset, false)
    offset += 4
  }
  
  // Check for sequence (we don't use it)
  const sequenceFlag = flags & 0b0011
  if (sequenceFlag === 0b0001 || sequenceFlag === 0b0011) {
    offset += 4  // Skip sequence
  }
  
  // Check for event ID
  if (flags & 0b0100) {
    eventId = view.getInt32(offset, false)
    offset += 4
  }
  
  // Parse session ID for session-level events
  if (eventId >= 100) {
    const sessionIdSize = view.getInt32(offset, false)
    offset += 4
    if (sessionIdSize > 0) {
      sessionId = new TextDecoder().decode(bytes.slice(offset, offset + sessionIdSize))
      offset += sessionIdSize
    }
  }
  
  // Parse payload size and payload
  const payloadSize = view.getInt32(offset, false)
  offset += 4
  
  let payload = null
  if (payloadSize > 0) {
    const payloadData = bytes.slice(offset, offset + payloadSize)
    
    if (messageType === MESSAGE_TYPES.AudioOnlyResponse) {
      // Audio data
      payload = payloadData
    } else if (serialization === 0b0001) {
      // JSON data
      try {
        const jsonStr = new TextDecoder().decode(payloadData)
        payload = JSON.parse(jsonStr)
      } catch (e) {
        payload = new TextDecoder().decode(payloadData)
      }
    } else {
      // Raw data
      payload = payloadData
    }
  }
  
  return {
    messageType,
    eventId,
    sessionId,
    errorCode,
    payload
  }
}

/**
 * Generate UUID - 生成 UUID
 * @returns {string} UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Voice WebSocket Client - 语音 WebSocket 客户端类
 */
export class VoiceWebSocketClient {
  constructor(config) {
    this.config = config
    this.ws = null
    this.sessionId = null
    this.connectId = null
    this.isConnected = false
    this.isSessionActive = false
    this.dialogId = null
    
    // Callbacks
    this.onConnectionStarted = null
    this.onConnectionFailed = null
    this.onSessionStarted = null
    this.onSessionFailed = null
    this.onASRText = null           // 用户说话识别结果
    this.onASREnded = null          // 用户说话结束
    this.onChatResponse = null      // AI 文本回复
    this.onTTSAudio = null          // AI 音频数据
    this.onTTSSentenceStart = null  // TTS 句子开始
    this.onTTSEnded = null          // TTS 结束
    this.onError = null
    this.onDisconnected = null
  }

  /**
   * Connect to WebSocket - 连接 WebSocket
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_URL)
        this.ws.binaryType = 'arraybuffer'
        
        // Set headers via URL params (browser WebSocket doesn't support custom headers)
        // We need to use query parameters or handle auth differently
        const url = new URL(WS_URL)
        
        this.ws.onopen = () => {
          console.log('[VoiceWS] WebSocket connected')
          // Send StartConnection event
          this._sendStartConnection()
        }
        
        this.ws.onmessage = (event) => {
          this._handleMessage(event.data)
        }
        
        this.ws.onerror = (error) => {
          console.error('[VoiceWS] WebSocket error:', error)
          this.onError?.({ error: 'WebSocket连接错误' })
          reject(error)
        }
        
        this.ws.onclose = () => {
          console.log('[VoiceWS] WebSocket closed')
          this.isConnected = false
          this.isSessionActive = false
          this.onDisconnected?.()
        }
        
        // Wait for ConnectionStarted event
        this._connectionResolver = resolve
        this._connectionRejector = reject
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Connect with headers - 带认证头的连接方法
   * Note: Browser WebSocket doesn't support custom headers, so we use a local proxy
   * @returns {Promise<void>}
   */
  async connectWithAuth() {
    return new Promise((resolve, reject) => {
      try {
        // Build URL with auth parameters
        // Use local proxy server for browser compatibility
        const wsUrl = USE_PROXY 
          ? `${LOCAL_PROXY_URL}?appId=${encodeURIComponent(this.config.appId)}&accessKey=${encodeURIComponent(this.config.accessKey)}`
          : WS_URL
        
        console.log('[VoiceWS] Connecting to:', USE_PROXY ? 'local proxy' : 'direct')
        console.log('[VoiceWS] App ID:', this.config.appId)
        
        this.ws = new WebSocket(wsUrl)
        this.ws.binaryType = 'arraybuffer'
        
        this.ws.onopen = () => {
          console.log('[VoiceWS] WebSocket connected, sending StartConnection...')
          // Send StartConnection event
          this._sendStartConnection()
        }
        
        this.ws.onmessage = (event) => {
          this._handleMessage(event.data)
        }
        
        this.ws.onerror = (error) => {
          console.error('[VoiceWS] WebSocket error:', error)
          const errorMsg = USE_PROXY 
            ? 'WebSocket连接错误，请确保代理服务器已启动 (运行: node voice-proxy-server.js)'
            : 'WebSocket连接错误，请检查网络和API配置'
          this.onError?.({ error: errorMsg })
          reject(new Error(errorMsg))
        }
        
        this.ws.onclose = (event) => {
          console.log('[VoiceWS] WebSocket closed:', event.code, event.reason)
          this.isConnected = false
          this.isSessionActive = false
          this.onDisconnected?.()
        }
        
        this._connectionResolver = resolve
        this._connectionRejector = reject
        
        // Timeout for connection
        setTimeout(() => {
          if (!this.isConnected) {
            const timeoutMsg = USE_PROXY
              ? '连接超时，请检查 App ID 和 Access Token 是否正确'
              : '连接超时'
            reject(new Error(timeoutMsg))
          }
        }, 20000)
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Send StartConnection event - 发送开始连接事件
   */
  _sendStartConnection() {
    this.connectId = generateUUID()
    const frame = buildFrame(
      MESSAGE_TYPES.FullClientRequest,
      EVENT_IDS.StartConnection,
      null,
      {}
    )
    this.ws.send(frame)
  }

  /**
   * Start session - 开始会话
   * @param {Object} options - 会话选项
   */
  async startSession(options = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接')
    }
    
    this.sessionId = generateUUID()
    
    const payload = {
      tts: {
        speaker: this.config.speaker || 'zh_female_vv_jupiter_bigtts',
        audio_config: {
          channel: 1,
          format: 'pcm',
          sample_rate: 24000
        }
      },
      asr: {
        audio_info: {
          format: 'pcm',
          sample_rate: 16000,
          channel: 1
        },
        extra: {
          end_smooth_window_ms: 1500,
          enable_custom_vad: false
        }
      },
      dialog: {
        bot_name: this.config.botName || 'AI编辑',
        system_role: this.config.systemRole || '你是一位专业的小说编辑助手。',
        speaking_style: this.config.speakingStyle || '专业、友好',
        dialog_id: this.dialogId || '',
        extra: {
          model: this.config.model || '1.2.1.1',
          input_mod: 'push_to_talk'
        }
      }
    }
    
    // Apply speech rate and loudness
    if (this.config.speechRate !== undefined) {
      payload.tts.audio_config.speech_rate = this.config.speechRate
    }
    if (this.config.loudnessRate !== undefined) {
      payload.tts.audio_config.loudness_rate = this.config.loudnessRate
    }
    
    // Merge with provided options
    Object.assign(payload.dialog, options)
    
    const frame = buildFrame(
      MESSAGE_TYPES.FullClientRequest,
      EVENT_IDS.StartSession,
      this.sessionId,
      payload
    )
    
    return new Promise((resolve, reject) => {
      this._sessionResolver = resolve
      this._sessionRejector = reject
      this.ws.send(frame)
      
      // Timeout
      setTimeout(() => {
        if (!this.isSessionActive) {
          reject(new Error('会话启动超时'))
        }
      }, 10000)
    })
  }

  /**
   * Send audio data - 发送音频数据
   * @param {Uint8Array} audioData - PCM 音频数据
   */
  sendAudio(audioData) {
    if (!this.isSessionActive) {
      console.warn('[VoiceWS] Session not active, cannot send audio')
      return
    }
    
    const frame = buildFrame(
      MESSAGE_TYPES.AudioOnlyRequest,
      EVENT_IDS.TaskRequest,
      this.sessionId,
      audioData
    )
    this.ws.send(frame)
  }

  /**
   * End ASR (for push-to-talk mode) - 结束语音识别
   */
  endASR() {
    if (!this.isSessionActive) return
    
    const frame = buildFrame(
      MESSAGE_TYPES.FullClientRequest,
      EVENT_IDS.EndASR,
      this.sessionId,
      {}
    )
    this.ws.send(frame)
  }

  /**
   * Send text query - 发送文本消息
   * @param {string} text - 文本内容
   */
  sendTextQuery(text) {
    if (!this.isSessionActive) {
      console.warn('[VoiceWS] Session not active')
      return
    }
    
    const frame = buildFrame(
      MESSAGE_TYPES.FullClientRequest,
      EVENT_IDS.ChatTextQuery,
      this.sessionId,
      { content: text }
    )
    this.ws.send(frame)
  }

  /**
   * Finish session - 结束会话
   */
  finishSession() {
    if (!this.isSessionActive) return
    
    const frame = buildFrame(
      MESSAGE_TYPES.FullClientRequest,
      EVENT_IDS.FinishSession,
      this.sessionId,
      {}
    )
    this.ws.send(frame)
    this.isSessionActive = false
  }

  /**
   * Disconnect - 断开连接
   */
  disconnect() {
    if (this.isSessionActive) {
      this.finishSession()
    }
    
    if (this.ws) {
      const frame = buildFrame(
        MESSAGE_TYPES.FullClientRequest,
        EVENT_IDS.FinishConnection,
        null,
        {}
      )
      this.ws.send(frame)
      setTimeout(() => {
        this.ws?.close()
        this.ws = null
      }, 100)
    }
    
    this.isConnected = false
    this.isSessionActive = false
  }

  /**
   * Handle incoming message - 处理接收到的消息
   * @param {ArrayBuffer} data - 二进制数据
   */
  _handleMessage(data) {
    try {
      const frame = parseFrame(data)
      const bytes = new Uint8Array(data)
      console.log('[VoiceWS] Raw bytes:', Array.from(bytes.slice(0, 20)))
      console.log('[VoiceWS] Parsed frame:', JSON.stringify(frame))
      console.log('[VoiceWS] Received event:', frame.eventId, 'sessionId:', frame.sessionId)
      
      switch (frame.eventId) {
        case EVENT_IDS.ConnectionStarted:
          console.log('[VoiceWS] Connection started - setting isConnected = true')
          this.isConnected = true
          this._connectionResolver?.()
          this.onConnectionStarted?.()
          break
          
        case EVENT_IDS.ConnectionFailed:
          console.error('[VoiceWS] Connection failed:', frame.payload)
          this._connectionRejector?.(new Error(frame.payload?.error || '连接失败'))
          this.onError?.(frame.payload)
          break
          
        case EVENT_IDS.SessionStarted:
          console.log('[VoiceWS] Session started, dialog_id:', frame.payload?.dialog_id)
          this.isSessionActive = true
          if (frame.payload?.dialog_id) {
            this.dialogId = frame.payload.dialog_id
          }
          this._sessionResolver?.(frame.payload)
          this.onSessionStarted?.(frame.payload)
          break
          
        case EVENT_IDS.SessionFailed:
          console.error('[VoiceWS] Session failed:', frame.payload)
          this._sessionRejector?.(new Error(frame.payload?.error || '会话失败'))
          this.onSessionFailed?.(frame.payload)
          break
          
        case EVENT_IDS.ASRInfo:
          console.log('[VoiceWS] ASR started')
          break
          
        case EVENT_IDS.ASRResponse:
          // User speech recognition result
          const asrResult = frame.payload?.results?.[0]
          if (asrResult) {
            this.onASRText?.({
              text: asrResult.text,
              isInterim: asrResult.is_interim
            })
          }
          break
          
        case EVENT_IDS.ASREnded:
          console.log('[VoiceWS] ASR ended')
          this.onASREnded?.()
          break
          
        case EVENT_IDS.ChatResponse:
          // AI text response
          console.log('[VoiceWS] ChatResponse payload:', JSON.stringify(frame.payload))
          this.onChatResponse?.({
            content: frame.payload?.content,
            questionId: frame.payload?.question_id,
            replyId: frame.payload?.reply_id
          })
          break
          
        case EVENT_IDS.TTSSentenceStart:
          console.log('[VoiceWS] TTSSentenceStart payload:', JSON.stringify(frame.payload))
          this.onTTSSentenceStart?.({
            text: frame.payload?.text,
            questionId: frame.payload?.question_id,
            replyId: frame.payload?.reply_id,
            ttsType: frame.payload?.tts_type
          })
          break
          
        case EVENT_IDS.TTSResponse:
          // AI audio data
          this.onTTSAudio?.({
            audioData: frame.payload,
            sessionId: frame.sessionId
          })
          break
          
        case EVENT_IDS.TTSEnded:
          console.log('[VoiceWS] TTS ended')
          this.onTTSEnded?.({
            questionId: frame.payload?.question_id,
            replyId: frame.payload?.reply_id,
            statusCode: frame.payload?.status_code
          })
          break
          
        case EVENT_IDS.DialogCommonError:
          console.error('[VoiceWS] Dialog error:', frame.payload)
          this.onError?.(frame.payload)
          break
          
        default:
          console.log('[VoiceWS] Unhandled event:', frame.eventId, frame.payload)
      }
    } catch (error) {
      console.error('[VoiceWS] Error parsing message:', error)
    }
  }
}

// Export constants
export { EVENT_IDS, MESSAGE_TYPES }
