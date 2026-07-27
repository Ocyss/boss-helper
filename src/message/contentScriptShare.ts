import { Adapter, SendMessage, OnMessage, Message } from 'comctx'

export class ProvideContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    if (typeof document === 'undefined') return

    /**
     * Compatible with Firefox
     * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
     */
    const detail =
      // @ts-ignore
      typeof cloneInto === 'function' ? cloneInto(message, document.defaultView) : message

    const CustomEventConstructor = document.defaultView?.CustomEvent ?? CustomEvent
    document.dispatchEvent(new CustomEventConstructor('message', { detail }))
  }
  onMessage: OnMessage = (callback) => {
    if (typeof document === 'undefined') return () => {}

    const target = document
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    target.addEventListener('message', handler)
    return () => target.removeEventListener('message', handler)
  }
}
