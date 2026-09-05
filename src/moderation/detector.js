// Rastreia mensagens por utilizador para detectar flood
const messageTracker = new Map()

const LINK_REGEX = /https?:\/\/|www\.|bit\.ly|t\.me|wa\.me/i
const FLOOD_LIMIT = 5      // mensagens
const FLOOD_WINDOW = 5000  // em ms

export function detectLink(text) {
  return LINK_REGEX.test(text)
}

export function detectFlood(senderId) {
  const now = Date.now()
  const tracker = messageTracker.get(senderId) || []
  const recent = tracker.filter(t => now - t < FLOOD_WINDOW)
  recent.push(now)
  messageTracker.set(senderId, recent)
  return recent.length >= FLOOD_LIMIT
}

export function detectSpam(text) {
  if (!text) return false
  const upper = (text.match(/[A-Z]/g) || []).length
  const ratio = upper / text.length
  const repeated = /(.)\1{6,}/.test(text)
  const tooManyEmojis = (text.match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length > 10
  return ratio > 0.7 || repeated || tooManyEmojis
}
