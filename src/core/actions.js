import Groq from 'groq-sdk'
import 'dotenv/config'
import { getName, getMentionText } from '../utils/notify.js'
import { addWarning, getGroupConfig, ensureGroup, setMuteTimer } from '../moderation/warnings.js'
import { notifyAdmins } from '../utils/notify.js'
import supabase from './database.js'
import logger from './logger.js'
import config from '../../config/index.js'

function isOwner(jid) {
  if (!jid) return false
  const num = jid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
  return num === config.owner || num === config.ownerLid
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─── Histórico de comportamento por utilizador ───────────────────────────────
const behaviorLog = new Map() // key: `groupId:userId` → { offenses: [], lastWarned: ts, strikes: n }

function getBehavior(groupId, userId) {
  const key = `${groupId}:${userId}`
  return behaviorLog.get(key) || { offenses: [], strikes: 0, lastWarned: 0, mutedUntil: 0 }
}

function recordOffense(groupId, userId, type, severity) {
  const key = `${groupId}:${userId}`
  const b = getBehavior(groupId, userId)
  b.offenses.push({ type, severity, ts: Date.now() })
  // Manter só últimas 20 ofensas
  if (b.offenses.length > 20) b.offenses.shift()
  behaviorLog.set(key, b)
  return b
}

function incrementStrike(groupId, userId) {
  const key = `${groupId}:${userId}`
  const b = getBehavior(groupId, userId)
  b.strikes++
  b.lastWarned = Date.now()
  behaviorLog.set(key, b)
  return b.strikes
}

// Ofensas recentes (últimos N ms)
function recentOffenses(groupId, userId, windowMs = 300000) {
  const b = getBehavior(groupId, userId)
  const cutoff = Date.now() - windowMs
  return b.offenses.filter(o => o.ts > cutoff)
}

// ─── Detecção de comportamento tóxico ────────────────────────────────────────

const TOXIC_PATTERNS = {
  // Insultos directos — severidade alta
  insult_high: {
    severity: 'high',
    patterns: [
      /\b(filho\s*da\s*puta|fdp|vai\s*se\s*foder|vsf|sua\s*m[aã]e|corno|viado|puta\s*que\s*pariu|pqp)\b/i,
      /\b(idiota|imbecil|retardado|burro|estúpido|cretino|lixo|inútil)\b/i,
      /\b(merda|porra|caralho|foda.se|foda-se)\b/i,
    ]
  },
  // Ameaças — severidade crítica
  threat: {
    severity: 'critical',
    patterns: [
      /\b(vou\s*te\s*matar|te\s*mato|vou\s*te\s*bater|pancada|porrada|vou\s*atrás)\b/i,
      /\b(cuidado\s*contigo|vai\s*se\s*arrepender|você\s*vai\s*pagar)\b/i,
    ]
  },
  // Conteúdo sexual inapropriado — severidade alta
  sexual: {
    severity: 'high',
    patterns: [
      /\b(sexo|transar|foder|buceta|pau|pica|rola|cu\b|xoxota)\b/i,
    ]
  },
  // Discurso de ódio — severidade crítica
  hate_speech: {
    severity: 'critical',
    patterns: [
      /\b(negro\s*de\s*merda|macaco|judeu\s*de\s*merda|racista|nazista|hitler)\b/i,
    ]
  },
  // Spam/flood de texto — severidade baixa
  spam_text: {
    severity: 'low',
    patterns: [
      /(.)\1{9,}/,                          // caractere repetido 10+ vezes
      /^[A-ZÁÉÍÓÚÀÃÕ\s]{20,}$/,            // tudo maiúsculas longo
    ]
  },
  // Provocação/desrespeito — severidade média
  disrespect: {
    severity: 'medium',
    patterns: [
      /\b(cala\s*a?\s*boca|cale.se|vai\s*embora|ninguém\s*te\s*chamou|intrometido)\b/i,
      /\b(chato|irritante|babaca|otário|palhaço)\b/i,
    ]
  }
}

function analyzeText(text) {
  if (!text?.trim()) return null
  const results = []
  for (const [category, { severity, patterns }] of Object.entries(TOXIC_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        results.push({ category, severity })
        break
      }
    }
  }
  return results.length ? results : null
}

// Severidade numérica para comparação
const SEVERITY_SCORE = { low: 1, medium: 2, high: 3, critical: 4 }

function maxSeverity(detections) {
  return detections.reduce((max, d) =>
    SEVERITY_SCORE[d.severity] > SEVERITY_SCORE[max] ? d.severity : max
  , 'low')
}

// ─── Prompt para comandos de admins ──────────────────────────────────────────

