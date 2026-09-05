import { registerCommand } from './index.js'
import { ensureGroup, getGroupConfig } from '../moderation/warnings.js'
import supabase from '../core/database.js'

registerCommand('config', { description: 'Ver configuração do grupo', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  const config = await getGroupConfig(groupId)

  if (!args.length) {
    return sock.sendMessage(groupId, {
      text: `⚙️ *CONFIGURAÇÃO — ${groupMeta?.subject || 'Grupo'}*\n\n` +
        `🚫 Anti-spam: ${config.anti_spam_enabled ? '✅' : '❌'}\n` +
        `🔗 Anti-link: ${config.anti_link_enabled ? '✅' : '❌'}\n` +
        `🌊 Anti-flood: ${config.anti_flood_enabled ? '✅' : '❌'}\n` +
        `👋 Boas-vindas: ${config.welcome_enabled ? '✅' : '❌'}\n` +
        `⚠️ Limite de avisos: ${config.warnings_limit}\n` +
        `👥 Grupo de admins: ${config.admin_group_id ? '✅ Configurado' : '❌ Não configurado'}\n\n` +
        `_Usa /config <opção> on|off para alterar_\n` +
        `_Opções: spam, link, flood, welcome, warnings <número>_`
    })
  }

  const [option, value] = args
  const updates = {}

  if (option === 'spam') updates.anti_spam_enabled = value === 'on'
  else if (option === 'link') updates.anti_link_enabled = value === 'on'
  else if (option === 'flood') updates.anti_flood_enabled = value === 'on'
  else if (option === 'welcome') updates.welcome_enabled = value === 'on'
  else if (option === 'warnings') {
    const num = parseInt(value)
    if (isNaN(num) || num < 1) return sock.sendMessage(groupId, { text: '❌ Número inválido.' })
    updates.warnings_limit = num
  } else {
    return sock.sendMessage(groupId, { text: '❌ Opção inválida. Usa: spam, link, flood, welcome, warnings' })
  }

  await supabase.from('groups').update(updates).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `✅ Configuração actualizada: *${option}* → *${value}*` })
})

registerCommand('setwelcome', { description: 'Definir mensagem de boas-vindas', permission: 'admin' }, async ({ sock, groupId, groupMeta, args }) => {
  const texto = args.join(' ')
  if (!texto) return sock.sendMessage(groupId, {
    text: '❌ Uso: */setwelcome <mensagem>*\nVariáveis: {nome} {grupo}\nExemplo: */setwelcome Olá {nome}, bem-vindo(a) ao {grupo}!*'
  })
  await ensureGroup(groupId, groupMeta?.subject || groupId)
  await supabase.from('groups').update({ welcome_message: texto }).eq('whatsapp_group_id', groupId)
  await sock.sendMessage(groupId, { text: `✅ Mensagem de boas-vindas actualizada.\nPré-visualização:\n\n${texto.replace('{nome}', 'João').replace('{grupo}', groupMeta?.subject || 'Grupo')}` })
})

registerCommand('setadmingroup', { description: 'Definir grupo de admins para notificações', permission: 'admin' }, async ({ sock, msg, groupId, groupMeta }) => {
  // Este comando tem que ser enviado NO grupo de admins
  // O argumento é o ID do grupo principal que este grupo vai receber notificações
  const args = (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').split(' ').slice(1)
  const targetGroupId = args[0]

  if (!targetGroupId) {
    return sock.sendMessage(groupId, {
      text: `ℹ️ *Como configurar o grupo de admins:*\n\n` +
        `1. Cria um grupo com os admins + Orbis\n` +
        `2. Nesse grupo, envia:\n` +
        `*/setadmingroup <ID do grupo principal>*\n\n` +
        `O ID do grupo principal aparece no terminal quando envias uma mensagem lá.\n` +
        `Exemplo: */setadmingroup 120363427347409993@g.us*`
    })
  }

  await ensureGroup(targetGroupId, targetGroupId)
  await supabase.from('groups').update({ admin_group_id: groupId }).eq('whatsapp_group_id', targetGroupId)

  await sock.sendMessage(groupId, {
    text: `✅ Este grupo foi definido como grupo de admins para *${targetGroupId}*\n\nTodas as notificações de denúncias, avisos e acções serão enviadas aqui.`
  })
})
