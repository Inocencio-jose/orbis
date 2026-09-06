import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import logger from './src/core/logger.js'
import config from './config/index.js'
import { handleCommand } from './src/commands/index.js'
import { handleGroupEvents } from './src/groups/events.js'
import { autoModerate } from './src/moderation/automod.js'
import { askOrbis, observeMessage, getGroupContext } from './src/core/ai.js'
import { detectAdminCommand, executeAction } from './src/core/actions.js'
import { getRole } from './src/permissions/index.js'
import { getName, cacheName } from './src/utils/notify.js'
import { saveSessionToSupabase, loadSessionFromSupabase, clearSessionFromSupabase } from './src/core/session.js'
import { initScheduler } from './src/core/scheduler.js'
import { addPoints } from './src/moderation/reputation.js'
import { getGroupConfig } from './src/moderation/warnings.js'
import { isQuietHours } from './src/moderation/detector.js'

import './src/commands/general.js'
import './src/commands/moderation.js'
import './src/commands/reports.js'
import './src/commands/config.js'
import './src/commands/instructions.js'
import './src/commands/ai_commands.js'
import './src/commands/extra_commands.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'orbis2024'

const commandRateLimit = new Map()
function isRateLimited(userId) {
  const now = Date.now()
  const entry = commandRateLimit.get(userId) || { count: 0, reset: now + 5000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 5000 }
  entry.count++
  commandRateLimit.set(userId, entry)
  return entry.count > 3
}

// Delay humano: espera entre 1.5s e 4s antes de responder
function humanDelay() {
  const ms = 1500 + Math.random() * 2500
  return new Promise(r => setTimeout(r, ms))
}
const metaCache = new Map()
async function getGroupMeta(sock, groupId) {
  const cached = metaCache.get(groupId)
  if (cached && Date.now() - cached.ts < 120000) return cached.data
  try {
    const data = await sock.groupMetadata(groupId)
    metaCache.set(groupId, { data, ts: Date.now() })
    return data
  } catch { return null }
}

// Processar uma mensagem de grupo de forma isolada (erros nao afectam outras)
async function processGroupMessage(sock, msg) {
  const groupId = msg.key.remoteJid
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

  const meta = await getGroupMeta(sock, groupId)
  if (!meta) return

  const senderJid = msg.key.participant || ''
  const senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]

  if (msg.pushName && senderJid) {
    const found = meta.participants.find(p => p.id === senderJid)
    const phone = found?.phoneNumber ? String(found.phoneNumber).replace(/\D/g, '') : null
    cacheName(senderJid, msg.pushName, phone)
  }

  const senderName = getName(senderJid, meta)
  const admins = meta.participants.filter(p => p.admin).map(p =>
    p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  )
  const role = getRole(senderNum, admins, config.ownerLid)
  const isAdmin = role === 'admin' || role === 'owner'

  const groupCfg = await getGroupConfig(groupId).catch(() => null)
  const quietMode = !isAdmin && isQuietHours(groupCfg)

  const blocked = await autoModerate(sock, msg)
  if (blocked) return

  if (body.trim()) observeMessage(groupId, senderName, body)

  // Reputacao — pontos por mensagem
  if (!isAdmin && body.trim() && groupCfg?.reputation_enabled) {
    const result = await addPoints(groupId, senderNum, 2).catch(() => null)
    if (result?.levelUp) {
      await sock.sendMessage(groupId, {
        text: `🎉 ${senderName} subiu para nível ${result.newLevel} — *${result.levelInfo.name}*! ⭐`
      }).catch(() => {})
    }
  }

  if (body.startsWith(config.prefix)) {
    if (isRateLimited(senderJid)) {
      await sock.sendMessage(groupId, { text: '⏳ Estás a enviar comandos demasiado rápido.' }).catch(() => {})
      return
    }
    await handleCommand(sock, msg)
    return
  }

  if (quietMode) return

  const botJid = sock.user?.id
  const botNum = botJid?.split(':')[0]
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  const isMentioned = botNum && mentioned.some(j => j.split('@')[0].split(':')[0] === botNum)
  const nameTriggered = /\borbis\b/i.test(body)
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
  const isReplyToBot = botNum && quotedParticipant && quotedParticipant.includes(botNum)

  if ((isMentioned || nameTriggered || isReplyToBot) && body.trim()) {
    logger.info(`IA activada por ${senderName} (${role})`)

    if (isAdmin) {
      const recentContext = getGroupContext(groupId)
      const adminAction = await detectAdminCommand(body, role, meta, recentContext).catch(() => null)
      if (adminAction) await executeAction(sock, adminAction, groupId, meta, senderJid, false).catch(() => {})
    }

    const targetsToMention = mentioned.filter(j => j.split('@')[0].split(':')[0] !== botNum)
    const allMentions = [...new Set([senderJid, ...targetsToMention])]

    await sock.sendPresenceUpdate('composing', groupId).catch(() => {})
    await humanDelay()
    const reply = await askOrbis(body, groupId, meta)

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

    await sock.sendMessage(groupId, { text: finalText, mentions: allMentionsResolved, quoted: msg }).catch(() => {})
  }
}

