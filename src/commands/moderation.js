import { registerCommand } from './index.js'
import { addWarning, getWarnings, clearWarnings, getGroupConfig, ensureGroup, setMuteTimer, clearMuteTimer } from '../moderation/warnings.js'
import { notifyAdmins, getName, getMentionText, resolveJid } from '../utils/notify.js'
import supabase from '../core/database.js'

registerCommand('warn', { description: 'Advertir membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */warn @membro motivo*' })

  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const targetName = getName(target, groupMeta) || targetNum
  const mention = getMentionText(target, groupMeta)
  const args = (msg.message?.extendedTextMessage?.text || '').split(' ').slice(2).join(' ')
  const reason = args || 'comportamento inadequado'
  const groupName = groupMeta?.subject || groupId

  await ensureGroup(groupId, groupName)
  const config = await getGroupConfig(groupId)
  const limit = config?.warnings_limit || 3
  const total = await addWarning(groupId, targetNum, reason)

  if (total >= limit) {
    await sock.groupParticipantsUpdate(groupId, [target], 'remove')
    await sock.sendMessage(groupId, {
      text: `🔨 ${mention} foi removido após atingir ${total}/${limit} avisos.\nMotivo: _${reason}_`,
      mentions: [resolveJid(target, groupMeta)]
    })
    await notifyAdmins(sock, groupMeta,
      `🔨 *Remoção automática — ${groupName}*\n\n*${targetName}* foi removido após ${total} avisos.\nMotivo: _${reason}_`
    )
  } else {
    await sock.sendMessage(groupId, {
      text: `⚠️ ${mention} recebeu um aviso.\nMotivo: _${reason}_\nAvisos: ${total}/${limit}`,
      mentions: [resolveJid(target, groupMeta)]
    })
    await notifyAdmins(sock, groupMeta,
      `⚠️ *Aviso — ${groupName}*\n\n*${targetName}* recebeu aviso ${total}/${limit}.\nMotivo: _${reason}_`
    )
  }
})

registerCommand('warnings', { description: 'Ver avisos de um membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */warnings @membro*' })
  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const mention = getMentionText(target, groupMeta)
  const total = await getWarnings(groupId, targetNum)
  await sock.sendMessage(groupId, {
    text: `📋 ${mention} tem *${total} aviso(s)* registado(s).`,
    mentions: [resolveJid(target, groupMeta)]
  })
})

registerCommand('clearwarn', { description: 'Limpar avisos de um membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */clearwarn @membro*' })
  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const mention = getMentionText(target, groupMeta)
  await clearWarnings(groupId, targetNum)
  await sock.sendMessage(groupId, { text: `✅ Avisos de ${mention} foram limpos.`, mentions: [resolveJid(target, groupMeta)] })
})

registerCommand('kick', { description: 'Expulsar membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */kick @membro*' })
  const target = mentioned[0]
  const targetName = getName(target, groupMeta)
  const mention = getMentionText(target, groupMeta)
  const groupName = groupMeta?.subject || groupId
  await sock.groupParticipantsUpdate(groupId, [target], 'remove')
  await sock.sendMessage(groupId, { text: `👢 ${mention} foi expulso.`, mentions: [resolveJid(target, groupMeta)] })
  await notifyAdmins(sock, groupMeta, `👢 *Expulsão — ${groupName}*\n\n*${targetName}* foi expulso do grupo.`)
})

registerCommand('ban', { description: 'Banir membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta, sender }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */ban @membro motivo*' })
  const target = mentioned[0]
  const targetName = getName(target, groupMeta)
  const mention = getMentionText(target, groupMeta)
  const groupName = groupMeta?.subject || groupId
  const reason = (msg.message?.extendedTextMessage?.text || '').split(' ').slice(2).join(' ') || 'ban manual'

  // Tentar obter número de telefone real do participante
  const participant = groupMeta?.participants?.find(p => p.id === target)
  const phoneNum = participant?.phoneNumber || target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]

  await supabase.from('banned_users').insert({
    group_id: groupId,
    user_id: phoneNum,
    user_jid: target,
    reason,
    banned_by: sender
  })

  await sock.groupParticipantsUpdate(groupId, [target], 'remove')
  await sock.sendMessage(groupId, { text: `🔨 ${mention} foi banido.\nMotivo: _${reason}_`, mentions: [resolveJid(target, groupMeta)] })
  await notifyAdmins(sock, groupMeta, `🔨 *Ban — ${groupName}*\n\n*${targetName}* foi banido.\nMotivo: _${reason}_`)
})

