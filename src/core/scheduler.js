import supabase from '../core/database.js'
import { askOrbis } from './ai.js'
import { getGroupContext } from './ai.js'
import logger from './logger.js'

let sockRef = null

export function initScheduler(sock) {
  sockRef = sock
  // Verificar a cada minuto
  setInterval(() => checkSchedules(), 60000)
  // Resumo diário — verificar a cada hora
  setInterval(() => checkDailySummaries(), 3600000)
}

async function checkSchedules() {
  if (!sockRef) return
  const { data } = await supabase
    .from('schedules')
    .select('*')
    .eq('active', true)

  if (!data?.length) return
  const now = new Date()

  for (const s of data) {
    try {
      if (!shouldRun(s.cron_expr, s.last_run, now)) continue
      await sockRef.sendMessage(s.group_id, { text: `📢 *Mensagem agendada:*\n\n${s.message}` })
      await supabase.from('schedules').update({ last_run: now.toISOString() }).eq('id', s.id)
    } catch (err) {
      logger.warn(`Agendamento erro: ${err.message}`)
    }
  }
}

// cron_expr simples: "HH:MM" diário, "MON-FRI HH:MM", "DAILY HH:MM"
function shouldRun(expr, lastRun, now) {
  const lastRunDate = lastRun ? new Date(lastRun) : null
  // Evitar executar mais de uma vez por minuto
  if (lastRunDate && (now - lastRunDate) < 55000) return false

  const parts = expr.trim().toUpperCase().split(' ')

  if (parts[0] === 'DAILY' || /^\d{2}:\d{2}$/.test(parts[0])) {
    const time = parts[0] === 'DAILY' ? parts[1] : parts[0]
    const [h, m] = time.split(':').map(Number)
    return now.getHours() === h && now.getMinutes() === m
  }

  if (['MON-FRI', 'WEEKDAYS'].includes(parts[0])) {
    const day = now.getDay()
    if (day === 0 || day === 6) return false
    const [h, m] = parts[1].split(':').map(Number)
    return now.getHours() === h && now.getMinutes() === m
  }

  return false
}

async function checkDailySummaries() {
  if (!sockRef) return
  const now = new Date()
  const { data: groups } = await supabase
    .from('groups')
    .select('whatsapp_group_id, name, daily_summary_hour')
    .eq('daily_summary_enabled', true)

  if (!groups?.length) return

  for (const g of groups) {
    const hour = g.daily_summary_hour ?? 0
    if (now.getHours() !== hour) continue
    try {
      await sendDailySummary(g.whatsapp_group_id, g.name)
    } catch (err) {
      logger.warn(`Resumo diário erro: ${err.message}`)
    }
  }
}

export async function sendDailySummary(groupId, groupName) {
  if (!sockRef) return
  const ctx = getGroupContext(groupId)
  if (!ctx.length) return

  const summary = await askOrbis(
    `Faz um resumo breve do que foi discutido hoje neste grupo. Sê conciso, máximo 5 pontos principais. Não uses markdown.`,
    `summary_${groupId}`,
    null
  )

  await sockRef.sendMessage(groupId, {
    text: `📋 *Resumo do dia — ${groupName || 'Grupo'}*\n\n${summary}`
  })
}
