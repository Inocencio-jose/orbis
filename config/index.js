import 'dotenv/config'

export default {
  owner: process.env.OWNER_NUMBER,
  ownerLid: process.env.OWNER_LID,
  sessionPath: './sessions',
  prefix: '/',
}
