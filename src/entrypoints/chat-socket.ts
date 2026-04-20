import { defineContentScript } from '#imports'

function shouldCaptureChatSocket(url: string | URL | undefined) {
  return url != null && url.toString().includes('chatws')
}

function setSharedChatSocket(socket: WebSocket) {
  try {
    window.socket = socket
  } catch {}

  const topWindow = window.top
  if (topWindow != null && topWindow !== window) {
    try {
      topWindow.socket = socket
    } catch {}
  }
}

function clearSharedChatSocket(socket: WebSocket) {
  try {
    if (window.socket === socket) {
      window.socket = undefined
    }
  } catch {}

  const topWindow = window.top
  if (topWindow != null && topWindow !== window) {
    try {
      if (topWindow.socket === socket) {
        topWindow.socket = undefined
      }
    } catch {}
  }
}

function hookChatSocket() {
  if (window.__BOSS_HELPER_CHAT_SOCKET_HOOKED__ === true) {
    return
  }
  window.__BOSS_HELPER_CHAT_SOCKET_HOOKED__ = true

  const NativeWebSocket = window.WebSocket
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget) as WebSocket
      const [url] = args as [string | URL | undefined, string | string[] | undefined]

      if (!shouldCaptureChatSocket(url)) {
        return socket
      }

      setSharedChatSocket(socket)
      socket.addEventListener('open', () => {
        setSharedChatSocket(socket)
      })
      socket.addEventListener('close', () => {
        clearSharedChatSocket(socket)
      })

      return socket
    },
  }) as typeof WebSocket
}

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  world: 'MAIN',
  allFrames: true,
  runAt: 'document_start',
  main() {
    hookChatSocket()
  },
})
