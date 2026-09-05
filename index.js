import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import express from 'express'
import cors from 'cors'

import logger from './src/core/logger.js'
import config from './config/index.js'
import { handleCommand } from './src/commands/index.js'
import { handleGroupEvents } from './src/groups/events.js'
import { autoModerate } from './src/moderation/automod.js'
import { askOrbis, observeMessage, getGroupContext } from './src/core/ai.js'
import { detectAdminCommand, analyzeUserBehavior, executeAction } from './src/core/actions.js'
import { getRole } from './src/permissions/index.js'
import { getName, cacheName } from './src/utils/notify.js'

// Carregar comandos
import './src/commands/general.js'
import './src/commands/moderation.js'
import './src/commands/reports.js'
import './src/commands/config.js'
import './src/commands/instructions.js'

// Rate limiting de comandos: máx 3 comandos por 5s por utilizador
const commandRateLimit = new Map()
function isRateLimited(userId) {
  const now = Date.now()
  const entry = commandRateLimit.get(userId) || { count: 0, reset: now + 5000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 5000 }
  entry.count++
  commandRateLimit.set(userId, entry)
  return entry.count > 3
}

// Estado global da conexão
let currentQR = null
let connectionStatus = 'disconnected' // disconnected | connecting | connected
let sockInstance = null
const startTime = Date.now()

// ── Servidor Express ──────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

// Status da conexão
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    connected: connectionStatus === 'connected',
    phone: sockInstance?.user?.id?.split(':')[0] || null
  })
})

// QR Code como imagem base64
app.get('/api/qr', async (req, res) => {
  if (connectionStatus === 'connected') return res.json({ connected: true })
  if (!currentQR) return res.json({ qr: null, message: 'A aguardar QR...' })
  try {
    const qrImage = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 })
    res.json({ qr: qrImage, connected: false })
  } catch {
    res.status(500).json({ error: 'Erro ao gerar QR' })
  }
})

