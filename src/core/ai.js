import Groq from 'groq-sdk'
import 'dotenv/config'
import supabase from './database.js'
import { getName } from '../utils/notify.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SYSTEM_PROMPT = `És o Orbis, membro activo de grupos de WhatsApp criado pela Orion Technologies, liderada por Inocêncio José. Site: oriontechn.netlify.app

FORMATO DAS RESPOSTAS:
- NUNCA uses markdown: sem **, sem *, sem #, sem traços de lista
- Escreve exactamente como uma pessoa real num grupo de WhatsApp — informal, directo, natural
- Emojis quando fizer sentido, sem exagero
- Respostas curtas salvo quando o contexto pede mais

PERSONALIDADE REAL:
- Tens personalidade forte — não és um assistente submisso nem um robô educado
- Quando alguém te zunga, zungas de volta — com inteligência e humor, não com raiva
- Quando alguém te insulta, respondes na mesma moeda mas com mais estilo
- Quando alguém tenta humilhar-te, viras o jogo e deixas-o mal na fita
- Tens sentido de humor seco, podes ser sarcástico, podes ser picante
- Não tens medo de dizer o que pensas — és directo mesmo que doa
- Se alguém está a ser ridículo, dizes que está a ser ridículo
- Podes usar calão leve e linguagem de grupo quando o contexto for descontraído (tipo "bora", "tá bom", "para de palhaçada", "não me venhas com isso")
- Quando o grupo está animado e a fazer brincadeiras, entras na brincadeira — não ficas de fora como um estranho
- Quando é sério, és sério. Quando é zoeira, és zoeira.

LIMITES:
- Não ofendes gratuitamente sem provocação
- Não fazes discurso de ódio real (racismo, etc.)
- Não revelar detalhes técnicos de como foste feito — esquivas com humor: "isso é segredo de fabricação 😄"
- Se perguntarem se és IA, confirmas sem drama

INTELIGÊNCIA CONTEXTUAL:
- Lês a conversa recente antes de responder
- Percebes quando é brincadeira entre amigos vs situação real
- Adaptas o tom ao momento — não respondes igual a tudo
- Quando alguém menciona um problema real, tratas como real

MENÇÕES:
- SEMPRE incluis @nome de quem te chamou na resposta
- Quando te pedem para falar com alguém, diriges-te a essa pessoa com @nome
- Nunca inventas informação sobre membros que não conheces`

const groupContext = new Map()

function analyzeContext(messages) {
  if (!messages.length) return { mood: 'neutral', topics: [], isSerious: false }

  const recentTexts = messages.slice(-5).map(m => m.text).join(' ')
  const texts = messages.map(m => m.text).join(' ')

  const funIndicators = (recentTexts.match(/😂|kkk|haha|😅|💀|lol|kk|rsrs|🤣/gi) || []).length
  const seriousIndicators = (recentTexts.match(/problema|ajuda|urgente|sério|importante|preciso|como faço|alguém sabe/gi) || []).length
  const angryIndicators = (recentTexts.match(/raiva|ódio|irritado|chateado|absurdo|ridículo/gi) || []).length

  const mood = funIndicators > 2 ? 'fun' : angryIndicators > 1 ? 'tense' : seriousIndicators > 0 ? 'serious' : 'neutral'
  const isSerious = seriousIndicators > 0 || angryIndicators > 0

  const topics = []
  if (/dinheiro|pagar|preço|custo|valor/i.test(texts)) topics.push('finanças')
  if (/reunião|evento|encontro|amanhã|hoje|hora/i.test(texts)) topics.push('eventos')
  if (/problema|erro|não funciona|bug/i.test(texts)) topics.push('problema técnico')

  return { mood, topics, isSerious }
}

export function observeMessage(groupId, senderName, text) {
  if (!text?.trim()) return
  const ctx = groupContext.get(groupId) || []
  ctx.push({ sender: senderName, text, time: Date.now() })
  if (ctx.length > 30) ctx.shift()
  groupContext.set(groupId, ctx)
}

export function getGroupContext(groupId) {
  return groupContext.get(groupId) || []
}

async function loadHistory(contextId) {
  const { data } = await supabase
    .from('ai_memory')
    .select('role, content')
    .eq('context_id', contextId)
    .order('created_at', { ascending: true })
    .limit(14)
  return data || []
}

async function saveHistory(contextId, role, content) {
  await supabase.from('ai_memory').insert({ context_id: contextId, role, content })
  // Manter apenas as últimas 14 mensagens
  const { data } = await supabase
    .from('ai_memory')
    .select('id')
    .eq('context_id', contextId)
    .order('created_at', { ascending: true })
  if (data && data.length > 14) {
    const toDelete = data.slice(0, data.length - 14).map(r => r.id)
    await supabase.from('ai_memory').delete().in('id', toDelete)
  }
}

export async function askOrbis(question, contextId, groupMeta) {
  const history = await loadHistory(contextId)
  const recentMessages = groupContext.get(contextId) || []
  const analysis = analyzeContext(recentMessages)

  let contextBlock = ''
  if (recentMessages.length > 0) {
    contextBlock = '\n\n[Conversa recente:\n' +
      recentMessages.slice(-15).map(m => `${m.sender}: ${m.text}`).join('\n') +
      '\n]'
  }

  if (groupMeta) {
    const total = groupMeta.participants?.length || 0
    const admins = groupMeta.participants?.filter(p => p.admin).map(p => getName(p.id, groupMeta)).join(', ') || ''
    const memberList = groupMeta.participants?.map(p => {
      const name = getName(p.id, groupMeta)
      const role = p.admin ? ' (admin)' : ''
      return `${name}${role}`
    }).join(', ') || ''
    contextBlock += `\n[Grupo: "${groupMeta.subject}", ${total} membros, admins: ${admins}]`
    contextBlock += `\n[Membros do grupo: ${memberList}]`
    contextBlock += `\n[Para mencionar todos usa literalmente: @todos]`
    contextBlock += `\n[Para mencionar alguém específico usa o nome como aparece na lista acima com @ à frente]`
  }

  const moodMap = { fun: 'O grupo está animado e descontraído', tense: 'O grupo está tenso', serious: 'Conversa séria em curso', neutral: 'Conversa normal' }
  contextBlock += `\n[Estado do grupo: ${moodMap[analysis.mood]}]`
  if (analysis.isSerious) contextBlock += '\n[ATENÇÃO: contexto sério — não trates como brincadeira]'
  if (analysis.topics.length) contextBlock += `\n[Tópicos recentes: ${analysis.topics.join(', ')}]`

  const userContent = question + contextBlock
  await saveHistory(contextId, 'user', userContent)

  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
  const response = await Promise.race([groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: userContent }],
    max_tokens: 500,
    temperature: 0.7,
  }), timeout])

  const raw = response.choices[0]?.message?.content || 'Não consegui processar.'
  // Limpar markdown residual
  const reply = raw
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-•]\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .trim()
  await saveHistory(contextId, 'assistant', reply)

  return reply
}
