import { useConf } from '@/composables/conf'

export interface AmapError {
  status: string
  info: string
  infocode: string
}

export interface AmapGeocode {
  status: string
  info: string
  infocode: string
  count: string
  geocodes: Array<{
    formatted_address: string
    country: string
    province: string
    citycode: string
    city: string
    district: string
    township: Array<any>
    neighborhood: {
      name: Array<any>
      type: Array<any>
    }
    building: {
      name: Array<any>
      type: Array<any>
    }
    adcode: string
    street: Array<any>
    number: Array<any>
    location: string
    level: string
  }>
}
export interface AmapDistance {
  status: string
  info: string
  infocode: string
  count: string
  results: Array<{
    origin_id: string
    dest_id: string
    distance: string
    duration: string
  }>
}

export async function amapGeocode(
  address: string,
): Promise<AmapGeocode['geocodes'][number] | undefined> {
  const { formData } = useConf()
  const res = (await fetch(
    `https://restapi.amap.com/v3/geocode/geo?address=${address}&output=JSON&Key=${formData.amap.key}`,
  ).then((response) => response.json())) as AmapGeocode | AmapError
  if (res.status !== '1' || !('geocodes' in res)) {
    throw new Error(res.info)
  }
  return res.geocodes?.[0]
}

async function fetchDistance(
  origins: string,
  destination: string,
  type: number,
  key: string,
): Promise<AmapDistance | AmapError> {
  return fetch(
    `https://restapi.amap.com/v3/distance?origins=${origins}&destination=${destination}&type=${type}&output=JSON&Key=${key}`,
  ).then((r) => r.json())
}

function extractResult(res: AmapDistance | AmapError) {
  if (res.status === '1' && 'results' in res) {
    return {
      ok: true,
      distance: Number(res.results?.[0]?.distance),
      duration: Number(res.results?.[0]?.duration),
    }
  }
  return { ok: false, distance: 0, duration: 0 }
}

export async function amapDistance(destination: string) {
  const { formData } = useConf()
  const { origins, key } = formData.amap

  const [res0, res1, res3] = await Promise.all([
    fetchDistance(origins, destination, 0, key),
    fetchDistance(origins, destination, 1, key),
    fetchDistance(origins, destination, 3, key),
  ])

  return {
    straight: extractResult(res0),
    driving: extractResult(res1),
    walking: extractResult(res3),
  }
}