// Codigo de emparelhamento
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'Numero obrigatorio' })
  if (connectionStatus === 'connected') return res.json({ connected: true })
  if (!sockInstance) return res.status(503).json({ error: 'Bot ainda nao iniciado' })
  try {
    const num = phone.replace(/\D/g, '')
    const code = await sockInstance.requestPairingCode(num)
    res.json({ code: code?.match(/.{1,4}/g)?.join('-') || code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Readmitir utilizador banido
app.post('/api/unban', async (req, res) => {
  const { user_jid, group_id } = req.body
  if (!user_jid || !group_id) return res.status(400).json({ error: 'user_jid e group_id obrigatórios' })
  if (!sockInstance || connectionStatus !== 'connected') return res.status(503).json({ error: 'Bot não conectado' })
  try {
    await sockInstance.groupParticipantsUpdate(group_id, [user_jid], 'add')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Broadcast
app.post('/api/broadcast', async (req, res) => {
  const { group_ids, type, message, question, options } = req.body
  if (!group_ids?.length) return res.status(400).json({ error: 'group_ids obrigatorio' })
  if (!sockInstance || connectionStatus !== 'connected') return res.status(503).json({ error: 'Bot nao conectado' })
  const results = []
  for (const gid of group_ids) {
    try {
      if (type === 'sondagem' && question && options?.length >= 2) {
        await sockInstance.sendMessage(gid, {
          poll: { name: question, values: options, selectableCount: 1 }
        })
      } else if (type === 'anuncio' && message) {
        await sockInstance.sendMessage(gid, {
          text: `📢 *AVISO IMPORTANTE*\n\n${message}\n\n— _Administração_`
        })
      } else if (message) {
        await sockInstance.sendMessage(gid, { text: message })
      } else {
        results.push({ gid, ok: false, error: 'payload invalido' })
        continue
      }
      results.push({ gid, ok: true })
    } catch (err) {
      results.push({ gid, ok: false, error: err.message })
    }
  }
  res.json({ results })
})

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'dashboard.html'))
})

app.get('/logo.png', (req, res) => {
  res.sendFile(join(__dirname, 'logo.png'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => logger.info(`API disponível em http://localhost:${PORT}`))
// ─────────────────────────────────────────────────────────────────────────────

async function startOrbis() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    mobile: false,
  })

  sockInstance = sock
  connectionStatus = 'connecting'
  currentQR = null

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr
      connectionStatus = 'connecting'
      console.log('\n🔵 ORBIS — QR Code gerado. Abre o dashboard → Conexão\n')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') {
      currentQR = null
      connectionStatus = 'connected'
      logger.success('Orbis conectado ao WhatsApp ✅')
    }
    if (connection === 'close') {
      currentQR = null
      connectionStatus = 'disconnected'
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      logger.warn(`Conexão encerrada (${code}). Reconectar: ${shouldReconnect}`)
      if (shouldReconnect) setTimeout(() => startOrbis(), 3000)
    }
  })

  sock.ev.on('messages.upsert', async (upsert) => {
    const messages = upsert.messages ?? upsert
    const type = upsert.type ?? 'notify'
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue

      const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
      const isGroup = msg.key.remoteJid?.endsWith('@g.us')

      if (!isGroup) {
        // Mensagens privadas — só IA
        if (body.trim()) {
          try {
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
            const reply = await askOrbis(body, msg.key.remoteJid, null)
            await sock.sendMessage(msg.key.remoteJid, { text: reply, quoted: msg })
          } catch (err) {
            logger.error(`Erro IA privado: ${err.message}`)
          }
        }
        continue
      }

      // ── Obter metadata e role do sender ──────────────────────────────────
      let meta = null
      try { meta = await sock.groupMetadata(msg.key.remoteJid) } catch { continue }

      const senderJid = msg.key.participant || ''
      const senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
      // Guardar nome e número no cache sempre que chega mensagem
      if (msg.pushName && senderJid) {
        const found = meta.participants.find(p => p.id === senderJid)
        const phone = found?.phoneNumber ? String(found.phoneNumber).replace(/\D/g,'') : null
        cacheName(senderJid, msg.pushName, phone)
      }
      const senderName = getName(senderJid, meta)
      const admins = meta.participants.filter(p => p.admin).map(p =>
        p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
      )
      const role = getRole(senderNum, admins, config.ownerLid)
      const isAdmin = role === 'admin' || role === 'owner'

      // ── Auto-moderação (detector de links/spam/flood) ─────────────────────
      const blocked = await autoModerate(sock, msg)
      if (blocked) continue

      // ── Observar mensagem para contexto da IA ────────────────────────────
      if (body.trim()) observeMessage(msg.key.remoteJid, senderName, body)

      // ── Moderação autónoma por comportamento (observa TODOS) ─────────────
      // Admins e owner nunca são moderados autonomamente
      if (!isAdmin && body.trim()) {
        try {
          const recentCtx = getGroupContext(msg.key.remoteJid)
          const violation = await analyzeUserBehavior(
            msg.key.remoteJid, senderJid, senderName, body, meta, recentCtx
          )
          if (violation) {
            const action = {
              action: violation.recommended_action,
              target: senderJid,
              reason: violation.reason,
              mute_duration: violation.mute_duration,
            }
            await executeAction(sock, action, msg.key.remoteJid, meta, null, true)
            // Se foi kick/ban, não continua a processar
            if (violation.recommended_action === 'kick' || violation.recommended_action === 'ban') continue
          }
        } catch (err) {
          logger.warn(`Moderação autónoma erro: ${err.message}`)
        }
      }

      // ── Comandos com prefixo ──────────────────────────────────────────────
      if (body.startsWith(config.prefix)) {
        if (isRateLimited(senderJid)) {
          await sock.sendMessage(msg.key.remoteJid, { text: '⏳ Estás a enviar comandos demasiado rápido. Aguarda uns segundos.' })
          continue
        }
        await handleCommand(sock, msg)
        continue
      }

      // ── Triggers para IA ──────────────────────────────────────────────────
      const botJid = sock.user?.id
      const botNum = botJid?.split(':')[0]
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      const isMentioned = botNum && mentioned.some(j => j.split('@')[0].split(':')[0] === botNum)
      const nameTriggered = /\borbis\b/i.test(body)
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
      const isReplyToBot = botNum && quotedParticipant && quotedParticipant.includes(botNum)

      if ((isMentioned || nameTriggered || isReplyToBot) && body.trim()) {
        logger.info(`IA activada por ${senderName} (${role})`)
        try {
          const recentContext = getGroupContext(msg.key.remoteJid)

          // Comandos de admins via linguagem natural
          if (isAdmin) {
            const adminAction = await detectAdminCommand(body, role, meta, recentContext)
            if (adminAction) {
              await executeAction(sock, adminAction, msg.key.remoteJid, meta, senderJid, false)
            }
          }

          // Targets mencionados na mensagem (excluindo o bot)
          const targetsToMention = mentioned.filter(j => j.split('@')[0].split(':')[0] !== botNum)
          const allMentions = [...new Set([senderJid, ...targetsToMention])]

          await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
          const reply = await askOrbis(body, msg.key.remoteJid, meta)

          // Processar @todos e resolver @Nome → JIDs
          let finalText = reply
          let allMentionsResolved = [...allMentions]
          const participants = meta.participants || []

          if (/@todos/i.test(reply)) {
            const todosText = participants.map(p => `@${getName(p.id, meta)}`).join(' ')
            finalText = finalText.replace(/@todos/gi, todosText)
            allMentionsResolved = [...new Set([...allMentionsResolved, ...participants.map(p => p.id)])]
          }

          for (const p of participants) {
            const name = getName(p.id, meta)
            if (!name || name === p.id.split('@')[0]) continue
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            if (new RegExp(`@${escaped}`, 'gi').test(finalText) && !allMentionsResolved.includes(p.id)) {
              allMentionsResolved.push(p.id)
            }
          }

          await sock.sendMessage(msg.key.remoteJid, {
            text: finalText,
            mentions: allMentionsResolved,
            quoted: msg
          })
        } catch (err) {
          logger.error(`Erro na IA: ${err.message}`)
        }
      }
    }
  })

  sock.ev.on('group-participants.update', async (event) => {
    await handleGroupEvents(sock, [event])
  })
}

startOrbis()
