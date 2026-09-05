import supabase from '../core/database.js'

const LEVELS = [
  { level: 1, name: 'Novato', min: 0 },
  { level: 2, name: 'Membro', min: 50 },
  { level: 3, name: 'Activo', min: 150 },
  { level: 4, name: 'Veterano', min: 350 },
  { level: 5, name: 'Elite', min: 700 },
]

export function getLevelInfo(points) {
  let current = LEVELS[0]
  for (const l of LEVELS) { if (points >= l.min) current = l }
  const next = LEVELS.find(l => l.min > points)
  return { ...current, next, pointsToNext: next ? next.min - points : 0 }
}

export async function addPoints(groupId, userId, points) {
  const { data } = await supabase
    .from('reputation')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single()

  if (!data) {
    await supabase.from('reputation').insert({
      group_id: groupId, user_id: userId,
      points, messages_count: 1, level: 1
    })
    return { points, levelUp: false }
  }

  const oldLevel = getLevelInfo(data.points).level
  const newPoints = data.points + points
  const newLevel = getLevelInfo(newPoints).level

  await supabase.from('reputation').update({
    points: newPoints,
    messages_count: data.messages_count + 1,
    level: newLevel,
    updated_at: new Date().toISOString()
  }).eq('group_id', groupId).eq('user_id', userId)

  return { points: newPoints, levelUp: newLevel > oldLevel, newLevel, levelInfo: getLevelInfo(newPoints) }
}

export async function penalizePoints(groupId, userId, points = 20) {
  const { data } = await supabase
    .from('reputation')
    .select('points, violations')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single()

  const current = data?.points || 0
  const newPoints = Math.max(0, current - points)
  await supabase.from('reputation').upsert({
    group_id: groupId, user_id: userId,
    points: newPoints,
    violations: (data?.violations || 0) + 1,
    updated_at: new Date().toISOString()
  }, { onConflict: 'group_id,user_id' })
}

export async function getReputation(groupId, userId) {
  const { data } = await supabase
    .from('reputation')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single()
  if (!data) return { points: 0, level: 1, messages_count: 0, violations: 0, levelInfo: getLevelInfo(0) }
  return { ...data, levelInfo: getLevelInfo(data.points) }
}

export async function getLeaderboard(groupId, limit = 10) {
  const { data } = await supabase
    .from('reputation')
    .select('*')
    .eq('group_id', groupId)
    .order('points', { ascending: false })
    .limit(limit)
  return data || []
}
