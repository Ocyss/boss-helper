import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'wxt'
import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  imports: false,

  manifest: {
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'cookies', 'notifications'],
    web_accessible_resources: [
      {
        resources: ['main-world.js'],
        matches,
      },
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
  },
  vite: () => ({
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    ssr: {
      noExternal: [
        '@webext-core/storage',
        '@webext-core/messaging',
        '@webext-core/proxy-service',
      ],
    },
    plugins: [
      vueJsx(),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or 'modern'
          additionalData: `@forward 'element-plus/theme-chalk/src/mixins/config.scss' with (
  $namespace: 'ehp'
);`,
        },
      },
    },
  }),
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      manifest.content_scripts ??= []
      manifest.content_scripts.push({
        // Build extension once to see where your CSS get's written to
        css: ['/assets/main-world.css'],
        matches,
      })
    },
  },
})
