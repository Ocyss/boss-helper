import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { defineConfig } from 'wxt'

import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  // imports: false,

  vite: () => ({
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    ssr: {
      noExternal: [
        '@webext-core/storage',
        '@webext-core/messaging',
        '@webext-core/proxy-service',
        '@nuxt/ui',
        '@nuxt/icon',
      ],
    },
    plugins: [
      vueJsx(),
      ui({
        // autoImport: false,
        // components: false,
        colorMode: false,
        router: false,
        prose: false,
        ui: {
          colors: {
            primary: 'teal',
            neutral: 'gray',
            warning: 'orange',
            success: 'emerald',
            error: 'rose',
          },
          badge: {
            defaultVariants: {
              color: 'neutral',
              variant: 'subtle',
            },
          },
          alert: {
            slots: {
              root: 'px-4 py-2',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          button: {
            slots: {
              base: 'cursor-pointer',
            },
          },
          tabs: {
            slots: {
              trigger: 'cursor-pointer',
            },
          },
          link: {
            base: 'no-underline hover:underline',
          },
          formField: {
            slots: {
              // container: 'flex flex-1',
              // root: 'justify-start items-center',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          modal: {
            slots: {
              overlay: 'z-200',
              content: 'z-220',
              footer: 'justify-end',
            },
          },
          chatMessage: {
            variants: {
              side: {
                right: {
                  container: 'flex-row-reverse justify-start',
                },
              },
            },
          },
          slideover: {
            slots: {
              content: 'z-230',
            },
          },
        },
      }),
      tailwindShadowDOM(),
    ],
  }),
  dev: {},
  manifest: ({ browser }) => ({
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // 不申请 chrome.cookies；BOSS 页面会按官方页面会话完成必要请求，扩展不读取或导出 Cookie。
    permissions: ['storage', 'notifications'],
    web_accessible_resources: [
      {
        resources: ['boss.js'],
        matches,
      },
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
    // 独立生成的 Manifest 公钥；不复用官方扩展 key，私钥不进入仓库。
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt979f9VUrRMPafEh1cEV3VWUjgR92/Ziu1O58UWl5pD9SJF02QFnNrcLmDSENZivKYSCkLsp1tBFFYCyTmeADKzr+ffeUeOPec4KFoHPF/bwxEXQnm3xzhh56MueNZsY+y+dO3DgD34hZF6dzztlONb05N+xD+znVT/dYFEN4mpZ300G42Bju3bh2QJo9XMNKIxNdZx+MkSUV5DKwOQlhCY2opnT/sCn5Dvs+FafK1j3u/+q4icwYw7N1/WVL9F2U29HNOZjjLoImUKmBkTPmqltIsvyu9HcfSR5qqgaxKnKkmObBSmnMV/eBcstsj96w0CQdM+PEh7Pe+0Z/rLM+wIDAQAB',
    browser_specific_settings:
      browser == 'firefox'
        ? {
            gecko: {
              id: '{1b66669d-c871-43f3-8c0c-d8a1c0566071}',
              strict_min_version: '109.0',
            },
          }
        : undefined,
  }),
  webExt: {
    disabled: true,
  },
  // hooks: {
  //   'build:manifestGenerated': (wxt, manifest) => {
  //     manifest.content_scripts ??= []
  //     manifest.content_scripts.push({
  //       // Build extension once to see where your CSS get's written to
  //       css: ['/assets/main-world.css'],
  //       matches,
  //     })
  //   },
  // },
})