registerCommand('banidos', { description: 'Ver lista de banidos', permission: 'admin' }, async ({ sock, groupId }) => {
  const { data } = await supabase
    .from('banned_users')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data?.length) return sock.sendMessage(groupId, { text: '✅ Sem utilizadores banidos.' })

  const list = data.map((b, i) => `${i + 1}. +${b.user_id} — _${b.reason}_`).join('\n')
  await sock.sendMessage(groupId, { text: `🔨 *Banidos (${data.length})*\n\n${list}\n\n_Usa /adicionar <número> para readmitir_` })
})

registerCommand('adicionar', { description: 'Readmitir utilizador banido', permission: 'admin' }, async ({ sock, groupId, args, groupMeta }) => {
  const num = args[0]?.replace('+', '').replace(/\s/g, '')
  if (!num) return sock.sendMessage(groupId, { text: '❌ Uso: */adicionar <número>*\nExemplo: */adicionar 244912345678*' })

  // Procurar por user_id (número) OU por user_jid que contenha o número
  const { data: byNum } = await supabase
    .from('banned_users')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', num)
    .order('created_at', { ascending: false })
    .limit(1)

  const { data: byJid } = await supabase
    .from('banned_users')
    .select('*')
    .eq('group_id', groupId)
    .ilike('user_jid', `%${num}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  const data = byNum?.length ? byNum : byJid

  if (!data?.length) return sock.sendMessage(groupId, { text: `❌ +${num} não está na lista de banidos deste grupo.` })

  const banned = data[0]
  const jid = banned.user_jid || `${num}@s.whatsapp.net`

  try {
    await sock.groupParticipantsUpdate(groupId, [jid], 'add')
    await supabase.from('banned_users').delete().eq('id', banned.id)
    await sock.sendMessage(groupId, { text: `✅ +${num} foi readmitido no grupo.` })
    await notifyAdmins(sock, groupMeta, `✅ *Readmissão — ${groupMeta?.subject}*\n\n+${num} foi readmitido por um admin.`)
  } catch {
    await sock.sendMessage(groupId, { text: `❌ Não foi possível adicionar +${num}. Pode ter bloqueado o bot ou saído do WhatsApp.` })
  }
})

registerCommand('mute', { description: 'Mutar membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta, args }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */mute @membro [tempo]* (ex: 10m, 1h, 2d)' })
  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const targetName = getName(target, groupMeta)
  const mention = getMentionText(target, groupMeta)
  const groupName = groupMeta?.subject || groupId

  const isAdmin = groupMeta?.participants.filter(p => p.admin).some(p =>
    p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0] === targetNum
  )
  if (isAdmin) return sock.sendMessage(groupId, { text: '❌ Não podes mutar um administrador.' })

  const timeArg = args.find(a => /^\d+[mhd]$/.test(a))
  let durationMs = null
  let durationText = ''
  if (timeArg) {
    const num = parseInt(timeArg)
    const unit = timeArg.slice(-1)
    const multipliers = { m: 60000, h: 3600000, d: 86400000 }
    durationMs = num * multipliers[unit]
    durationText = ` por ${num}${unit === 'm' ? ' minuto(s)' : unit === 'h' ? ' hora(s)' : ' dia(s)'}`
  }

  await sock.groupParticipantsUpdate(groupId, [target], 'demote')
  await sock.sendMessage(groupId, { text: `🔇 ${mention} foi mutado${durationText}.`, mentions: [resolveJid(target, groupMeta)] })
  await notifyAdmins(sock, groupMeta, `🔇 *Mute — ${groupName}*\n\n*${targetName}* foi mutado${durationText}.`)

  if (durationMs) {
    setMuteTimer(groupId, targetNum, durationMs, async () => {
      try {
        await sock.sendMessage(groupId, { text: `🔊 ${mention} — mute expirado.`, mentions: [target] })
      } catch {}
    })
  }
})

registerCommand('unmute', { description: 'Desmutar membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */unmute @membro*' })
  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const mention = getMentionText(target, groupMeta)
  clearMuteTimer(groupId, targetNum)
  await sock.sendMessage(groupId, { text: `🔊 ${mention} foi desmutado.`, mentions: [resolveJid(target, groupMeta)] })
})

registerCommand('promover', { description: 'Promover a admin', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */promover @membro*' })
  const target = mentioned[0]
  const targetName = getName(target, groupMeta)
  const mention = getMentionText(target, groupMeta)
  const groupName = groupMeta?.subject || groupId
  await sock.groupParticipantsUpdate(groupId, [target], 'promote')
  await sock.sendMessage(groupId, { text: `👑 ${mention} foi promovido a administrador.`, mentions: [resolveJid(target, groupMeta)] })
  await notifyAdmins(sock, groupMeta, `👑 *Promoção — ${groupName}*\n\n*${targetName}* foi promovido a administrador.`)
})

registerCommand('despromover', { description: 'Despromover admin', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */despromover @membro*' })
  const target = mentioned[0]
  const targetName = getName(target, groupMeta)
  const mention = getMentionText(target, groupMeta)
  const groupName = groupMeta?.subject || groupId
  await sock.groupParticipantsUpdate(groupId, [target], 'demote')
  await sock.sendMessage(groupId, { text: `🔒 ${mention} foi despromovido.`, mentions: [resolveJid(target, groupMeta)] })
  await notifyAdmins(sock, groupMeta, `🔒 *Despromoção — ${groupName}*\n\n*${targetName}* foi despromovido.`)
})

registerCommand('trancar', { description: 'Trancar grupo — só admins enviam', permission: 'admin' }, async ({ sock, groupId, groupMeta }) => {
  await sock.groupSettingUpdate(groupId, 'announcement')
  await sock.sendMessage(groupId, { text: `🔒 *Grupo trancado.*\nSó os administradores podem enviar mensagens.` })
  await notifyAdmins(sock, groupMeta, `🔒 *Grupo trancado — ${groupMeta?.subject}*`)
})

registerCommand('abrir', { description: 'Abrir grupo — todos podem enviar', permission: 'admin' }, async ({ sock, groupId, groupMeta }) => {
  await sock.groupSettingUpdate(groupId, 'not_announcement')
  await sock.sendMessage(groupId, { text: `🔓 *Grupo aberto.*\nTodos os membros podem enviar mensagens.` })
  await notifyAdmins(sock, groupMeta, `🔓 *Grupo aberto — ${groupMeta?.subject}*`)
})

registerCommand('antilink', { description: 'Activar/desactivar anti-link', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const state = args[0]?.toLowerCase()
  if (!['on', 'off'].includes(state)) return sock.sendMessage(groupId, { text: '❌ Uso: */antilink on|off*' })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await supabase.from('groups').update({ anti_link_enabled: state === 'on' }).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `🔗 Anti-link: *${state === 'on' ? '✅ Activado' : '❌ Desactivado'}*` })
})

registerCommand('antispam', { description: 'Activar/desactivar anti-spam', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const state = args[0]?.toLowerCase()
  if (!['on', 'off'].includes(state)) return sock.sendMessage(groupId, { text: '❌ Uso: */antispam on|off*' })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await supabase.from('groups').update({ anti_spam_enabled: state === 'on' }).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `🚫 Anti-spam: *${state === 'on' ? '✅ Activado' : '❌ Desactivado'}*` })
})

registerCommand('antiflood', { description: 'Activar/desactivar anti-flood', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const state = args[0]?.toLowerCase()
  if (!['on', 'off'].includes(state)) return sock.sendMessage(groupId, { text: '❌ Uso: */antiflood on|off*' })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await supabase.from('groups').update({ anti_flood_enabled: state === 'on' }).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `🌊 Anti-flood: *${state === 'on' ? '✅ Activado' : '❌ Desactivado'}*` })
})

registerCommand('limpar', { description: 'Apagar N mensagens do grupo', permission: 'admin' }, async ({ sock, groupId, args }) => {
  const n = parseInt(args[0])
  if (isNaN(n) || n < 1 || n > 50) return sock.sendMessage(groupId, { text: '❌ Uso: */limpar <1-50>*' })
  await sock.sendMessage(groupId, { text: `🧹 A apagar ${n} mensagem(ns)... _(funcionalidade limitada pela API do WhatsApp — apenas mensagens do bot podem ser apagadas em massa)_` })
})
