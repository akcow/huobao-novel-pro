/**
 * Voice Proxy Server - 语音代理服务器
 * 用于转发 WebSocket 连接，解决浏览器无法设置自定义 headers 的问题
 * 
 * 使用方法：
 * 1. 运行: node voice-proxy-server.js
 * 2. 服务器将在 ws://localhost:3100 启动
 */

import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'

// 配置
const PORT = 3100
const TARGET_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-App-ID, X-Api-Access-Key, X-Api-Resource-Id, X-Api-App-Key')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    return
  }
  
  res.writeHead(404)
  res.end('Not Found')
})

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server })

// 存储活跃的连接
const activeConnections = new Map()

wss.on('connection', (clientWs, req) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`)
  
  // 从 URL 参数获取认证信息
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const appId = url.searchParams.get('appId')
  const accessKey = url.searchParams.get('accessKey')
  
  console.log(`[${clientId}] App ID: ${appId?.substring(0, 8)}...`)
  
  if (!appId || !accessKey) {
    console.error(`[${clientId}] Missing appId or accessKey`)
    clientWs.close(4001, 'Missing appId or accessKey')
    return
  }
  
  // 消息缓存队列 - 在目标服务器连接前缓存客户端消息
  const messageQueue = []
  let targetReady = false
  
  // 连接到目标服务器
  console.log(`[${clientId}] Connecting to target server...`)
  const targetWs = new WebSocket(TARGET_URL, {
    headers: {
      'X-Api-App-ID': appId,
      'X-Api-Access-Key': accessKey,
      'X-Api-Resource-Id': 'volc.speech.dialog',
      'X-Api-App-Key': 'PlgvMymc7f3tQnJ6'
    }
  })
  
  targetWs.binaryType = 'arraybuffer'
  
  // 存储连接
  activeConnections.set(clientId, { clientWs, targetWs })
  
  // 目标服务器打开
  targetWs.on('open', () => {
    console.log(`[${clientId}] Target server connected`)
    targetReady = true
    
    // 发送缓存的消息
    while (messageQueue.length > 0) {
      const data = messageQueue.shift()
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(data)
        console.log(`[${clientId}] Sent queued message: ${data.byteLength || data.length} bytes`)
      }
    }
  })
  
  // 目标服务器消息转发到客户端
  targetWs.on('message', (data) => {
    console.log(`[${clientId}] Received from target: ${data.byteLength} bytes`)
    // 打印前几个字节用于调试
    const bytes = new Uint8Array(data)
    console.log(`[${clientId}] First bytes: [${bytes.slice(0, 20).join(', ')}]`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data)
      console.log(`[${clientId}] Forwarded to client`)
    }
  })
  
  // 目标服务器错误
  targetWs.on('error', (error) => {
    console.error(`[${clientId}] Target server error:`, error.message)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Target server error')
    }
  })
  
  // 目标服务器关闭
  targetWs.on('close', (code, reason) => {
    console.log(`[${clientId}] Target server closed: ${code}`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason)
    }
    activeConnections.delete(clientId)
  })
  
  // 客户端消息转发到目标服务器
  clientWs.on('message', (data) => {
    console.log(`[${clientId}] Received from client: ${data.byteLength || data.length} bytes`)
    
    if (targetReady && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(data)
      console.log(`[${clientId}] Forwarded to target server`)
    } else {
      // 缓存消息等待目标服务器连接
      messageQueue.push(data)
      console.log(`[${clientId}] Queued message (target not ready, queue size: ${messageQueue.length})`)
    }
  })
  
  // 客户端错误
  clientWs.on('error', (error) => {
    console.error(`[${clientId}] Client error:`, error.message)
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close()
    }
    activeConnections.delete(clientId)
  })
  
  // 客户端关闭
  clientWs.on('close', (code, reason) => {
    console.log(`[${clientId}] Client closed: ${code}`)
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close()
    }
    activeConnections.delete(clientId)
  })
})

// 启动服务器
server.listen(PORT, () => {
  console.log('='.repeat(50))
  console.log('Voice Proxy Server Started')
  console.log('='.repeat(50))
  console.log(`Local WebSocket: ws://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log('')
  console.log('Usage: ws://localhost:3100?appId=YOUR_APP_ID&accessKey=YOUR_ACCESS_KEY')
  console.log('='.repeat(50))
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  
  // 关闭所有连接
  for (const [id, { clientWs, targetWs }] of activeConnections) {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
    if (targetWs.readyState === WebSocket.OPEN) targetWs.close()
  }
  
  wss.close(() => {
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
})

export { server, wss }