import { registerCommand } from './index.js'
import { getGroupContext, askOrbis } from '../core/ai.js'
import { getMentionText, resolveJid } from '../utils/notify.js'
import supabase from '../core/database.js'

registerCommand('resumo', { description: 'Resumir conversa recente', permission: 'member' }, async ({ sock, groupId, groupMeta, args }) => {
  const ctx = getGroupContext(groupId)
  if (ctx.length < 3) return sock.sendMessage(groupId, { text: '❌ Não há conversa suficiente para resumir.' })

  const n = parseInt(args[0]) || 20
  const recent = ctx.slice(-Math.min(n, 50))
  const block = recent.map(m => `${m.sender}: ${m.text}`).join('\n')

  await sock.sendPresenceUpdate('composing', groupId)
  const summary = await askOrbis(
    `Resume as seguintes mensagens do grupo em pontos principais. Sê breve e directo. Não uses markdown.\n\n${block}`,
    `summary_${groupId}`,
    null
  )
  await sock.sendMessage(groupId, { text: `📋 *Resumo das últimas ${recent.length} mensagens:*\n\n${summary}` })
})

registerCommand('historico', { description: 'Ver histórico de infrações de um membro', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return sock.sendMessage(groupId, { text: '❌ Uso: */historico @membro*' })

  const target = mentioned[0]
  const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const mention = getMentionText(target, groupMeta)

  const [{ data: warns }, { data: bans }, { data: reports }] = await Promise.all([
    supabase.from('warnings').select('reason, created_at').eq('group_id', groupId).eq('user_id', targetNum).order('created_at', { ascending: false }).limit(10),
    supabase.from('banned_users').select('reason, created_at').eq('group_id', groupId).eq('user_id', targetNum),
    supabase.from('reports').select('message_text, created_at').eq('group_id', groupId).eq('reported_user', targetNum).limit(5)
  ])

  const fmt = d => new Date(d).toLocaleDateString('pt-PT')
  let text = `📋 *Histórico de ${mention}*\n\n`
  text += `⚠️ Avisos: ${warns?.length || 0}\n`
  if (warns?.length) text += warns.map(w => `  • ${w.reason || '--'} (${fmt(w.created_at)})`).join('\n') + '\n'
  text += `\n🔨 Bans: ${bans?.length || 0}\n`
  if (bans?.length) text += bans.map(b => `  • ${b.reason || '--'} (${fmt(b.created_at)})`).join('\n') + '\n'
  text += `\n🚩 Denúncias recebidas: ${reports?.length || 0}`

  await sock.sendMessage(groupId, { text, mentions: [resolveJid(target, groupMeta)] })
})