const ADMIN_COMMAND_PROMPT = `És o Orbis, assistente de moderação. Um admin ou dono pediu-te para executar uma acção.

Retorna SEMPRE JSON válido:
{
  "action": "<acção ou null>",
  "target": "<JID exacto do membro alvo ou null>",
  "reason": "<motivo claro>",
  "duration": "<ex: 10m, 1h, 2d ou null>",
  "message": "<texto para o grupo ou null>",
  "poll_question": "<pergunta ou null>",
  "poll_options": ["op1","op2"] ou null,
  "confidence": <0.0 a 1.0>
}

Acções: "warn", "kick", "ban", "mute", "unmute", "promote", "demote", "mention_all", "lock", "unlock", "announce", "poll"

Regras:
- Só interpretas pedidos CLAROS e DIRECTOS de admins/owner
- O target deve ser o JID exacto da lista de membros fornecida
- Se o pedido for ambíguo ou o alvo não for identificável, action = null
- confidence abaixo de 0.8 → action = null
- Nunca interpretas brincadeiras como comandos reais`

// ─── Prompt para análise de comportamento autónoma ───────────────────────────

const BEHAVIOR_ANALYSIS_PROMPT = `És o Orbis, sistema de moderação autónoma. Analisas o comportamento de um membro num grupo.

Retorna SEMPRE JSON válido:
{
  "is_violation": <true ou false>,
  "severity": "<low|medium|high|critical>",
  "category": "<tipo de violação>",
  "recommended_action": "<warn|mute|kick|ban|null>",
  "mute_duration": "<ex: 10m, 30m, 1h ou null>",
  "reason": "<descrição clara do problema>",
  "confidence": <0.0 a 1.0>
}

Critérios de violação:
- LOW: linguagem levemente inapropriada, provocação leve → warn
- MEDIUM: insultos, desrespeito claro, spam persistente → warn ou mute curto
- HIGH: insultos graves, assédio, conteúdo sexual → mute ou kick
- CRITICAL: ameaças, discurso de ódio, conteúdo ilegal → kick ou ban

Regras CRÍTICAS:
- Só marcas is_violation = true se tiveres CERTEZA — threshold alto
- Analisa o contexto completo — brincadeiras entre amigos não são violações
- Ironia e sarcasmo não são violações a menos que sejam claramente ofensivos
- confidence abaixo de 0.85 → is_violation = false
- Em caso de dúvida, is_violation = false`

// ─── Detecção de intenção de comando (admin) ─────────────────────────────────

const COMMAND_INTENT_KEYWORDS = /\b(expulsa|bane|bani|kick|warn|avisa|muta|silencia|desmuta|tranca|abre o grupo|anuncia|sondagem|enquete|chama todos|menciona todos|promove|despromove|promover|despromover)\b/i

export async function detectAdminCommand(body, senderRole, groupMeta, recentContext) {
  // Só processa admins/owner
  if (senderRole !== 'admin' && senderRole !== 'owner') return null
  // Só processa se houver keywords de comando
  if (!COMMAND_INTENT_KEYWORDS.test(body)) return null

  const memberList = groupMeta?.participants?.map(p => ({
    jid: p.id,
    name: p.notify || p.name || p.id.split('@')[0],
    isAdmin: !!p.admin
  })) || []

  const contextStr = recentContext?.slice(-8).map(m => `${m.sender}: ${m.text}`).join('\n') || ''

  const prompt = `Contexto recente:\n${contextStr}\n\nPedido do admin: "${body}"\nMembros disponíveis: ${JSON.stringify(memberList.slice(0, 40))}\n\nInterpreta e retorna o JSON.`

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: ADMIN_COMMAND_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 250,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const parsed = JSON.parse(response.choices[0]?.message?.content)
    if (!parsed.action || parsed.confidence < 0.8) return null
    return parsed
  } catch (err) {
    logger.warn(`detectAdminCommand falhou: ${err.message}`)
    return null
  }
}

// ─── Análise autónoma de comportamento ───────────────────────────────────────

