/**
 * Audio Handler - 音频处理模块
 * 处理麦克风录音和音频播放
 */

// Audio configuration - 音频配置
const AUDIO_CONFIG = {
  input: {
    sampleRate: 16000,
    channelCount: 1,
    sampleSize: 16
  },
  output: {
    sampleRate: 24000,
    channelCount: 1
  }
}

/**
 * Audio Recorder - 音频录制器
 */
export class AudioRecorder {
  constructor() {
    this.audioContext = null
    this.mediaStream = null
    this.scriptProcessor = null
    this.isRecording = false
    this.audioBuffer = []
    this.onAudioData = null
    this.onError = null
  }

  /**
   * Initialize audio recorder - 初始化录音器
   */
  async init() {
    try {
      // Request microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_CONFIG.input.sampleRate,
          channelCount: AUDIO_CONFIG.input.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.input.sampleRate
      })
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      
      // Create script processor for audio processing
      // Buffer size: 2048 samples = 128ms at 16kHz, we want ~20ms chunks
      // Using 1024 = 64ms at 16kHz (1024 samples / 16000 Hz = 0.064s)
      // For 20ms chunks, we need 320 samples
      this.scriptProcessor = this.audioContext.createScriptProcessor(1024, 1, 1)
      
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return
        
        const inputData = event.inputBuffer.getChannelData(0)
        
        // Convert Float32 to Int16 PCM
        const pcmData = this._float32ToInt16(inputData)
        
        // Send audio data in ~20ms chunks (320 samples at 16kHz)
        this._sendInChunks(pcmData)
      }
      
      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext.destination)
      
      console.log('[AudioRecorder] Initialized successfully')
      return true
    } catch (error) {
      console.error('[AudioRecorder] Init failed:', error)
      this.onError?.({ error: '无法访问麦克风', detail: error.message })
      throw error
    }
  }

  /**
   * Convert Float32 to Int16 PCM
   * @param {Float32Array} float32Data - Float32 音频数据
   * @returns {Int16Array} Int16 PCM 数据
   */
  _float32ToInt16(float32Data) {
    const int16Data = new Int16Array(float32Data.length)
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]))
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return int16Data
  }

  /**
   * Send audio data in chunks - 分块发送音频数据
   * @param {Int16Array} pcmData - PCM 数据
   */
  _sendInChunks(pcmData) {
    // Target: 20ms chunks = 320 samples at 16kHz = 640 bytes
    const chunkSize = 320
    const bytes = new Uint8Array(pcmData.buffer)
    
    for (let i = 0; i < bytes.length; i += chunkSize * 2) {
      const chunk = bytes.slice(i, i + chunkSize * 2)
      if (chunk.length > 0) {
        this.onAudioData?.(chunk)
      }
    }
  }

  /**
   * Start recording - 开始录音
   */
  start() {
    if (this.isRecording) return
    this.isRecording = true
    this.audioBuffer = []
    
    // Resume audio context if suspended
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume()
    }
    
    console.log('[AudioRecorder] Recording started')
  }

  /**
   * Stop recording - 停止录音
   */
  stop() {
    this.isRecording = false
    console.log('[AudioRecorder] Recording stopped')
  }

  /**
   * Destroy recorder - 销毁录音器
   */
  destroy() {
    this.isRecording = false
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    
    console.log('[AudioRecorder] Destroyed')
  }

  /**
   * Get recording state - 获取录音状态
   */
  get isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  }
}

/**
 * Audio Player - 音频播放器
 */
export class AudioPlayer {
  constructor() {
    this.audioContext = null
    this.isPlaying = false
    this.audioQueue = []
    this.currentSource = null
    this.gainNode = null
    this.volume = 1.0
    this.playbackRate = 1.0
    this.onPlaybackEnded = null
    this.onPlaybackStarted = null
  }

