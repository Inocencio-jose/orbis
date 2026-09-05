import { ensureGroup, addLog, getGroupConfig } from '../moderation/warnings.js'
import { getMentionText, resolveJid } from '../utils/notify.js'
import logger from '../core/logger.js'

export async function handleGroupEvents(sock, events) {
  for (const event of events) {
    const { id: groupId, participants, action } = event

    let meta = null
    try { meta = await sock.groupMetadata(groupId) } catch {}

    await ensureGroup(groupId, meta?.subject || groupId)

    if (action === 'add') {
      for (const participant of participants) {
        const jid = typeof participant === 'string' ? participant : participant.id || participant
        const groupConfig = await getGroupConfig(groupId)
        const mention = getMentionText(jid, meta)

        if (groupConfig?.welcome_enabled !== false) {
          const welcomeMsg = groupConfig?.welcome_message
            ? groupConfig.welcome_message
                .replace('{nome}', mention)
                .replace('{grupo}', meta?.subject || 'grupo')
            : `👋 Bem-vindo(a), ${mention}!\n\nEstás agora no grupo. Consulta as regras com */regras* 📜`
          await sock.sendMessage(groupId, { text: welcomeMsg, mentions: [resolveJid(jid, meta)] })
        }

        await addLog(groupId, jid.split('@')[0], 'join', '')
        logger.info(`Novo membro: ${jid} entrou em ${groupId}`)
      }
    }

    if (action === 'remove') {
      for (const participant of participants) {
        const jid = typeof participant === 'string' ? participant : participant.id || participant
        await addLog(groupId, jid.split('@')[0], 'leave', '')
        logger.info(`Membro saiu: ${jid} de ${groupId}`)
      }
    }
  }
}