export async function analyzeUserBehavior(groupId, senderJid, senderName, body, groupMeta, recentContext) {
  // Owner é imune a qualquer moderação autónoma
  if (isOwner(senderJid)) return null

  // Pré-filtro rápido por padrões locais
  const localDetections = analyzeText(body)
  const recent = recentOffenses(groupId, senderJid, 300000) // últimos 5 min

  // Se não há nada suspeito localmente E não tem histórico recente, ignora
  if (!localDetections && recent.length < 2) return null

  // Se há detecção local de severidade crítica, age imediatamente sem chamar IA
  if (localDetections) {
    const severity = maxSeverity(localDetections)
    if (severity === 'critical') {
      recordOffense(groupId, senderJid, localDetections[0].category, severity)
      return {
        is_violation: true,
        severity: 'critical',
        category: localDetections[0].category,
        recommended_action: 'ban',
        mute_duration: null,
        reason: `Conteúdo crítico detectado: ${localDetections.map(d => d.category).join(', ')}`,
        confidence: 0.95,
        source: 'local'
      }
    }
  }

  // Para casos médios/altos, confirma com IA para evitar falsos positivos
  const contextStr = recentContext?.slice(-12).map(m => `${m.sender}: ${m.text}`).join('\n') || ''
  const behaviorHistory = recent.map(o => `${o.type} (${o.severity})`).join(', ')
  const strikes = getBehavior(groupId, senderJid).strikes

  const prompt = `Membro: "${senderName}"
Mensagem actual: "${body}"
Histórico recente de ofensas (últimos 5min): ${behaviorHistory || 'nenhum'}
Strikes acumulados: ${strikes}
Contexto da conversa:
${contextStr}

Analisa se esta mensagem/comportamento é uma violação das regras do grupo.`

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: BEHAVIOR_ANALYSIS_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const parsed = JSON.parse(response.choices[0]?.message?.content)

    if (!parsed.is_violation || parsed.confidence < 0.85) return null

    // Registar ofensa no histórico local
    recordOffense(groupId, senderJid, parsed.category, parsed.severity)

    // Escalar acção com base em strikes acumulados
    const currentStrikes = getBehavior(groupId, senderJid).strikes
    if (currentStrikes >= 2 && parsed.recommended_action === 'warn') {
      parsed.recommended_action = 'mute'
      parsed.mute_duration = parsed.mute_duration || '15m'
      parsed.reason += ` (reincidente — ${currentStrikes} strikes)`
    }
    if (currentStrikes >= 4 && parsed.recommended_action === 'mute') {
      parsed.recommended_action = 'kick'
      parsed.reason += ` (reincidente grave — ${currentStrikes} strikes)`
    }

    return { ...parsed, source: 'ai' }
  } catch (err) {
    logger.warn(`analyzeUserBehavior falhou: ${err.message}`)
    return null
  }
}

// ─── Executor de acções ───────────────────────────────────────────────────────