let currentQR = null
let connectionStatus = 'disconnected'
let sockInstance = null
let reconnecting = false
let reconnectAttempts = 0
const startTime = Date.now()

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

// Autenticação simples para o dashboard
function authMiddleware(req, res, next) {
  const pass = req.query.pass || req.headers['x-dashboard-pass']
  if (pass === DASHBOARD_PASS) return next()
  // Sem password — redireciona para login
  if (req.path === '/' || req.path === '/dashboard') {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orbis — Login</title>
    <style>*{box-sizing:border-box}body{font-family:sans-serif;background:#1e1b4b;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .box{background:#fff;border-radius:16px;padding:40px;width:320px;text-align:center}
    h2{color:#4338ca;margin-bottom:24px}input{width:100%;padding:10px 14px;border:1px solid #c7d2fe;border-radius:10px;font-size:15px;margin-bottom:16px}
    button{width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600}
    button:hover{background:#4f46e5}</style></head>
    <body><div class="box"><h2>🔵 Orbis</h2>
    <form onsubmit="event.preventDefault();window.location='/?pass='+document.getElementById('p').value">
    <input id="p" type="password" placeholder="Password do dashboard" autofocus/>
    <button type="submit">Entrar</button></form></div></body></html>`)
  }
  res.status(401).json({ error: 'Não autorizado' })
}

app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    connected: connectionStatus === 'connected',
    phone: sockInstance?.user?.id?.split(':')[0] || null
  })
})

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

app.post('/api/pair', async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'Número obrigatório' })
  if (connectionStatus === 'connected') return res.json({ connected: true })
  if (!sockInstance) return res.status(503).json({ error: 'Bot ainda não iniciado' })
  // O pairing code só funciona enquanto o socket ainda não autenticou (sem sessão)
  // e o socket tem de estar em estado 'connecting' com QR gerado
  if (!currentQR && connectionStatus !== 'connecting') {
    return res.status(400).json({ error: 'Bot não está em modo de emparelhamento. Usa o QR ou faz logout primeiro.' })
  }
  try {
    const num = phone.replace(/\D/g, '')
    const code = await sockInstance.requestPairingCode(num)
    res.json({ code: code?.match(/.{1,4}/g)?.join('-') || code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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

app.post('/api/broadcast', async (req, res) => {
  const { group_ids, type, message, question, options } = req.body
  if (!group_ids?.length) return res.status(400).json({ error: 'group_ids obrigatorio' })
  if (!sockInstance || connectionStatus !== 'connected') return res.status(503).json({ error: 'Bot nao conectado' })
  const results = []
  for (const gid of group_ids) {
    try {
      if (type === 'sondagem' && question && options?.length >= 2) {
        await sockInstance.sendMessage(gid, { poll: { name: question, values: options, selectableCount: 1 } })
      } else if (type === 'anuncio' && message) {
        await sockInstance.sendMessage(gid, { text: `📢 *AVISO IMPORTANTE*\n\n${message}\n\n— _Administração_` })
      } else if (message) {
        await sockInstance.sendMessage(gid, { text: message })
      } else {
        results.push({ gid, ok: false, error: 'payload invalido' }); continue
      }
      results.push({ gid, ok: true })
    } catch (err) {
      results.push({ gid, ok: false, error: err.message })
    }
    // Delay entre grupos no broadcast para nao parecer spam
    if (group_ids.length > 1) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000))
  }
  res.json({ results })
})

// Logout — limpa sessão
app.post('/api/logout', async (req, res) => {
  try {
    if (sockInstance) { sockInstance.ev.removeAllListeners(); await sockInstance.logout().catch(() => {}) }
  } catch {}
  await clearSessionFromSupabase()
  connectionStatus = 'disconnected'
  currentQR = null
  sockInstance = null
  reconnecting = false
  res.json({ ok: true })
  setTimeout(() => startOrbis(), 1000)
})

// Dashboard com autenticação
app.get('/', authMiddleware, (req, res) => res.sendFile(join(__dirname, 'dashboard.html')))
app.get('/logo.png', (req, res) => res.sendFile(join(__dirname, 'logo.png')))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => logger.info(`API disponível em http://localhost:${PORT}`))
// ─────────────────────────────────────────────────────────────────────────────

async function startOrbis() {
  if (reconnecting) return
  reconnecting = true

  await loadSessionFromSupabase()

  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    mobile: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    fireInitQueries: false,
  })

  sockInstance = sock
  connectionStatus = 'connecting'
  currentQR = null
  reconnecting = false

  sock.ev.on('creds.update', async () => {
    await saveCreds()
    await saveSessionToSupabase()
  })

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
      reconnectAttempts = 0
      logger.success('Orbis conectado ao WhatsApp ✅')
      saveSessionToSupabase()
      initScheduler(sock)
    }
    if (connection === 'close') {
      currentQR = null
      connectionStatus = 'disconnected'
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      logger.warn(`Conexão encerrada (${code}). Reconectar: ${shouldReconnect}`)
      if (shouldReconnect) {
        reconnectAttempts++
        // Backoff exponencial: 4s, 8s, 16s, max 60s
        const delay = Math.min(4000 * Math.pow(2, reconnectAttempts - 1), 60000)
        logger.info(`A reconectar em ${delay / 1000}s (tentativa ${reconnectAttempts})`)
        setTimeout(() => startOrbis(), delay)
      } else {
        clearSessionFromSupabase()
      }
    }
  })

  sock.ev.on('messages.upsert', async (upsert) => {
    const messages = upsert.messages ?? upsert
    const type = upsert.type ?? 'notify'
    if (type !== 'notify') return

    // Processar todas as mensagens em paralelo — erros isolados por mensagem
    await Promise.allSettled(messages.map(async (msg) => {
      try {
        if (!msg.message || msg.key.fromMe) return

        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
        const isGroup = msg.key.remoteJid?.endsWith('@g.us')

        if (!isGroup) {
          if (body.trim()) {
            await humanDelay()
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid).catch(() => {})
            const reply = await askOrbis(body, msg.key.remoteJid, null)
            await sock.sendMessage(msg.key.remoteJid, { text: reply, quoted: msg }).catch(() => {})
          }
          return
        }

        await processGroupMessage(sock, msg)
      } catch (err) {
        logger.error(`Erro ao processar mensagem: ${err.message}`)
      }
    }))
  })

  sock.ev.on('group-participants.update', async (event) => {
    // Invalidar cache do grupo quando participantes mudam
    metaCache.delete(event.id)
    await handleGroupEvents(sock, [event])
  })
}

startOrbis()
