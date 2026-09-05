const messageTracker = new Map()

const LINK_REGEX = /https?:\/\/|www\.|bit\.ly|t\.me|wa\.me/i
const FLOOD_LIMIT = 5
const FLOOD_WINDOW = 5000

export function detectLink(text, whitelist = []) {
  if (!LINK_REGEX.test(text)) return false
  if (!whitelist?.length) return true
  // Permitir se o link contém algum domínio da whitelist
  return !whitelist.some(domain => text.toLowerCase().includes(domain.toLowerCase()))
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
  const repeated = /(.)\\1{6,}/.test(text)
  const tooManyEmojis = (text.match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length > 10
  return ratio > 0.7 || repeated || tooManyEmojis
}

export function isQuietHours(groupCfg) {
  if (!groupCfg?.quiet_hours_start == null || groupCfg?.quiet_hours_end == null) return false
  const hour = new Date().getHours()
  const start = groupCfg.quiet_hours_start
  const end = groupCfg.quiet_hours_end
  if (start <= end) return hour >= start && hour < end
  // Passa meia-noite (ex: 22h-6h)
  return hour >= start || hour < end
}
