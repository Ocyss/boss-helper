import { defineContentScript, injectScript } from '#imports'
import { ProvideContentAdapter, provideContentCounter } from '@/message/contentScript'

import './boss/inject.css'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  runAt: 'document_start',
  async main() {
    provideContentCounter(new ProvideContentAdapter())
    await injectScript('/boss.js', {
      keepInDom: true,
    })
  },
})

// export default defineContentScript({
//   matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
//   world: 'MAIN',
//   allFrames: true,
//   runAt: 'document_start',
//   main() {
//     hookChatSocket()
//   },
// })
