import { defineProxy } from 'comctx'

import { defineContentScript, injectScript } from '#imports'
import { BackgroundCounter, InjectBackgroundAdapter } from '@/message/background'
import { ContentCounter } from '@/message/contentScript'
import { ProvideContentScriptAdapter } from '@/message/contentScriptShare'
import {
  BOSS_HELPER_V2_BACKGROUND_NAMESPACE,
  BOSS_HELPER_V2_CONTENT_NAMESPACE,
} from '@/utils/namespace'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  async main() {
    const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
      namespace: BOSS_HELPER_V2_BACKGROUND_NAMESPACE,
    })

    const [provideContentCounter] = defineProxy(
      () => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())),
      {
        namespace: BOSS_HELPER_V2_CONTENT_NAMESPACE,
      },
    )

    await injectScript('/boss.js', {
      keepInDom: true,
      modifyScript(script) {
        provideContentCounter(new ProvideContentScriptAdapter(script))
      },
    })
  },
})
