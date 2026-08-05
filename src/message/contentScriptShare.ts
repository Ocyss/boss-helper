import { Adapter, SendMessage, OnMessage, Message } from 'comctx'

import { BOSS_HELPER_V2_MESSAGE_EVENT } from '@/utils/namespace'

declare global {
  function cloneInto<T>(value: T, target: any): T
}

export class ProvideContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    /**
     * Compatible with Firefox
     * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
     */
    const detail =
      typeof cloneInto === 'function' ? cloneInto(message, document.defaultView) : message

    document.dispatchEvent(new CustomEvent(BOSS_HELPER_V2_MESSAGE_EVENT, { detail }))
  }
  onMessage: OnMessage = (callback) => {
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    document.addEventListener(BOSS_HELPER_V2_MESSAGE_EVENT, handler)
    return () => document.removeEventListener(BOSS_HELPER_V2_MESSAGE_EVENT, handler)
  }
}

export class ProvideContentScriptAdapter implements Adapter {
  script: HTMLScriptElement

  constructor(script: HTMLScriptElement) {
    this.script = script
  }
  sendMessage: SendMessage = (message) => {
    // /**
    //  * Compatible with Firefox
    //  * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
    //  */
    const detail =
      typeof cloneInto === 'function' ? cloneInto(message, document.defaultView) : message
    this.script.dispatchEvent(new CustomEvent(BOSS_HELPER_V2_MESSAGE_EVENT, { detail }))
  }

  onMessage: OnMessage = (callback) => {
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    this.script.addEventListener(BOSS_HELPER_V2_MESSAGE_EVENT, handler)
    return () => this.script.removeEventListener(BOSS_HELPER_V2_MESSAGE_EVENT, handler)
  }
}
