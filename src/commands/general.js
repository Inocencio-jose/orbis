import { registerCommand } from './index.js'
import { ensureGroup, getGroupConfig, setGroupData } from '../moderation/warnings.js'
import { getMentionText, resolveJid } from '../utils/notify.js'

registerCommand('menu', { description: 'Menu principal', permission: 'member' }, async ({ sock, groupId }) => {
  await sock.sendMessage(groupId, {
    text: `🔵 *ORBIS*\n_by Orion Technologies_\n\n` +
      `👤 *Geral (todos):*\n` +
      `📋 /menu — Este menu\n` +
      `ℹ️ /info — Informações do grupo\n` +
      `👥 /admins — Lista de admins\n` +
      `📜 /regras — Regras do grupo\n` +
      `📊 /stats — Estatísticas\n` +
      `🗳️ /sondagem <pergunta> | op1 | op2 — Enquete\n` +
      `🚩 /denunciar — Denunciar mensagem\n` +
      `⭐ /reputacao [@membro] — Ver reputação\n` +
      `🏆 /top — Top membros\n` +
      `📋 /resumo [N] — Resumir conversa\n` +
      `📖 /instrucoes [secção] — Instruções detalhadas\n\n` +
      `🛡️ *Moderação (admins):*\n` +
      `⚠️ /warn @membro [motivo] — Advertir\n` +
      `🔕 /warnings @membro — Ver avisos\n` +
      `🧹 /clearwarn @membro — Limpar avisos\n` +
      `📋 /historico @membro — Histórico de infrações\n` +
      `👢 /kick @membro — Expulsar\n` +
      `🔨 /ban @membro [motivo] — Banir\n` +
      `📜 /banidos — Lista de banidos\n` +
      `➕ /adicionar <número> — Readmitir banido\n` +
      `🗑️ /deletar — Apagar mensagem citada\n` +
      `🔒 /trancar / 🔓 /abrir — Trancar/abrir grupo\n` +
      `🔇 /mute @membro [10m|1h|2d] — Mutar\n` +
      `🔊 /unmute @membro — Desmutar\n` +
      `👑 /promover / /despromover @membro\n` +
      `📢 /anunciar <texto> — Anúncio\n` +
      `⏰ /agendamento <tempo> <msg> — Agendar (único)\n` +
      `⏰ /agendarcorrente <DAILY|MON-FRI> <HH:MM> <msg>\n` +
      `📋 /agendamentos — Ver agendamentos\n` +
      `🚨 /denuncias — Ver denúncias\n\n` +
      `⚙️ *Configuração (admins):*\n` +
      `⚙️ /config — Ver/alterar configurações\n` +
      `🔗 /antilink on|off — Anti-link\n` +
      `🚫 /antispam on|off — Anti-spam\n` +
      `🌊 /antiflood on|off — Anti-flood\n` +
      `📝 /setregras <texto> — Definir regras\n` +
      `👋 /setwelcome <msg> — Boas-vindas\n` +
      `🔔 /setadmingroup <id> — Grupo de notificações\n` +
      `📋 /resumodiario on|off [hora] — Resumo diário\n\n` +
      `_/instrucoes extra — reputação, whitelist, modo silêncio_`
  })
})

registerCommand('info', { description: 'Informações do grupo', permission: 'member' }, async ({ sock, groupId, groupMeta }) => {
  if (!groupMeta) return sock.sendMessage(groupId, { text: '❌ Este comando só funciona em grupos.' })
  const total = groupMeta.participants.length
  const admins = groupMeta.participants.filter(p => p.admin).length
  const criado = new Date(groupMeta.creation * 1000).toLocaleDateString('pt-PT')
  await sock.sendMessage(groupId, {
    text: `ℹ️ *${groupMeta.subject}*\n\n👥 Membros: ${total}\n👑 Admins: ${admins}\n📅 Criado: ${criado}\n🔒 Só admins enviam: ${groupMeta.announce ? 'Sim' : 'Não'}`
  })
})

registerCommand('admins', { description: 'Lista admins', permission: 'member' }, async ({ sock, groupId, groupMeta }) => {
  if (!groupMeta) return sock.sendMessage(groupId, { text: '❌ Este comando só funciona em grupos.' })
  const admins = groupMeta.participants.filter(p => p.admin)
  const list = admins.map((a, i) => `${i + 1}. ${getMentionText(a.id, groupMeta)}`).join('\n')
  await sock.sendMessage(groupId, {
    text: `👑 *Administradores (${admins.length})*\n\n${list}`,
    mentions: admins.map(a => resolveJid(a.id, groupMeta))
  })
})

