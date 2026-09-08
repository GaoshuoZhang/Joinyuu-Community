/* Mock 数据单一出口 — 所有页面/接口从这里取数，保证跨页一致性 */
import { users } from './users'
import { enterprises } from './enterprises'
import { applications } from './applications'
import { demands } from './demands'
import { projects } from './projects'
import { events } from './events'
import { externalEnterpriseProfiles } from './externalEnterpriseProfiles'
import { experienceRecords, pointsRecords } from './ledgers'
import { goods, pointsRules, redemptionOrders } from './mall'
import { leases, workstationAreas, workstations } from './workstations'
import { reservations, spaces } from './spaces'
import { articles, columns, showcaseRequests } from './contents'

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
  goods,
  redemptionOrders,
  pointsRules,
  workstations,
  workstationAreas,
  leases,
  spaces,
  reservations,
  articles,
  columns,
  showcaseRequests,
}

export {
  users,
  enterprises,
  applications,
  demands,
  projects,
  events,
  externalEnterpriseProfiles,
  experienceRecords,
  pointsRecords,
  goods,
  redemptionOrders,
  pointsRules,
  workstations,
  workstationAreas,
  leases,
  spaces,
  reservations,
  articles,
  columns,
  showcaseRequests,
}
