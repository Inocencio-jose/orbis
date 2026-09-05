import config from '../../config/index.js'
import { getRole, hasPermission } from '../permissions/index.js'
import logger from '../core/logger.js'

const commands = new Map()

export function registerCommand(name, options, handler) {
  commands.set(name, { ...options, handler })
}

export async function handleCommand(sock, msg) {
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  if (!body.startsWith(config.prefix)) return

  const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(' ')
  const cmdName = rawCmd.toLowerCase()
  const command = commands.get(cmdName)

  if (!command) return

  const rawSender = msg.key.participant || msg.key.remoteJid
  const sender = rawSender.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  const groupId = msg.key.remoteJid
  const isGroup = groupId.endsWith('@g.us') || groupId.endsWith('@lid')

  let groupMeta = null
  let admins = []

  try {
    if (isGroup) {
      groupMeta = await sock.groupMetadata(groupId)
      admins = groupMeta?.participants.filter(p => p.admin).map(p =>
        p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
      ) || []
    }
  } catch {}

  const role = getRole(sender, admins, config.ownerLid)

  if (command.permission && !hasPermission(role, command.permission)) {
    await sock.sendMessage(groupId, { text: '🚫 Não tens permissão para usar este comando.' })
    return
  }

  logger.info(`Comando /${cmdName} por ${sender} (${role})`)

  try {
    await command.handler({ sock, msg, args, sender, groupId, groupMeta, admins, role })
  } catch (err) {
    logger.error(`Erro no comando /${cmdName}: ${err.message}`)
  }
}

export { commands }