registerCommand('membros', { description: 'Lista membros', permission: 'admin' }, async ({ sock, groupId, groupMeta }) => {
  if (!groupMeta) return sock.sendMessage(groupId, { text: '❌ Este comando só funciona em grupos.' })
  const members = groupMeta.participants.filter(p => !p.admin)
  const list = members.slice(0, 30).map((m, i) => `${i + 1}. ${getMentionText(m.id, groupMeta)}`).join('\n')
  const extra = members.length > 30 ? `\n_...e mais ${members.length - 30}_` : ''
  await sock.sendMessage(groupId, {
    text: `👤 *Membros (${members.length})*\n\n${list}${extra}`,
    mentions: members.slice(0, 30).map(m => resolveJid(m.id, groupMeta))
  })
})

registerCommand('regras', { description: 'Regras do grupo', permission: 'member' }, async ({ sock, groupId, groupMeta }) => {
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  const config = await getGroupConfig(groupId)
  const regras = config?.rules ||
    `1️⃣ Respeita todos os membros\n` +
    `2️⃣ Proibido spam e flood\n` +
    `3️⃣ Proibidos links sem autorização\n` +
    `4️⃣ Sem conteúdo impróprio\n` +
    `5️⃣ Sem publicidade\n` +
    `6️⃣ Proibidas burlas e esquemas de qualquer tipo\n` +
    `7️⃣ Em caso de incómodo, reporta aos admins com */denunciar*`
  await sock.sendMessage(groupId, {
    text: `📜 *REGRAS DO GRUPO*\n\n${regras}\n\n⚠️ O incumprimento resulta em aviso ou expulsão.`
  })
})

registerCommand('setregras', { description: 'Definir regras do grupo', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const texto = args.join(' ')
  if (!texto) return sock.sendMessage(groupId, { text: '❌ Uso: */setregras <texto das regras>*' })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await setGroupData(groupId, { rules: texto })
  await sock.sendMessage(groupId, { text: `✅ Regras actualizadas. Usa */regras* para ver.` })
})

registerCommand('stats', { description: 'Estatísticas do grupo', permission: 'member' }, async ({ sock, groupId, groupMeta }) => {
  if (!groupMeta) return sock.sendMessage(groupId, { text: '❌ Este comando só funciona em grupos.' })
  const total = groupMeta.participants.length
  const admins = groupMeta.participants.filter(p => p.admin).length
  const members = total - admins
  await sock.sendMessage(groupId, {
    text: `📊 *ESTATÍSTICAS — ${groupMeta.subject}*\n\n` +
      `👥 Total de membros: ${total}\n` +
      `👑 Admins: ${admins}\n` +
      `👤 Membros: ${members}\n`
  })
})

registerCommand('anunciar', { description: 'Fazer anúncio', permission: 'admin' }, async ({ sock, msg, groupId, args }) => {
  const texto = args.join(' ')
  if (!texto) return sock.sendMessage(groupId, { text: '❌ Uso: */anunciar <texto>*' })
  await sock.sendMessage(groupId, {
    text: `📢 *AVISO IMPORTANTE*\n\n${texto}\n\n— _Administração_`
  })
})

registerCommand('sondagem', { description: 'Criar enquete', permission: 'member' }, async ({ sock, groupId, args }) => {
  const full = args.join(' ')
  const parts = full.split('|').map(s => s.trim()).filter(Boolean)
  if (parts.length < 3) return sock.sendMessage(groupId, {
    text: '❌ Uso: */sondagem <pergunta> | opção1 | opção2 ...*\nExemplo: */sondagem Qual o melhor dia? | Segunda | Terça | Quarta*'
  })
  const [name, ...values] = parts
  if (values.length < 2 || values.length > 12) return sock.sendMessage(groupId, { text: '❌ A sondagem precisa de 2 a 12 opções.' })
  await sock.sendMessage(groupId, {
    poll: { name, values, selectableCount: 1 }
  })
})

registerCommand('agendamento', { description: 'Agendar mensagem', permission: 'admin' }, async ({ sock, groupId, args }) => {
  const timeArg = args[0]
  const texto = args.slice(1).join(' ')
  if (!timeArg || !texto) return sock.sendMessage(groupId, { text: '❌ Uso: */agendamento <tempo> <mensagem>*\nExemplo: */agendamento 30m Reunião em 30 minutos!*' })
  if (!/^\d+[mhd]$/.test(timeArg)) return sock.sendMessage(groupId, { text: '❌ Tempo inválido. Usa: 10m, 2h, 1d' })

  const num = parseInt(timeArg)
  const unit = timeArg.slice(-1)
  const multipliers = { m: 60000, h: 3600000, d: 86400000 }
  const durationMs = num * multipliers[unit]
  const unitText = unit === 'm' ? 'minuto(s)' : unit === 'h' ? 'hora(s)' : 'dia(s)'

  await sock.sendMessage(groupId, { text: `⏰ Mensagem agendada para daqui a *${num} ${unitText}*.` })
  setTimeout(async () => {
    try {
      await sock.sendMessage(groupId, { text: `📢 *Mensagem agendada:*\n\n${texto}` })
    } catch {}
  }, durationMs)
})
