import type { FormData } from '@/types/formData'

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 筛选相关配置的稳定指纹；改条件后旧的 warn 缓存失效。 */
export function buildFilterFingerprint(form: FormData): string {
  const payload = {
    jobTitle: form.jobTitle,
    company: form.company,
    jobContent: form.jobContent,
    hrPosition: form.hrPosition,
    jobAddress: form.jobAddress,
    salaryRange: form.salaryRange,
    companySizeRange: form.companySizeRange,
    activityFilter: form.activityFilter.value,
    friendStatus: form.friendStatus.value,
    bossGoldMedalHr: form.bossGoldMedalHr.value,
    goldHunterFilter: form.goldHunterFilter.value,
    sameCompanyFilter: form.sameCompanyFilter.value,
    sameHrFilter: form.sameHrFilter.value,
    amap: {
      enable: form.amap.enable,
      origins: form.amap.origins,
      straightDistance: form.amap.straightDistance,
      drivingDistance: form.amap.drivingDistance,
      drivingDuration: form.amap.drivingDuration,
      walkingDistance: form.amap.walkingDistance,
      walkingDuration: form.amap.walkingDuration,
    },
    aiFiltering: {
      enable: form.aiFiltering.enable,
      score: form.aiFiltering.score,
      prompt: form.aiFiltering.prompt,
    },
  }
  return fnv1a(JSON.stringify(payload))
}
