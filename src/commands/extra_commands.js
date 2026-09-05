import { registerCommand } from './index.js'
import { getReputation, getLeaderboard, getLevelInfo } from '../moderation/reputation.js'
import { getMentionText, resolveJid, getName } from '../utils/notify.js'
import { sendDailySummary } from '../core/scheduler.js'
import { setGroupData, ensureGroup } from '../moderation/warnings.js'
import supabase from '../core/database.js'

registerCommand('reputacao', { description: 'Ver reputação de um membro', permission: 'member' }, async ({ sock, msg, groupId, groupMeta, sender }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  const target = mentioned?.[0] || sender
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const mention = getMentionText(target, groupMeta)

  const rep = await getReputation(groupId, targetNum)
  const { name, level, next, pointsToNext } = rep.levelInfo

  await sock.sendMessage(groupId, {
    text: `⭐ *Reputação de ${mention}*\n\nNível ${level} — ${name}\nPontos: ${rep.points}\nMensagens: ${rep.messages_count}\nInfrações: ${rep.violations}${next ? `\n\nFaltam ${pointsToNext} pontos para ${next.name}` : '\n\nNível máximo atingido!'}`,
    mentions: [resolveJid(target, groupMeta)]
  })
})

registerCommand('top', { description: 'Top membros por reputação', permission: 'member' }, async ({ sock, groupId, groupMeta }) => {
  const board = await getLeaderboard(groupId, 10)
  if (!board.length) return sock.sendMessage(groupId, { text: '❌ Sem dados de reputação ainda.' })

  const medals = ['🥇', '🥈', '🥉']
  const lines = board.map((r, i) => {
    const info = getLevelInfo(r.points)
    return `${medals[i] || `${i + 1}.`} ${getName(r.user_id + '@s.whatsapp.net', groupMeta) || r.user_id} — ${r.points}pts (${info.name})`
  })

  await sock.sendMessage(groupId, { text: `🏆 *Top Membros — ${groupMeta?.subject}*\n\n${lines.join('\n')}` })
})

registerCommand('agendarcorrente', { description: 'Criar agendamento recorrente', permission: 'admin' }, async ({ sock, groupId, args }) => {
  // Uso: /agendarcorrente DAILY 09:00 Bom dia a todos!
  if (args.length < 3) return sock.sendMessage(groupId, {
    text: '❌ Uso: */agendarcorrente <DAILY|MON-FRI> <HH:MM> <mensagem>*\nEx: */agendarcorrente DAILY 09:00 Bom dia!*'
  })
  const [type, time, ...msgParts] = args
  const message = msgParts.join(' ')
  const cron_expr = `${type.toUpperCase()} ${time}`

  await supabase.from('schedules').insert({ group_id: groupId, message, cron_expr })
  await sock.sendMessage(groupId, { text: `✅ Agendamento criado: *${cron_expr}*\nMensagem: _${message}_` })
})

registerCommand('agendamentos', { description: 'Ver agendamentos activos', permission: 'admin' }, async ({ sock, groupId }) => {
  const { data } = await supabase.from('schedules').select('*').eq('group_id', groupId).eq('active', true)
  if (!data?.length) return sock.sendMessage(groupId, { text: '❌ Sem agendamentos activos.' })
  const list = data.map((s, i) => `${i + 1}. [${s.id.slice(-6)}] ${s.cron_expr} — _${s.message.slice(0, 40)}_`).join('\n')
  await sock.sendMessage(groupId, { text: `⏰ *Agendamentos activos:*\n\n${list}\n\nUsa */cancelaragendamento <id>* para cancelar.` })
})

registerCommand('cancelaragendamento', { description: 'Cancelar agendamento', permission: 'admin' }, async ({ sock, groupId, args }) => {
  const id = args[0]
  if (!id) return sock.sendMessage(groupId, { text: '❌ Uso: */cancelaragendamento <id>*' })
  const { data } = await supabase.from('schedules').select('id').eq('group_id', groupId).ilike('id', `%${id}%`).single()
  if (!data) return sock.sendMessage(groupId, { text: '❌ Agendamento não encontrado.' })
  await supabase.from('schedules').update({ active: false }).eq('id', data.id)
  await sock.sendMessage(groupId, { text: '✅ Agendamento cancelado.' })
})

registerCommand('resumodiario', { description: 'Activar/desactivar resumo diário', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const state = args[0]?.toLowerCase()
  if (!['on', 'off'].includes(state)) return sock.sendMessage(groupId, { text: '❌ Uso: */resumodiario on|off [hora]*\nEx: */resumodiario on 22*' })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  const hour = parseInt(args[1]) || 0
  await setGroupData(groupId, { daily_summary_enabled: state === 'on', daily_summary_hour: hour })
  await sock.sendMessage(groupId, { text: `📋 Resumo diário: *${state === 'on' ? `✅ Activado às ${hour}h` : '❌ Desactivado'}*` })
})

registerCommand('resumoagora', { description: 'Enviar resumo diário agora', permission: 'admin' }, async ({ sock, groupId, groupMeta }) => {
  await sendDailySummary(groupId, groupMeta?.subject)
})
