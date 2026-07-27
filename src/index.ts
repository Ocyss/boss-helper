import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'

import App from './App.vue'
import AppMenu from './AppMenu.vue'
import { HelperContext, HelperKey } from './composables/useHelper'

import AppStyle from '@/assets/main.css?inline'

export async function run<C extends HelperContext<C, T, S>, T, S>(ctx: HelperContext<C, T, S>) {
  function _connectedCallback(root: HTMLElement, App: any) {
    const shadow = root.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.innerText = AppStyle
    shadow.appendChild(style)

    const container = document.createElement('div')
    container.id = 'app-root'
    shadow.appendChild(container)

    const app = createApp(App)
    app.use(ui)
    app.provide(HelperKey, ctx as never)
    app.mount(container)

    ;(root as any)._vueApp = app
  }

  customElements.define(
    'boss-helper-job',
    class extends HTMLElement {
      connectedCallback() {
        _connectedCallback(this, App)
      }
      disconnectedCallback() {
        // 完美卸载的关键：清理 Vue 实例
        const app = (this as any)._vueApp
        if (app) {
          app.unmount()
          ;(this as any)._vueApp = null
        }
      }
    },
  )

  customElements.define(
    'boss-helper-menu',
    class extends HTMLElement {
      connectedCallback() {
        _connectedCallback(this, AppMenu)
      }
      disconnectedCallback() {
        // 完美卸载的关键：清理 Vue 实例
        const app = (this as any)._vueApp
        if (app) {
          app.unmount()
          ;(this as any)._vueApp = null
        }
      }
    },
  )
  await ctx.onMount()
}
