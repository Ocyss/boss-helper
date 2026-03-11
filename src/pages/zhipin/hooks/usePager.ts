import { ref } from 'vue'
import { useHookVueData, useHookVueFn } from '@/composables/useVue'
import { logger } from '@/utils/logger'

const page = ref({ page: 1, pageSize: 15 })
const pageChange = ref((_v: number) => {})

const initPage = useHookVueData('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', 'pageVo', page)

const initChange = useHookVueFn('#wrap .page-job-wrapper', 'pageChangeAction')
const initSearch = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', ['searchJobAction', 'onSearch'])

function next() {
  try{
    pageChange.value(page.value.page + 1)
  }catch(err){
    logger.error("翻页: 下一页错误",err)
    throw err
  }
  
  return true
}

function prev() {
  try{
    pageChange.value(page.value.page - 1)
  }catch(err){
    logger.error("翻页: 上一页错误",err)
    throw err
  }
  return true
}

export function usePager() {
  return {
    page,
    pageChange,
    next,
    prev,
    initPager: async () => {
      await initPage()
      pageChange.value = (location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs'))
        ? (await initSearch())
        : (await initChange())
      if (!pageChange.value) {
        throw new Error('pageChange is undefined')
      }
    },
  }
}
