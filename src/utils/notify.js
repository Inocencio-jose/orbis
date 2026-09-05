import logger from '../core/logger.js'
import supabase from '../core/database.js'

export async function notifyAdmins(sock, groupMeta, message) {
  if (!groupMeta) return

  // Tentar enviar para o grupo de admins configurado
  const { data } = await supabase
    .from('groups')
    .select('admin_group_id')
    .eq('whatsapp_group_id', groupMeta.id)
    .single()

  if (data?.admin_group_id) {
    try {
      await sock.sendMessage(data.admin_group_id, { text: message })
      logger.info(`Notificação enviada para grupo de admins: ${data.admin_group_id}`)
      return
    } catch (err) {
      logger.warn(`Falha ao notificar grupo de admins: ${err.message}`)
    }
  }

  // Fallback — tentar privado com phoneNumber
  const admins = groupMeta.participants.filter(p => p.admin)
  for (const admin of admins) {
    const botNum = sock.user?.id?.split(':')[0]
    const adminNum = admin.id.split('@')[0].split(':')[0]
    if (botNum && adminNum === botNum) continue

    const jid = admin.phoneNumber || admin.id
    try {
      await sock.sendMessage(jid, { text: message })
      logger.info(`Notificação enviada: ${jid}`)
    } catch (err) {
      logger.warn(`Falha ao notificar ${jid}: ${err.message}`)
    }
  }
}

// Cache de nomes: jid -> nome (populado quando mensagens chegam)
const nameCache = new Map()
// Cache de jid lid -> jid real @s.whatsapp.net
const jidCache = new Map()
// Throttle para não escrever no BD a cada mensagem
const contactSaveQueue = new Map()

export function cacheName(jid, name, phone) {
  if (!jid || !name) return
  nameCache.set(jid, name)
  if (phone) jidCache.set(jid, phone)
  // Guardar no BD com throttle de 60s por JID
  const last = contactSaveQueue.get(jid) || 0
  if (Date.now() - last > 60000) {
    contactSaveQueue.set(jid, Date.now())
    supabase.from('contacts').upsert({ jid, name, phone: phone || null, updated_at: new Date().toISOString() }, { onConflict: 'jid' }).then()
  }
}

// Dado um JID @lid, devolve o JID @s.whatsapp.net equivalente se soubermos o phoneNumber
export function resolveJid(participant, groupMeta) {
  if (!participant) return participant
  // Já é @s.whatsapp.net — usar directamente
  if (participant.endsWith('@s.whatsapp.net')) return participant
  // Ver cache
  if (jidCache.has(participant)) return jidCache.get(participant)
  // Tentar resolver via phoneNumber do participante
  if (groupMeta) {
    const found = groupMeta.participants.find(p => p.id === participant)
    if (found?.phoneNumber) {
      const n = String(found.phoneNumber).replace(/\D/g, '')
      if (n.length >= 7) {
        const resolved = `${n}@s.whatsapp.net`
        jidCache.set(participant, resolved)
        return resolved
      }
    }
  }
  // Não conseguiu resolver — devolver o original
  return participant
}

export function getName(participant, groupMeta) {
  if (!participant || !groupMeta) return participant?.split('@')[0] || 'Desconhecido'

  // 1. Cache de nomes (populado via pushName das mensagens)
  if (nameCache.has(participant)) return nameCache.get(participant)

  const found = groupMeta.participants.find(p => p.id === participant)

  // 2. notify ou name do participante
  if (found?.notify) return found.notify
  if (found?.name) return found.name

  // 3. phoneNumber real (Baileys v7)
  if (found?.phoneNumber) {
    const n = String(found.phoneNumber).replace(/\D/g, '')
    if (n.length >= 7) return `+${n}`
  }

  // 4. Se JID for @s.whatsapp.net tem o número directamente
  if (participant.endsWith('@s.whatsapp.net')) {
    const raw = participant.split('@')[0].split(':')[0]
    if (/^\d{7,15}$/.test(raw)) return `+${raw}`
  }

  // 5. LID — último recurso
  return participant.split('@')[0].split(':')[0]
}

// Retorna o texto de menção legível: @Nome ou @número
export function getMentionText(participant, groupMeta) {
  return `@${getName(participant, groupMeta)}`
}
