import { resolve } from 'path'

import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { defineConfig } from 'wxt'

import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

const extKey = (browser: string) => {
  const keys: Record<string, string | undefined> = {
    edge: undefined, //'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq+hJAUmfZSTB6c7QOXiU6r1JUMLM3C/CDTVolB5pU/DAkO3Y3uVh/YWWaV8m2wIrLSjN7n1CZ+zmRlO+YpUq2vZRILq8WXFePCfHe8EqVY9mjj04BqqRuttHpJqMeXl1aVbKmICKj3cNEprGzJJvaAorz0NJxD82oLXf8CMIW0MHUjvwgmNc9HTD41glvX6CzW1r4qvwl4MSdZRPVf5dmhp+CWoaAcjqEpHbu+EZV5WpfQz9XCsmBXmMAFLyBtn62Xvy86c9PntIRw8xMikqmi8lVyOgT8oSM2U8EFyMsESoT2qCQXgUf0FMtKipoNs7xM7FtdOppNylHa6jJyYdRwIDAQAB',
    chrome:
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxCHedeutoVPRmAkHsKoev5NdPRNcre8U1Z7a1MbceU7BQRIkMhiIApkBpvoTW30dcUQ/V3UOB6v4Crvkr40Hjr8u1uygcWynl12/+gIcNriIKgZh+udWCkKCFHs5pFEdoXUaQqym+eEBkJCo5HwgxYkxXA94/a2Vtnd5u7Mk0nWyk40qx1wxATYEi10C5L82U32F6KgvIY7YqhtFaM9N2utW4rlbtMgeEOEANG6fo4IBhEM/+n5kbch5K2KAH70fMKUq9aOj43b3gTM4mT90tF1jfMRgLW26d6zfUhMQBG2SqQSc6AoN25r+Q5D79OcezUE1S8iBkzb1MM2GfkFxJQIDAQAB',
    firefox: '{1b66669d-c871-43f3-8c0c-d8a1c0566071}',
  }
  if (!(browser in keys) || !keys[browser]) {
    return {}
  }
  if (browser === 'firefox') {
    return {
      browser_specific_settings: {
        gecko: {
          id: keys['firefox'],
          strict_min_version: '109.0',
        },
      },
    }
  }
  return { key: keys[browser] }
}

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  // imports: false,

  vite: () => ({
    resolve: {
      alias: {
        'devlog-ui': resolve(__dirname, 'packages/devlog-ui/src'),
      },
    },
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
            defaultVariants: {
              variant: 'subtle',
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
    ...extKey(browser),
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'notifications'],
    web_accessible_resources: [
      {
        resources: ['boss.js'],
        matches,
      },
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
  }),
  webExt: {
    disabled: true,
  },
})