export async function executeAction(sock, action, groupId, groupMeta, callerJid, isAutonomous = false) {
  const { action: type, target, reason, duration, mute_duration, message, poll_question, poll_options } = action
  const muteDur = duration || mute_duration

  // Owner é imune a qualquer acção — manual ou autónoma
  if (target && isOwner(target)) {
    logger.warn(`Acção bloqueada: tentativa de ${type} contra o owner (${target})`)
    if (!isAutonomous && callerJid) {
      await sock.sendMessage(groupId, { text: '🛡️ Não é possível executar acções contra o owner.' })
    }
    return
  }

  const prefix = isAutonomous ? '🤖 _[Acção autónoma]_\n' : ''
  logger.info(`${isAutonomous ? '[AUTO]' : '[ADMIN]'} Acção: ${type} | alvo: ${target} | motivo: ${reason}`)

  try {
    switch (type) {

      case 'warn': {
        if (!target) break
        const groupName = groupMeta?.subject || groupId
        const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
        const targetName = getName(target, groupMeta) || targetNum
        const mention = getMentionText(target, groupMeta)
        await ensureGroup(groupId, groupName)
        const cfg = await getGroupConfig(groupId)
        const limit = cfg?.warnings_limit || 3
        const total = await addWarning(groupId, targetNum, reason || 'comportamento inadequado')
        incrementStrike(groupId, target)
        if (total >= limit) {
          await sock.groupParticipantsUpdate(groupId, [target], 'remove')
          await sock.sendMessage(groupId, {
            text: `${prefix}🔨 ${mention} foi removido após atingir ${total}/${limit} avisos.\nMotivo: _${reason}_`,
            mentions: [target]
          })
        } else {
          await sock.sendMessage(groupId, {
            text: `${prefix}⚠️ ${mention} — aviso ${total}/${limit}.\nMotivo: _${reason}_`,
            mentions: [target]
          })
        }
        await notifyAdmins(sock, groupMeta,
          `⚠️ *Aviso ${isAutonomous ? 'automático' : 'manual'} — ${groupName}*\n\n*${targetName}* recebeu aviso ${await import('../moderation/warnings.js').then(m => m.getWarnings(groupId, targetNum))}/${limit}.\nMotivo: _${reason}_`
        )
        break
      }

      case 'kick': {
        if (!target) break
        const mention = getMentionText(target, groupMeta)
        const targetName = getName(target, groupMeta)
        await sock.groupParticipantsUpdate(groupId, [target], 'remove')
        await sock.sendMessage(groupId, {
          text: `${prefix}👢 ${mention} foi expulso.\nMotivo: _${reason || 'decisão da moderação'}_`,
          mentions: [target]
        })
        await notifyAdmins(sock, groupMeta,
          `👢 *Expulsão ${isAutonomous ? 'automática' : ''} — ${groupMeta?.subject}*\n\n*${targetName}* foi expulso.\nMotivo: _${reason}_`
        )
        break
      }

      case 'ban': {
        if (!target) break
        const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
        const targetName = getName(target, groupMeta) || targetNum
        const mention = getMentionText(target, groupMeta)
        await supabase.from('banned_users').insert({
          group_id: groupId, user_id: targetNum, user_jid: target,
          reason: reason || 'ban automático', banned_by: isAutonomous ? 'orbis' : callerJid
        })
        await sock.groupParticipantsUpdate(groupId, [target], 'remove')
        await sock.sendMessage(groupId, {
          text: `${prefix}🔨 ${mention} foi banido.\nMotivo: _${reason}_`,
          mentions: [target]
        })
        await notifyAdmins(sock, groupMeta,
          `🔨 *Ban ${isAutonomous ? 'automático' : ''} — ${groupMeta?.subject}*\n\n*${targetName}* foi banido.\nMotivo: _${reason}_`
        )
        break
      }

      case 'mute': {
        if (!target) break
        const targetNum = target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
        const targetName = getName(target, groupMeta) || targetNum
        const mention = getMentionText(target, groupMeta)
        let durationText = ''
        if (muteDur) {
          const num = parseInt(muteDur)
          const unit = muteDur.slice(-1)
          const multipliers = { m: 60000, h: 3600000, d: 86400000 }
          const ms = num * (multipliers[unit] || 60000)
          durationText = ` por ${muteDur}`
          setMuteTimer(groupId, targetNum, ms, async () => {
            try {
              await sock.sendMessage(groupId, { text: `🔊 ${mention} — mute expirado.`, mentions: [target] })
            } catch {}
          })
        }
        await sock.groupParticipantsUpdate(groupId, [target], 'demote')
        await sock.sendMessage(groupId, {
          text: `${prefix}🔇 ${mention} foi mutado${durationText}.\nMotivo: _${reason || ''}_`,
          mentions: [target]
        })
        await notifyAdmins(sock, groupMeta,
          `🔇 *Mute ${isAutonomous ? 'automático' : ''} — ${groupMeta?.subject}*\n\n*${targetName}* mutado${durationText}.\nMotivo: _${reason}_`
        )
        break
      }

      case 'unmute': {
        if (!target) break
        const mention = getMentionText(target, groupMeta)
        const { clearMuteTimer } = await import('../moderation/warnings.js')
        clearMuteTimer(groupId, target.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0])
        await sock.sendMessage(groupId, { text: `🔊 ${mention} foi desmutado.`, mentions: [target] })
        break
      }

      case 'promote': {
        if (!target) break
        const mention = getMentionText(target, groupMeta)
        await sock.groupParticipantsUpdate(groupId, [target], 'promote')
        await sock.sendMessage(groupId, { text: `👑 ${mention} foi promovido a administrador.`, mentions: [target] })
        break
      }

      case 'demote': {
        if (!target) break
        const mention = getMentionText(target, groupMeta)
        await sock.groupParticipantsUpdate(groupId, [target], 'demote')
        await sock.sendMessage(groupId, { text: `🔒 ${mention} foi despromovido.`, mentions: [target] })
        break
      }

      case 'mention_all': {
        const participants = groupMeta?.participants || []
        const text = participants.map(p => `@${p.notify || p.name || p.id.split('@')[0]}`).join(' ')
        await sock.sendMessage(groupId, {
          text: `📢 ${message || ''}\n\n${text}`,
          mentions: participants.map(p => p.id)
        })
        break
      }

      case 'lock':
        await sock.groupSettingUpdate(groupId, 'announcement')
        await sock.sendMessage(groupId, { text: `🔒 *Grupo trancado.*\n${message || 'Só admins podem enviar mensagens.'}` })
        break

      case 'unlock':
        await sock.groupSettingUpdate(groupId, 'not_announcement')
        await sock.sendMessage(groupId, { text: `🔓 *Grupo aberto.*\n${message || 'Todos podem enviar mensagens.'}` })
        break

      case 'announce':
        if (!message) break
        await sock.sendMessage(groupId, { text: `📢 *AVISO IMPORTANTE*\n\n${message}\n\n— _Administração_` })
        break

      case 'poll':
        if (!poll_question || !poll_options?.length) break
        await sock.sendMessage(groupId, {
          poll: { name: poll_question, values: poll_options, selectableCount: 1 }
        })
        break
    }
  } catch (err) {
    logger.error(`executeAction (${type}) falhou: ${err.message}`)
  }
}
