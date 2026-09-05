import { registerCommand } from './index.js'
import { ensureGroup, getGroupConfig, setGroupData } from '../moderation/warnings.js'
import supabase from '../core/database.js'

registerCommand('config', { description: 'Ver configuração do grupo', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  const cfg = await getGroupConfig(groupId)

  if (!args.length) {
    return sock.sendMessage(groupId, {
      text: `⚙️ *CONFIGURAÇÃO — ${groupMeta?.subject || 'Grupo'}*\n\n` +
        `🚫 Anti-spam: ${cfg.anti_spam_enabled ? '✅' : '❌'}\n` +
        `🔗 Anti-link: ${cfg.anti_link_enabled ? '✅' : '❌'}\n` +
        `🌊 Anti-flood: ${cfg.anti_flood_enabled ? '✅' : '❌'}\n` +
        `👋 Boas-vindas: ${cfg.welcome_enabled ? '✅' : '❌'}\n` +
        `⚠️ Limite de avisos: ${cfg.warnings_limit}\n` +
        `⭐ Reputação: ${cfg.reputation_enabled ? '✅' : '❌'}\n` +
        `📋 Resumo diário: ${cfg.daily_summary_enabled ? `✅ às ${cfg.daily_summary_hour}h` : '❌'}\n` +
        `🌙 Modo silêncio: ${cfg.quiet_hours_start != null ? `${cfg.quiet_hours_start}h-${cfg.quiet_hours_end}h` : '❌'}\n` +
        `🔗 Whitelist links: ${cfg.link_whitelist?.length ? cfg.link_whitelist.join(', ') : 'nenhum'}\n` +
        `👥 Grupo de admins: ${cfg.admin_group_id ? '✅' : '❌'}\n\n` +
        `_Usa /config <opção> <valor>_\n` +
        `_Opções: spam, link, flood, welcome, warnings, reputacao, silencio, whitelist_`
    })
  }

  const [option, ...rest] = args
  const value = rest[0]
  const updates = {}

  if (option === 'spam') updates.anti_spam_enabled = value === 'on'
  else if (option === 'link') updates.anti_link_enabled = value === 'on'
  else if (option === 'flood') updates.anti_flood_enabled = value === 'on'
  else if (option === 'welcome') updates.welcome_enabled = value === 'on'
  else if (option === 'reputacao') updates.reputation_enabled = value === 'on'
  else if (option === 'warnings') {
    const num = parseInt(value)
    if (isNaN(num) || num < 1) return sock.sendMessage(groupId, { text: '❌ Número inválido.' })
    updates.warnings_limit = num
  } else if (option === 'silencio') {
    // /config silencio 22 6  (das 22h às 6h)
    const start = parseInt(value)
    const end = parseInt(rest[1])
    if (isNaN(start) || isNaN(end)) return sock.sendMessage(groupId, { text: '❌ Uso: */config silencio <hora_inicio> <hora_fim>*\nEx: */config silencio 22 6*' })
    updates.quiet_hours_start = start
    updates.quiet_hours_end = end
  } else if (option === 'silencio' && value === 'off') {
    updates.quiet_hours_start = null
    updates.quiet_hours_end = null
  } else if (option === 'whitelist') {
    // /config whitelist add youtube.com  ou  /config whitelist remove youtube.com  ou  /config whitelist clear
    const action = value
    const domain = rest[1]
    const current = (await getGroupConfig(groupId))?.link_whitelist || []
    if (action === 'add' && domain) updates.link_whitelist = [...new Set([...current, domain])]
    else if (action === 'remove' && domain) updates.link_whitelist = current.filter(d => d !== domain)
    else if (action === 'clear') updates.link_whitelist = []
    else return sock.sendMessage(groupId, { text: '❌ Uso: */config whitelist add|remove|clear [domínio]*' })
  } else {
    return sock.sendMessage(groupId, { text: '❌ Opção inválida.' })
  }

  await supabase.from('groups').update(updates).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `✅ Configuração actualizada: *${option}*` })
})

registerCommand('setwelcome', { description: 'Definir mensagem de boas-vindas', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const texto = args.join(' ')
  if (!texto) return sock.sendMessage(groupId, {
    text: '❌ Uso: */setwelcome <mensagem>*\nVariáveis: {nome} {grupo}\nExemplo: */setwelcome Olá {nome}, bem-vindo(a) ao {grupo}!*'
  })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await setGroupData(groupId, { welcome_message: texto })
  await sock.sendMessage(groupId, { text: `✅ Boas-vindas actualizadas.\n\n${texto.replace('{nome}', 'João').replace('{grupo}', groupMeta?.subject || 'Grupo')}` })
})

registerCommand('setadmingroup', { description: 'Definir grupo de admins para notificações', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  const args = (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').split(' ').slice(1)
  const targetGroupId = args[0]

  if (!targetGroupId) {
    return sock.sendMessage(groupId, {
      text: `ℹ️ *Como configurar o grupo de admins:*\n\n1. Cria um grupo com os admins + Orbis\n2. Nesse grupo, envia:\n*/setadmingroup <ID do grupo principal>*\n\nO ID aparece no terminal quando envias uma mensagem lá.\nEx: */setadmingroup 120363427347409993@g.us*`
    })
  }

  await ensureGroup(targetGroupId, targetGroupId)
  await supabase.from('groups').update({ admin_group_id: groupId }).eq('whatsapp_group_id', targetGroupId)
  await sock.sendMessage(groupId, { text: `✅ Grupo de admins configurado para *${targetGroupId}*` })
})
