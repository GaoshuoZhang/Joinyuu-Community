/* Mock 数据单一出口 — 所有页面/接口从这里取数，保证跨页一致性 */
import { users } from './users'
import { enterprises } from './enterprises'
import { applications } from './applications'
import { demands } from './demands'
import { projects } from './projects'
import { events } from './events'
import { externalEnterpriseProfiles } from './externalEnterpriseProfiles'
import { experienceRecords, pointsRecords } from './ledgers'

export const DB = {
  users,
  enterprises,
  applications,
  demands,
  projects,
  events,
  externalEnterpriseProfiles,
  experienceRecords,
  pointsRecords,
}

export { users, enterprises, applications, demands, projects, events, externalEnterpriseProfiles, experienceRecords, pointsRecords }
