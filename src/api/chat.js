import { chatCompletion, cleanResponse } from './llm'
import { interviewPrompts } from '../prompts'

const { interviewSystem, chatSummary } = interviewPrompts

/**
 * Story Chat API - 故事对话 API
 * Handles multi-turn conversation with AI for story creation
 */

/**
 * Send a chat message in the story conversation
 * 发送故事对话消息
 * 
 * @param {Array} history - 历史消息 [{role: 'user'|'assistant', content: string}]
 * @param {string} userMessage - 用户输入
 * @param {Object} apiConfig - API 配置
 * @param {Function} onStream - 流式回调 => void
 * @returns {Promise<string>} AI 响应内容
 */
export async function sendStoryChatMessage(history, userMessage, apiConfig, onStream = null) {
  const systemPrompt = interviewSystem()
  
  // Build messages array with system prompt - 构建包含系统提示词的消息数组
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage }
  ]
  
  return await chatCompletion(apiConfig, messages, onStream)
}

/**
 * Summarize chat conversation into structured story settings
 * 将对话整理成结构化的小说设定
 * 
 * @param {Array} chatMessages - 对话消息列表
 * @param {Object} apiConfig - API 配置
 * @returns {Promise<string>} 结构化的故事设定
 */
export async function summarizeChatToSettings(chatMessages, apiConfig) {
  const prompt = chatSummary(chatMessages)
  return cleanResponse(await chatCompletion(apiConfig, prompt))
}

/**
 * Parse summarized settings into project fields
 * 将整理后的设定解析为项目字段
 * 
 * @param {string} summaryText - 结构化的设定文本
 * @returns {Object} 解析后的字段对象
 */
export function parseSettingsToFields(summaryText) {
  const fields = {}
  
  const mappings = [
    { key: 'genre', patterns: ['故事题材和类型', '题材类型', '类型'] },
    { key: 'topic', patterns: ['故事核心主题', '核心主题', '主题'] },
    { key: 'coreSeed', patterns: ['主角设定', '主角'] },
    { key: 'characterDynamics', patterns: ['配角', '重要配角'] },
    { key: 'worldBuilding', patterns: ['世界观'] },
    { key: 'plotArchitecture', patterns: ['高潮', '关键转折', '情节'] }
  ]
  
  // Simple extraction - each section until next number or end
  const sectionPattern = /\d+\.\s*([^：\n]+)[：:]\s*([\s\S]*?)(?=\n\d+\.|$)/g
  let match
  
  while ((match = sectionPattern.exec(summaryText)) !== null) {
    const title = match[1].trim()
    const content = match[2].trim()
    
    for (const { key, patterns } of mappings) {
      if (patterns.some(p => title.includes(p))) {
        if (fields[key]) {
          fields[key] += '\n\n' + content
        } else {
          fields[key] = content
        }
        break
      }
    }
  }
  
  return fields
}
