import config from '../../config/index.js'

const roles = { owner: 5, superadmin: 4, admin: 3, moderator: 2, member: 1, blocked: 0 }

export function getRole(number, groupAdmins = [], ownerLid = '') {
  if (number === config.owner || (ownerLid && number === ownerLid)) return 'owner'
  if (groupAdmins.includes(number)) return 'admin'
  return 'member'
}

export function hasPermission(role, required) {
  return (roles[role] ?? 0) >= (roles[required] ?? 0)
}
