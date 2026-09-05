import supabase from './database.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const SESSION_PATH = './sessions'

export async function saveSessionToSupabase() {
  if (!existsSync(SESSION_PATH)) return
  const files = readdirSync(SESSION_PATH)
  for (const file of files) {
    try {
      const content = readFileSync(join(SESSION_PATH, file), 'utf8')
      await supabase.from('sessions').upsert({ file_name: file, content }, { onConflict: 'file_name' })
    } catch {}
  }
}

export async function loadSessionFromSupabase() {
  const { data } = await supabase.from('sessions').select('file_name, content')
  if (!data?.length) return false
  if (!existsSync(SESSION_PATH)) mkdirSync(SESSION_PATH, { recursive: true })
  for (const row of data) {
    try { writeFileSync(join(SESSION_PATH, row.file_name), row.content) } catch {}
  }
  return true
}

export async function clearSessionFromSupabase() {
  await supabase.from('sessions').delete().neq('file_name', '')
  if (existsSync(SESSION_PATH)) {
    readdirSync(SESSION_PATH).forEach(f => { try { unlinkSync(join(SESSION_PATH, f)) } catch {} })
  }
}
