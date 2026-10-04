export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

export function getStatisticsKeys(accountId = '') {
  const suffix = accountId.trim() ? `:${accountId.trim()}` : ''
  return {
    today: `${todayKey}${suffix}`,
    history: `${statisticsKey}${suffix}`,
  }
}
