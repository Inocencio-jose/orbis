import { registerCommand } from './index.js'
import supabase from '../core/database.js'
import { notifyAdmins, getName } from '../utils/notify.js'

registerCommand('denunciar', { description: 'Denunciar uma mensagem', permission: 'member' }, async ({ sock, msg, groupId, groupMeta, sender }) => {
  const context = msg.message?.extendedTextMessage?.contextInfo
  if (!context?.quotedMessage) {
    return sock.sendMessage(groupId, { text: '❌ Responde à mensagem que queres denunciar com */denunciar*' })
  }

  const reportedId = context.participant || context.remoteJid
  if (!reportedId) return sock.sendMessage(groupId, { text: '❌ Não foi possível identificar o autor da mensagem.' })

  // Buscar groupMeta actualizado se não vier
  let meta = groupMeta
  if (!meta) {
    try { meta = await sock.groupMetadata(groupId) } catch {}
  }

  const reportedNum = reportedId.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const reportedName = getName(reportedId, meta) || reportedNum
  const reporterName = getName(msg.key.participant || msg.key.remoteJid, meta) || sender
  const groupName = meta?.subject || groupId

  const qm = context.quotedMessage
  const reportedText =
    qm?.conversation ||
    qm?.extendedTextMessage?.text ||
    qm?.imageMessage?.caption ||
    qm?.videoMessage?.caption ||
    (qm?.imageMessage ? '[imagem]' : null) ||
    (qm?.videoMessage ? '[vídeo]' : null) ||
    (qm?.audioMessage ? '[áudio]' : null) ||
    (qm?.stickerMessage ? '[sticker]' : null) ||
    '[mensagem sem texto]'

  await supabase.from('reports').insert({
    group_id: groupId,
    reported_by: sender,
    reported_user: reportedNum,
    message_text: reportedText,
  })

  await sock.sendMessage(groupId, {
    text: `🚨 *Denúncia registada*\n\n👤 Denunciado: @${reportedNum}\n💬 Mensagem: _"${reportedText}"_\n\n_Os administradores foram notificados._`,
    mentions: [reportedId]
  })

  await notifyAdmins(sock, meta,
    `🚨 *Nova denúncia — ${groupName}*\n\n` +
    `👤 Denunciado: *${reportedName}*\n` +
    `💬 Mensagem: _"${reportedText}"_\n` +
    `🗣️ Denunciado por: *${reporterName}*`
  )
})

registerCommand('denuncias', { description: 'Ver denúncias do grupo', permission: 'admin' }, async ({ sock, groupId }) => {
  const { data } = await supabase
    .from('reports')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!data?.length) return sock.sendMessage(groupId, { text: '✅ Sem denúncias registadas.' })

  const list = data.map((r, i) =>
    `${i + 1}. *${r.reported_user}* — _"${r.message_text?.slice(0, 60)}"_`
  ).join('\n')

  await sock.sendMessage(groupId, { text: `🚨 *Últimas denúncias*\n\n${list}` })
})
