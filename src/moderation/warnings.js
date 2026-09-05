import supabase from '../core/database.js'
import logger from '../core/logger.js'

const warningCache = new Map()
const muteTimers = new Map()

export async function getWarnings(groupId, userId) {
  const key = `${groupId}:${userId}`
  if (warningCache.has(key)) return warningCache.get(key)
  const { data } = await supabase.from('warnings').select('id').eq('group_id', groupId).eq('user_id', userId)
  const count = data?.length || 0
  warningCache.set(key, count)
  return count
}

export async function addWarning(groupId, userId, reason) {
  await supabase.from('warnings').insert({ group_id: groupId, user_id: userId, reason })
  const key = `${groupId}:${userId}`
  const current = warningCache.get(key) || 0
  warningCache.set(key, current + 1)
  logger.info(`Warning: ${userId} em ${groupId} — ${reason}`)
  return current + 1
}

export async function clearWarnings(groupId, userId) {
  await supabase.from('warnings').delete().eq('group_id', groupId).eq('user_id', userId)
  warningCache.delete(`${groupId}:${userId}`)
}

export function setMuteTimer(groupId, userId, durationMs, callback) {
  const key = `${groupId}:${userId}`
  if (muteTimers.has(key)) clearTimeout(muteTimers.get(key))
  const timer = setTimeout(() => {
    muteTimers.delete(key)
    callback()
  }, durationMs)
  muteTimers.set(key, timer)
}

export function clearMuteTimer(groupId, userId) {
  const key = `${groupId}:${userId}`
  if (muteTimers.has(key)) {
    clearTimeout(muteTimers.get(key))
    muteTimers.delete(key)
  }
}

export async function getGroupConfig(groupId) {
  const { data } = await supabase.from('groups').select('*').eq('whatsapp_group_id', groupId).single()
  return data
}

export async function ensureGroup(groupId, name) {
  const { data } = await supabase.from('groups').select('id').eq('whatsapp_group_id', groupId).single()
  if (!data) {
    await supabase.from('groups').insert({
      whatsapp_group_id: groupId,
      name,
      anti_spam_enabled: true,
      anti_link_enabled: true,
      anti_flood_enabled: true,
      welcome_enabled: true,
      warnings_limit: 3,
    })
    logger.info(`Grupo registado: ${name}`)
  }
}

export async function setGroupData(groupId, updates) {
  await supabase.from('groups').update(updates).eq('whatsapp_group_id', groupId)
}

export async function addLog(groupId, userId, action, detail = '') {
  await supabase.from('logs').insert({ group_id: groupId, user_id: userId, action, detail })
}
