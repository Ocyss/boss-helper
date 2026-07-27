import { counter } from '@/message'

// 通知
export async function notification(
  message: string,
  options?: Pick<
    Omit<Browser.notifications.NotificationCreateOptions, 'iconUrl' | 'message'>,
    'type' | 'title'
  >,
) {
  return counter.notify({
    ...options,
    title: options?.title ?? 'Boss直聘批量投简历',
    message: message,
    type: options?.type ?? 'basic',
    iconUrl:
      'https://img.bosszhipin.com/beijin/mcs/banner/3e9d37e9effaa2b6daf43f3f03f7cb15cfcd208495d565ef66e7dff9f98764da.jpg',
  })
}

// 动画
export function animate({
  duration,
  draw,
  timing,
  end,
  callId,
  isStopped = () => false,
}: {
  duration: number
  draw: (progress: number) => void
  timing: (timeFraction: number) => number
  callId: (id: number) => void
  end?: () => void
  isStopped?: () => boolean
}) {
  const start = performance.now()

  callId(
    requestAnimationFrame(function animate(time) {
      let timeFraction = (time - start) / duration
      if (timeFraction > 1) timeFraction = 1

      const progress = timing(timeFraction)

      draw(progress)

      if (timeFraction < 1 && !isStopped()) {
        callId(requestAnimationFrame(animate))
      } else if (end) {
        end()
      }
    }),
  )
}
let delayLoadId: number | undefined

// 延迟
export async function delay(s: number, isStopped?: () => boolean) {
  return new Promise<void>((resolve) => {
    loader({ ms: s * 1000, isStopped, onDone: resolve })
    setTimeout(resolve, s * 1000)
  })
}

// 加载进度条
export function loader({
  ms = 10000,
  color = '#54f98d',
  onDone = () => {},
  isStopped = () => false,
}: {
  ms?: number
  color?: string
  onDone?: () => void
  isStopped?: () => boolean
}) {
  let load = document.querySelector<HTMLDivElement>('#loader')
  if (!load) {
    const l = document.createElement('div')
    l.id = 'loader'
    document.querySelector('#header')?.appendChild(l)
    load = l
  }
  load.style.background = color
  if (delayLoadId != null) {
    cancelAnimationFrame(delayLoadId)
    delayLoadId = undefined
  }
  animate({
    duration: ms,
    callId(id) {
      delayLoadId = id
    },
    timing(timeFraction) {
      return timeFraction
    },
    draw(progress) {
      load.style.width = `${progress * 100}%`
    },
    end() {
      load.style.width = '0%'
      delayLoadId && cancelAnimationFrame(delayLoadId)
      onDone()
    },
    isStopped,
  })

  return () => {
    if (delayLoadId != null) {
      cancelAnimationFrame(delayLoadId)
      delayLoadId = undefined
    }
    const load = document.querySelector<HTMLDivElement>('#loader')
    if (load) load.style.width = '0%'
  }
}

// 获取当前日期
export function getCurDay(currentDate = new Date()) {
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取当前时间
export function getCurTime(currentDate = new Date()) {
  const hours = String(currentDate.getHours() + 1).padStart(2, '0')
  const minutes = String(currentDate.getMinutes() + 1).padStart(2, '0')
  const seconds = String(currentDate.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function errorHandle(e: any): string {
  if (e instanceof Error) {
    return e.message
  }
  return `${e}`
}

export function getUuid(e: number, t: number) {
  var r
  var i
  var n = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
  var o = []
  t = t || n.length
  if (e) {
    for (r = 0; r < e; r++) {
      o[r] = n[(Math.random() * t) | 0]
    }
  } else {
    o[8] = o[13] = o[18] = o[23] = '-'
    o[14] = '4'
    r = 0
    for (; r < 36; r++) {
      if (!o[r]) {
        i = (Math.random() * 16) | 0
        o[r] = n[r == 19 ? (i & 3) | 8 : i]
      }
    }
  }
  return o.join('')
}
