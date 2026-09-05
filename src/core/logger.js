import fs from 'fs'

const logsDir = './logs'

if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)

function timestamp() {
  return new Date().toISOString()
}

function write(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}`
  console.log(line)
  fs.appendFileSync(`${logsDir}/orbis.log`, line + '\n')
}

export default {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
  success: (msg) => write('SUCCESS', msg),
}
