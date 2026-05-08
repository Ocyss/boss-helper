interface Window {
  socket: WebSocket
  ChatWebsocket?: {
    send: (e: { toArrayBuffer: () => ArrayBuffer }) => void
    sendFailMsgs?: any[]
    status$?: {
      value?: unknown
      observers?: unknown[]
    }
    deliver$?: {
      observers?: unknown[]
    }
    message$?: {
      observers?: unknown[]
    }
    iq$?: {
      observers?: unknown[]
    }
  }
  GeekChatCore?: any
  EventBus?: {
    publish: (e: string, ...data: any[]) => void
    subscribe: (e: string, t: (...data: any[]) => void) => void
  }
  _PAGE: {
    isGeekChat: boolean
    // zp_token: string; 7.18 寄！
    userId: number
    identity: number
    encryptUserId: string
    name: string
    showName: string
    tinyAvatar: string
    largeAvatar: string
    token: string
    isHunter: boolean
    clientIP: string
    email: any
    phone: any
    brandName: any
    doubleIdentity: boolean
    recruit: boolean
    agentRecruit: boolean
    industryCostTag: number
    gender: number
    trueMan: boolean
    studentFlag: boolean
    completeDayStatus: boolean
    complete: boolean
    multiExpect: boolean
    uid: number
  }
  Cookie: {
    get: (key: string) => string
  }
  [key: string]: any
}

declare const __APP_VERSION__: string
