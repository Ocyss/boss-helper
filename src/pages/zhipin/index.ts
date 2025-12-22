import { createPinia } from 'pinia'
import { createApp } from 'vue'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import Ui from './components/Ui.vue'
import './index.scss'

async function mountVue() {
  const jobSearchWrapper = await elmGetter.get('.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main')
  if (document.querySelector('#boss-helper-job')) {
    return
  }
  const app = createApp(Ui)
  app.use(createPinia())

  const jobEl = document.createElement('div')
  jobEl.id = 'boss-helper-job'

  jobSearchWrapper.setAttribute('help', '出界了哇!')

  if (location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')) {
    jobEl.style.cssText = `
      background: #fff;
      border-radius: 12px;
      padding: 24px 24px 16px;
    `
    const jobWarpEl = document.createElement('div')
    jobWarpEl.id = 'boss-helper-job-warp'
    jobWarpEl.style.cssText = `
      width: 85%;
      max-width: 870px;
      min-width: 320px;
      margin: 40px auto 90px auto;
    `
    jobSearchWrapper.insertBefore(jobWarpEl, jobSearchWrapper.firstElementChild)
    jobWarpEl.appendChild(jobEl)
  }
  else {
    jobSearchWrapper.insertBefore(jobEl, jobSearchWrapper.firstElementChild)
  }
  app.mount(jobEl)
}

function removeAd() {
  // 新职位发布时通知我
  void elmGetter.rm('.job-list-wrapper .subscribe-weixin-wrapper')
  // 侧栏
  void elmGetter.rm('.job-side-wrapper')
  // 侧边悬浮框
  void elmGetter.rm('.side-bar-box')
  // 搜索栏登录框
  void elmGetter.rm('.go-login-btn')
  // 底部页脚
  // elmGetter.rm("#footer-wrapper");

  // 新版: 微信扫码
  void elmGetter.rm('.c-subscribe-weixin')
  // 新版: 求职工具
  void elmGetter.rm('.c-job-tools.job-tools')
  // 新版: 热门职位
  void elmGetter.rm('.c-hot-link.hot-link')
  // 新版: 面包屑
  void elmGetter.rm('.c-breadcrumb')
}

export async function run() {
  logger.info('加载/web/geek/job页面Hook')
  removeAd()
  return mountVue()
}