  /**
   * Initialize audio player - 初始化播放器
   */
  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.output.sampleRate
      })
      
      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain()
      this.gainNode.connect(this.audioContext.destination)
      this.gainNode.gain.value = this.volume
      
      console.log('[AudioPlayer] Initialized successfully')
      return true
    } catch (error) {
      console.error('[AudioPlayer] Init failed:', error)
      throw error
    }
  }

  /**
   * Play PCM audio data - 播放 PCM 音频数据
   * @param {Uint8Array} audioData - PCM 音频数据 (16-bit, 24kHz, mono)
   */
  async play(audioData) {
    if (!this.audioContext) {
      await this.init()
    }
    
    // Resume context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    
    // Convert Int16 PCM to Float32 for Web Audio API
    const int16Data = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.byteLength / 2)
    const float32Data = new Float32Array(int16Data.length)
    
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7FFF)
    }
    
    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      1, // mono
      float32Data.length,
      AUDIO_CONFIG.output.sampleRate
    )
    
    audioBuffer.getChannelData(0).set(float32Data)
    
    // Create source and play
    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.playbackRate.value = this.playbackRate
    source.connect(this.gainNode)
    
    source.onended = () => {
      this.isPlaying = false
      this.currentSource = null
      
      // Play next in queue if any
      if (this.audioQueue.length > 0) {
        const next = this.audioQueue.shift()
        this.play(next)
      } else {
        this.onPlaybackEnded?.()
      }
    }
    
    this.currentSource = source
    this.isPlaying = true
    this.onPlaybackStarted?.()
    source.start(0)
  }

  /**
   * Queue audio data - 队列音频数据
   * @param {Uint8Array} audioData - PCM 音频数据
   */
  queue(audioData) {
    if (this.isPlaying) {
      this.audioQueue.push(audioData)
    } else {
      this.play(audioData)
    }
  }

  /**
   * Stop playback - 停止播放
   */
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.currentSource = null
    }
    this.isPlaying = false
    this.audioQueue = []
  }

  /**
   * Set volume - 设置音量
   * @param {number} volume - 音量 (0-1)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume
    }
  }

  /**
   * Set playback rate - 设置播放速度
   * @param {number} rate - 播放速度 (0.5-2.0)
   */
  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate))
    if (this.currentSource) {
      this.currentSource.playbackRate.value = this.playbackRate
    }
  }

  /**
   * Destroy player - 销毁播放器
   */
  destroy() {
    this.stop()
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    
    this.gainNode = null
    console.log('[AudioPlayer] Destroyed')
  }
}

/**
 * Ogg Opus Decoder - Ogg Opus 解码器
 * 用于解码服务端返回的默认 Ogg Opus 格式音频
 */
export class OpusDecoder {
  constructor() {
    this.decoder = null
    this.isReady = false
  }

  /**
   * Initialize decoder - 初始化解码器
   * Note: This requires opus-decoder library or WebCodecs API
   */
  async init() {
    // Check if WebCodecs API is available
    if ('VideoDecoder' in window || 'AudioDecoder' in window) {
      try {
        // Try using WebCodecs AudioDecoder
        console.log('[OpusDecoder] WebCodecs API available')
        this.isReady = true
        return true
      } catch (e) {
        console.warn('[OpusDecoder] WebCodecs init failed:', e)
      }
    }
    
    // Fallback: We'll request PCM format from server instead
    console.log('[OpusDecoder] Will request PCM format from server')
    this.isReady = false
    return false
  }

  /**
   * Decode Ogg Opus to PCM - 解码 Ogg Opus 到 PCM
   * @param {Uint8Array} oggData - Ogg Opus 数据
   * @returns {Promise<Uint8Array>} PCM 数据
   */
  async decode(oggData) {
    // For now, this is a placeholder
    // The server will be configured to return PCM format instead
    console.warn('[OpusDecoder] Native Opus decoding not implemented')
    return oggData
  }
}

/**
 * Create audio worklet for better performance - 创建 AudioWorklet 以获得更好性能
 * @param {AudioContext} audioContext - 音频上下文
 * @param {string} workletUrl - Worklet URL
 */
export async function createAudioWorklet(audioContext, workletUrl) {
  try {
    await audioContext.audioWorklet.addModule(workletUrl)
    return true
  } catch (error) {
    console.warn('[AudioHandler] AudioWorklet not available:', error)
    return false
  }
}

/**
 * Check audio support - 检查音频支持
 */
export function checkAudioSupport() {
  return {
    mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    audioContext: !!(window.AudioContext || window.webkitAudioContext),
    webAudio: !!window.AudioWorkletNode,
    webCodecs: !!window.AudioDecoder
  }
}
