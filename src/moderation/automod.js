import { detectLink, detectFlood, detectSpam, isQuietHours } from './detector.js'
import { addWarning, getGroupConfig, ensureGroup, addLog } from './warnings.js'
import { penalizePoints } from './reputation.js'
import { notifyAdmins, getMentionText, resolveJid } from '../utils/notify.js'
import logger from '../core/logger.js'
import config from '../../config/index.js'
import supabase from '../core/database.js'

export async function autoModerate(sock, msg, meta = null) {
  const groupId = msg.key.remoteJid
  if (!groupId?.endsWith('@g.us')) return false

  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  const sender = msg.key.participant || ''
  const senderNum = sender.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]

  if (senderNum === config.owner || senderNum === config.ownerLid) return false

  if (!meta) {
    try { meta = await sock.groupMetadata(groupId) } catch { return false }
  }

  await ensureGroup(groupId, meta?.subject || groupId)
  const groupCfg = await getGroupConfig(groupId)
  if (!groupCfg) return false

  const admins = meta.participants.filter(p => p.admin).map(p =>
    p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  )
  if (admins.includes(senderNum)) return false

  let reason = null
  if (groupCfg.anti_link_enabled && detectLink(body, groupCfg.link_whitelist)) reason = 'link proibido'
  else if (groupCfg.anti_spam_enabled && detectSpam(body)) reason = 'spam detectado'
  else if (groupCfg.anti_flood_enabled && detectFlood(sender)) reason = 'flood detectado'

  if (!reason) return false

  try { await sock.sendMessage(groupId, { delete: msg.key }) } catch {}

  const total = await addWarning(groupId, senderNum, reason)
  const limit = groupCfg.warnings_limit || 3

  await addLog(groupId, senderNum, 'automod', `${reason} — aviso ${total}/${limit}`)
  if (groupCfg.reputation_enabled) await penalizePoints(groupId, senderNum, 20)

  if (total >= limit) {
    const participant = meta?.participants?.find(p =>
      p.id.replace('@s.whatsapp.net','').replace('@lid','').split(':')[0] === senderNum
    )
    const phoneNum = participant?.phoneNumber || senderNum
    await supabase.from('banned_users').insert({
      group_id: groupId, user_id: phoneNum, user_jid: sender,
      reason: `automod: ${reason}`, banned_by: 'automod'
    })
    await sock.groupParticipantsUpdate(groupId, [sender], 'remove')
    await sock.sendMessage(groupId, {
      text: `🔨 ${getMentionText(sender, meta)} foi removido após ${total} avisos.`,
      mentions: [resolveJid(sender, meta)]
    })
    await notifyAdmins(sock, meta,
      `🔨 *Remoção automática — ${meta?.subject}*\n\n*${senderNum}* removido por: _${reason}_`
    )
    logger.info(`${senderNum} removido de ${groupId} — ${reason}`)
  } else {
    await sock.sendMessage(groupId, {
      text: `⚠️ ${getMentionText(sender, meta)} — *${reason}*\nAviso ${total}/${limit}.`,
      mentions: [resolveJid(sender, meta)]
    })
  }

  return true
}
