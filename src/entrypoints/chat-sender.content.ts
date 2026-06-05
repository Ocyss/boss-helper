// @ts-nocheck
import { defineContentScript } from '#imports'

/**
 * BOSS直聘 话术发送器
 * 负责兜底队列展示、聊天页补发，以及把主 Helper 的自定义招呼语同步给 main-world。
 */
export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  main() {
    'use strict';
    
      const STORE_KEY = 'boss_sender_v3';
      const FALLBACK_QUEUE_KEY = 'boss_helper_pending_greetings_v1';
      const AI_RUNTIME_KEY = 'boss_helper_ai_runtime_v1';
      const CUSTOM_GREETING_CACHE_KEY = 'boss_helper_custom_greeting_cache_v1';
      const FORM_DATA_KEY = 'web-geek-job-FormData';
      const MODEL_DATA_KEY = 'conf-model';
      const SIGNED_KEY = 'signedKey';
      const SIGNED_KEY_INFO = 'signedKeyInfo';
    
      const isChatPage = location.href.includes('/web/geek/chat');
      const isSearchPage = location.href.includes('/web/geek/job');
    
      let state = normalizeState(readJson(localStorage.getItem(STORE_KEY), {}));
      for (const oldKey of ['boss_sender_v2', 'boss_sender_v16', 'boss_sender_v15']) {
        if (!state.sent.length) {
          const oldState = normalizeState(readJson(localStorage.getItem(oldKey), {}));
          if (oldState.sent.length) state = oldState;
        }
      }
      const sent = new Set(state.sent || []);
      let running = false;
      let aiDiagnosis = 'AI诊断: 读取中...';
      let aiDiagnosisRaw = {};
      let helperGreeting = { enable: false, value: '', updatedAt: 0 };
    
      function normalizeState(value) {
        return {
          sent: Array.isArray(value?.sent) ? value.sent : [],
          diagnosticsOpen: !!value?.diagnosticsOpen
        };
      }
    
      function readJson(raw, fallback) {
        try {
          return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
          console.warn('[ChatSender] JSON parse failed', err);
          return fallback;
        }
      }
    
      function save() {
        state.sent = [...sent];
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      }
    
      function log(msg) {
        console.log('[ChatSender]', msg);
        const el = document.getElementById('bs-log');
        if (el) {
          el.textContent += '\n' + msg;
          el.scrollTop = el.scrollHeight;
        }
      }
    
      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    
      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }
    
      function loadPendingGreetings() {
        try {
          const items = JSON.parse(localStorage.getItem(FALLBACK_QUEUE_KEY) || '[]');
          return Array.isArray(items) ? items : [];
        } catch (err) {
          console.warn('[ChatSender] pending queue parse failed', err);
          return [];
        }
      }
    
      function savePendingGreetings(items) {
        localStorage.setItem(FALLBACK_QUEUE_KEY, JSON.stringify(items.slice(-200)));
      }
    
      function clearPendingGreetings() {
        if (!window.confirm('确定清空所有待发送队列吗？这个操作不可撤销。')) return;
        localStorage.setItem(FALLBACK_QUEUE_KEY, '[]');
        updateStatus();
        log('已清空兜底队列');
      }
    
      function activePendingGreetings() {
        return loadPendingGreetings().filter(item => item && item.status !== 'sent' && item.status !== 'failed' && item.content);
      }
    
      function queueStats() {
        const items = loadPendingGreetings().filter(Boolean);
        const active = items.filter(item => item.status !== 'sent' && item.status !== 'failed' && item.content);
        const failed = items.filter(item => item.status === 'failed');
        const sentItems = items.filter(item => item.status === 'sent');
        return { items, active, failed, sent: sentItems };
      }
    
      function pendingCount() {
        return activePendingGreetings().length;
      }
    
      function pendingQueueJson() {
        return localStorage.getItem(FALLBACK_QUEUE_KEY) || '[]';
      }
    
      function storageGet(area, key, fallback) {
        return new Promise(resolve => {
          try {
            const browserApi = globalThis.chrome || globalThis.browser;
            const storage = browserApi?.storage?.[area];
            if (!storage) return resolve(fallback);
            storage.get(key, result => {
              if (browserApi.runtime?.lastError) {
                console.warn('[ChatSender] storage get failed', area, key, browserApi.runtime.lastError);
                resolve(fallback);
                return;
              }
              resolve(result && Object.prototype.hasOwnProperty.call(result, key) ? result[key] : fallback);
            });
          } catch (err) {
            console.warn('[ChatSender] storage unavailable', err);
            resolve(fallback);
          }
        });
      }
    
      function storageSet(area, key, value) {
        return new Promise((resolve, reject) => {
          try {
            const browserApi = globalThis.chrome || globalThis.browser;
            const storage = browserApi?.storage?.[area];
            if (!storage) return reject(new Error('storage unavailable'));
            storage.set({ [key]: value }, () => {
              if (browserApi.runtime?.lastError) {
                reject(browserApi.runtime.lastError);
                return;
              }
              resolve(true);
            });
          } catch (err) {
            reject(err);
          }
        });
      }
    
      function shortValue(value) {
        const text = String(value || '');
        if (!text) return '未设置';
        return text.length > 18 ? text.slice(0, 18) + '...' : text;
      }
    
      function readAiRuntime() {
        try {
          return JSON.parse(localStorage.getItem(AI_RUNTIME_KEY) || 'null');
        } catch (err) {
          console.warn('[ChatSender] ai runtime parse failed', err);
          return null;
        }
      }
    
      function syncHelperGreetingCache(formData) {
        const customGreeting = formData?.customGreeting || {};
        const value = String(customGreeting.value || '').trim();
        helperGreeting = {
          enable: !!customGreeting.enable,
          value,
          updatedAt: Date.now()
        };
        localStorage.setItem(CUSTOM_GREETING_CACHE_KEY, JSON.stringify(helperGreeting));
        return helperGreeting;
      }
    
      async function refreshHelperGreetingCache() {
        const formData = await storageGet('local', FORM_DATA_KEY, {});
        return syncHelperGreetingCache(formData);
      }
    
      async function getConfiguredGreeting() {
        const cached = await refreshHelperGreetingCache();
        return cached.enable ? String(cached.value || '').trim() : '';
      }
    
      async function refreshAiDiagnosis() {
        const [formData, modelData, signedKey, signedKeyInfo] = await Promise.all([
          storageGet('local', FORM_DATA_KEY, {}),
          storageGet('sync', MODEL_DATA_KEY, []),
          storageGet('sync', SIGNED_KEY, ''),
          storageGet('sync', SIGNED_KEY_INFO, null)
        ]);
    
        syncHelperGreetingCache(formData);
    
        const ai = formData?.aiGreeting || {};
        const models = Array.isArray(modelData) ? modelData : [];
        const selected = ai.model || '';
        const matched = selected ? models.some(model => model && model.key === selected) : false;
        const prompt = ai.prompt;
        const promptLength = Array.isArray(prompt)
          ? prompt.reduce((sum, item) => sum + String(item?.content || '').length, 0)
          : String(prompt || '').length;
        const runtimeDiag = readAiRuntime();
    
        let status;
        if (!ai.enable) {
          status = (promptLength > 0 && (matched || models.length === 1))
            ? '模型和Prompt已配置，但AI招呼语开关为关'
            : '未启用AI招呼语';
        } else if (ai.vip) {
          status = signedKey ? 'VIP模式: 已检测到密钥' : 'VIP模式: 未检测到密钥';
        } else if (!selected) {
          status = models.length === 1 ? '未保存模型key，将自动使用唯一模型' : '未选择招呼语模型';
        } else if (matched) {
          status = 'AI配置看起来可用';
        } else {
          status = models.length === 1 ? '模型key不匹配，将自动使用唯一模型' : '模型key不匹配';
        }
    
        aiDiagnosisRaw = {
          enable: !!ai.enable,
          vip: !!ai.vip,
          selectedModel: selected,
          modelCount: models.length,
          matched,
          promptLength,
          hasSignedKey: !!signedKey,
          hasSignedKeyInfo: !!signedKeyInfo,
          customGreetingEnabled: helperGreeting.enable,
          customGreetingLength: helperGreeting.value.length,
          runtimeDiag
        };
        aiDiagnosis = [
          `AI诊断: ${status}`,
          `开关:${ai.enable ? '开' : '关'} 模式:${ai.vip ? 'VIP' : '自配模型'} 模型数:${models.length}`,
          `选中:${shortValue(selected)} 匹配:${matched ? '是' : '否'} Prompt:${promptLength}字`,
          signedKey ? '密钥:已检测到' : '密钥:未检测到',
          `自定义话术:${helperGreeting.enable ? '开' : '关'} ${helperGreeting.value.length}字`
        ].join('\n');
      }
    
      async function enableAiGreetingAndReload() {
        try {
          const [formData, modelData] = await Promise.all([
            storageGet('local', FORM_DATA_KEY, {}),
            storageGet('sync', MODEL_DATA_KEY, [])
          ]);
          const models = Array.isArray(modelData) ? modelData : [];
          const ai = { ...(formData.aiGreeting || {}) };
          if (!ai.model && models.length === 1 && models[0]?.key) {
            ai.model = models[0].key;
          }
          ai.enable = true;
          formData.aiGreeting = ai;
          await storageSet('local', FORM_DATA_KEY, formData);
          aiDiagnosis = 'AI诊断: 已启用AI招呼语，正在刷新页面...';
          updateQueueDebug();
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          aiDiagnosis = 'AI诊断: 启用失败 - ' + (err?.message || String(err));
          updateQueueDebug();
        }
      }
    
      function takePendingGreeting() {
        return activePendingGreetings()[0] || null;
      }
    
      function markPendingGreetingSent(item, chatKey) {
        const items = loadPendingGreetings();
        const target = items.find(row => row.id === item.id);
        if (target) {
          target.status = 'sent';
          target.sentAt = Date.now();
          target.chatKey = chatKey;
        }
        savePendingGreetings(items);
      }
    
      function markPendingGreetingFailed(item, reason) {
        const items = loadPendingGreetings();
        const target = items.find(row => row.id === item.id);
        if (target) {
          target.status = 'failed';
          target.attempts = (target.attempts || 0) + 1;
          target.lastError = reason;
          target.updatedAt = Date.now();
        }
        savePendingGreetings(items);
      }
    
      function doSend(text) {
        const message = String(text || '').trim();
        if (!message) {
          log('发送取消: 未配置可发送的话术');
          return false;
        }
        const input = document.querySelector('.chat-input');
        if (!input) return false;
        input.focus();
        input.innerHTML = '';
        document.execCommand('insertText', false, message);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        setTimeout(() => {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
            cancelable: true
          }));
        }, 400);
        return true;
      }
    
      function getChatList() {
        const list = document.querySelector('.user-list');
        return list ? Array.from(list.querySelectorAll('li')).filter(li => li.textContent.trim().length > 5) : [];
      }
    
      function getKey(li) {
        const nameBox = li.querySelector('.name-box');
        return nameBox ? nameBox.textContent.trim() : '';
      }
    
      function alreadyChatted(li) {
        const key = getKey(li);
        if (key && sent.has(key)) return true;
        const msg = li.querySelector('.last-msg-text');
        if (!msg) return false;
        const text = msg.textContent.trim();
        if (!text) return false;
        if (text.startsWith('您正在与Boss')) return false;
        return true;
      }
    
      function matchesQueuedBoss(li, queued) {
        const bossName = String(queued?.boss_name || '').trim();
        const toName = String(queued?.to_name || '').trim();
        const key = getKey(li);
        const text = li.textContent || '';
        if (bossName && (key.includes(bossName) || text.includes(bossName))) return true;
        if (toName && (key.includes(toName) || text.includes(toName))) return true;
        return false;
      }
    
      function updateStatus() {
        const el = document.getElementById('bs-status');
        const pending = pendingCount();
        if (el) {
          el.textContent = running
            ? `发送中 已发:${sent.size} 待发:${pending}`
            : `就绪 已发:${sent.size} 待发:${pending}`;
        }
        updateQueueDebug();
      }
    
      function updateQueueDebug() {
        const stats = queueStats();
        const latest = stats.active[stats.active.length - 1] || stats.failed[stats.failed.length - 1] || null;
        const box = document.getElementById('bs-ai-queue');
        const raw = document.getElementById('bs-queue-raw');
        const diag = document.getElementById('bs-ai-diagnosis');
        const preview = document.getElementById('bs-preview');
        const aiEnable = document.getElementById('bs-ai-enable');
        const custom = document.getElementById('bs-custom-greeting');
    
        if (box) {
          box.textContent = `队列 待发:${stats.active.length} 失败:${stats.failed.length} 已发:${stats.sent.length}`;
          box.className = stats.active.length ? 'bs-pill bs-warn' : stats.failed.length ? 'bs-pill bs-danger' : 'bs-pill bs-ok';
        }
    
        if (preview) {
          preview.textContent = latest
            ? `${latest.status === 'failed' ? '失败' : '待发'} | ${latest.boss_name || latest.to_name || '未知Boss'} | ${String(latest.content || '').slice(0, 56)}`
            : '暂无待发送话术';
        }
    
        if (custom) {
          custom.textContent = helperGreeting.enable && helperGreeting.value
            ? `自定义话术已启用 ${helperGreeting.value.length}字`
            : '未配置默认话术；AI未生成时不会兜底发送';
          custom.className = helperGreeting.enable && helperGreeting.value ? 'bs-pill bs-ok' : 'bs-pill bs-muted';
        }
    
        if (raw && raw.style.display !== 'none') {
          raw.textContent = pendingQueueJson();
        }
    
        if (diag) {
          diag.textContent = aiDiagnosis;
          const ok = /可用|自动使用|VIP模式/.test(aiDiagnosis) && !/未检测|未启用|不匹配/.test(aiDiagnosis);
          diag.className = ok ? 'bs-diagnosis bs-ok-bg' : 'bs-diagnosis bs-warn-bg';
        }
    
        if (aiEnable) {
          aiEnable.style.display = aiDiagnosisRaw.enable ? 'none' : 'inline-flex';
        }
      }
    
      async function runBatch() {
        if (running) return;
        running = true;
        updateStatus();
        log('===== 开始发送 =====');
    
        let count = 0;
        while (running && count < 100) {
          count++;
          const items = getChatList();
          const queued = takePendingGreeting();
          const configuredGreeting = queued ? '' : await getConfiguredGreeting();
          let found = null;
    
          if (queued) {
            for (const li of items) {
              const key = getKey(li);
              if (!key || sent.has(key)) continue;
              if (matchesQueuedBoss(li, queued)) {
                found = { li, key };
                break;
              }
            }
            if (!found) {
              log(`队列暂停: 未在当前聊天列表找到 ${queued.boss_name || queued.to_name || '目标Boss'}，不会降级发送给其他人`);
              break;
            }
          } else {
            if (!configuredGreeting) {
              log('发送结束: 没有待发队列，也未在主 Helper 配置启用自定义招呼语');
              break;
            }
            for (const li of items) {
              const key = getKey(li);
              if (!key || sent.has(key) || alreadyChatted(li)) continue;
              found = { li, key };
              break;
            }
          }
    
          if (!found) {
            log('没有可发送的聊天项');
            break;
          }
    
          if (queued && alreadyChatted(found.li)) {
            sent.add(found.key);
            markPendingGreetingSent(queued, found.key);
            save();
            updateStatus();
            log(`[跳过] ${found.key} 已有聊天内容，队列标记完成`);
            await sleep(500);
            continue;
          }
    
          found.li.scrollIntoView({ block: 'center' });
          (found.li.querySelector('.name-box') || found.li.querySelector('.friend-content') || found.li).click();
          log(`[${sent.size + 1}] ${found.key}${queued ? ' | 队列' : ' | 自定义话术'}`);
          await sleep(2500);
    
          const message = queued?.content || configuredGreeting;
          const ok = doSend(message);
          if (ok) {
            sent.add(found.key);
            if (queued) markPendingGreetingSent(queued, found.key);
            save();
          } else {
            if (queued) markPendingGreetingFailed(queued, 'chat input not found');
            log('发送失败: 未找到输入框');
            break;
          }
          updateStatus();
          await sleep(3500);
        }
    
        running = false;
        save();
        updateStatus();
        setSendButtons(false);
        log(`===== 完成: ${sent.size} =====`);
      }
    
      let countdownTimer = null;
      let countdownSec = 0;
      function cancelJump() {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        countdownSec = 0;
        const st = document.getElementById('bs-jump-status');
        if (st && st.textContent.includes('跳转')) {
          st.textContent = '自动监测中';
        }
      }
    
      function setupAutoJump() {
        document.addEventListener('click', cancelJump, true);
        document.addEventListener('keydown', cancelJump, true);
        document.addEventListener('scroll', cancelJump, true);
        setInterval(() => {
          const el = document.querySelector('.ehp-text');
          if (!el) return;
          const match = el.textContent.match(/今日投递:\s*(\d+)\s*\/\s*(\d+)/);
          if (!match) return;
          const done = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          const st = document.getElementById('bs-jump-status');
          if (!st) return;
    
          if (done >= total && done > 0 && !countdownTimer) {
            countdownSec = 5;
            st.textContent = `完成，${countdownSec}秒后跳转聊天页。点击页面可取消`;
            countdownTimer = setInterval(() => {
              countdownSec--;
              if (countdownSec <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                location.href = 'https://www.zhipin.com/web/geek/chat';
              } else {
                st.textContent = `完成，${countdownSec}秒后跳转聊天页。点击页面可取消`;
              }
            }, 1000);
          } else if (done < total) {
            st.textContent = `投递:${done}/${total}`;
          }
        }, 2000);
      }
    
      function panelCss() {
        return [
          '<style>',
          '#bs-panel{box-sizing:border-box;color:#303133;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
          '#bs-panel *{box-sizing:border-box;}',
          '#bs-panel.bs-embedded{margin:8px 0 12px;padding:10px;border:1px solid #d9ecff;background:#f8fbff;border-radius:8px;}',
          '#bs-panel.bs-floating{position:fixed;bottom:20px;right:20px;z-index:99997;width:330px;padding:12px;border:1px solid #1677ff;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.16);}',
          '.bs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}',
          '.bs-title{font-weight:700;font-size:13px;}',
          '.bs-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;}',
          '.bs-pill{min-height:26px;padding:5px 7px;border-radius:6px;font-size:11px;line-height:16px;word-break:break-all;}',
          '.bs-ok{background:#f6ffed;color:#237804;border:1px solid #b7eb8f;}',
          '.bs-warn{background:#fff7e6;color:#ad6800;border:1px solid #ffd591;}',
          '.bs-danger{background:#fff1f0;color:#a8071a;border:1px solid #ffa39e;}',
          '.bs-muted{background:#f5f5f5;color:#606266;border:1px solid #d9d9d9;}',
          '.bs-preview{margin:6px 0;padding:6px;border:1px solid #e4e7ed;border-radius:6px;background:#fff;line-height:17px;word-break:break-all;}',
          '.bs-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
          '#bs-panel button{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border:0;border-radius:5px;cursor:pointer;font-size:12px;}',
          '.bs-primary{background:#1677ff;color:#fff;}.bs-success{background:#52c41a;color:#fff;}.bs-warning{background:#faad14;color:#fff;}.bs-danger-btn{background:#ff4d4f;color:#fff;}.bs-secondary{background:#909399;color:#fff;}',
          '.bs-diagnostics{display:none;margin-top:8px;}',
          '.bs-diagnostics.is-open{display:block;}',
          '.bs-diagnosis{font-size:11px;margin:6px 0;padding:6px;border-radius:6px;white-space:pre-wrap;line-height:1.45;}',
          '.bs-ok-bg{background:#f6ffed;color:#237804;border:1px solid #b7eb8f;}',
          '.bs-warn-bg{background:#fff7e6;color:#ad6800;border:1px solid #ffd591;}',
          '#bs-queue-raw{display:none;max-height:130px;overflow:auto;background:#111827;color:#a7f3d0;padding:6px;border-radius:5px;font:10px monospace;white-space:pre-wrap;word-break:break-all;}',
          '#bs-log{max-height:120px;overflow-y:auto;background:#1a1a2e;color:#0f0;padding:8px;border-radius:6px;font:11px monospace;white-space:pre-wrap;margin-top:6px;}',
          '</style>'
        ].join('');
      }
    
      function panelHtml() {
        const chatActions = isChatPage
          ? '<button class="bs-success" id="bs-go">开始发送</button><button class="bs-danger-btn" id="bs-stop" style="display:none">停止</button><button class="bs-warning" id="bs-once">发当前配置</button><button class="bs-secondary" id="bs-clear">清空已发</button>'
          : '<button class="bs-primary" id="bs-open-chat">去聊天页发送</button>';
        const jumpStatus = isChatPage ? '' : '<div class="bs-pill bs-muted" id="bs-jump-status">自动监测中</div>';
    
        return [
          panelCss(),
          '<div class="bs-head">',
          '<div class="bs-title">话术发送</div>',
          '<div class="bs-pill bs-muted" id="bs-status">就绪</div>',
          '</div>',
          jumpStatus,
          '<div class="bs-grid">',
          '<div id="bs-ai-queue" class="bs-pill bs-muted">队列读取中</div>',
          '<div id="bs-custom-greeting" class="bs-pill bs-muted">配置读取中</div>',
          '</div>',
          '<div class="bs-preview" id="bs-preview">暂无待发送话术</div>',
          '<div class="bs-actions">',
          chatActions,
          '<button class="bs-secondary" id="bs-diagnostics-toggle">诊断</button>',
          '</div>',
          '<div class="bs-diagnostics' + (state.diagnosticsOpen ? ' is-open' : '') + '" id="bs-diagnostics">',
          '<div id="bs-ai-diagnosis" class="bs-diagnosis bs-warn-bg">AI诊断: 读取中...</div>',
          '<div class="bs-actions">',
          '<button class="bs-success" id="bs-ai-enable">启用AI招呼语</button>',
          '<button class="bs-secondary" id="bs-queue-toggle">显示队列JSON</button>',
          '<button class="bs-danger-btn" id="bs-queue-clear">清空队列</button>',
          '</div>',
          '<pre id="bs-queue-raw"></pre>',
          '<div id="bs-log">' + escapeHtml(isChatPage ? '聊天页就绪。不会自动发送，请手动开始。' : '搜索页监测就绪。') + '</div>',
          '</div>'
        ].join('\n');
      }
    
      function findEmbedHost() {
        if (isChatPage) return null;
        return document.querySelector('#boss-helper-job') || document.querySelector('#boss-helper-job-warp') || document.querySelector('#boss-helper');
      }
    
      function mountPanel() {
        let panel = document.getElementById('bs-panel');
        if (!panel) {
          panel = document.createElement('div');
          panel.id = 'bs-panel';
          panel.innerHTML = panelHtml();
          bindPanelEvents(panel);
        }
    
        const host = findEmbedHost();
        const shouldEmbed = !!host;
        panel.classList.toggle('bs-embedded', shouldEmbed);
        panel.classList.toggle('bs-floating', !shouldEmbed);
    
        if (shouldEmbed) {
          const title = host.querySelector('h2');
          const expectedParent = title?.parentElement || host;
          if (panel.parentElement !== expectedParent) {
            if (title && title.nextSibling) expectedParent.insertBefore(panel, title.nextSibling);
            else expectedParent.appendChild(panel);
          }
        } else if (panel.parentElement !== document.body) {
          document.body.appendChild(panel);
        }
    
        updateStatus();
        return shouldEmbed;
      }
    
      function setSendButtons(isRunning) {
        const go = document.getElementById('bs-go');
        const stop = document.getElementById('bs-stop');
        if (go) go.style.display = isRunning ? 'none' : 'inline-flex';
        if (stop) stop.style.display = isRunning ? 'inline-flex' : 'none';
      }
    
      function bindPanelEvents(panel) {
        panel.querySelector('#bs-diagnostics-toggle')?.addEventListener('click', () => {
          state.diagnosticsOpen = !state.diagnosticsOpen;
          save();
          panel.querySelector('#bs-diagnostics')?.classList.toggle('is-open', state.diagnosticsOpen);
        });
    
        panel.querySelector('#bs-open-chat')?.addEventListener('click', () => {
          location.href = 'https://www.zhipin.com/web/geek/chat';
        });
    
        panel.querySelector('#bs-queue-toggle')?.addEventListener('click', () => {
          const queueRaw = document.getElementById('bs-queue-raw');
          const queueToggle = document.getElementById('bs-queue-toggle');
          if (!queueRaw || !queueToggle) return;
          const visible = queueRaw.style.display !== 'none';
          queueRaw.style.display = visible ? 'none' : 'block';
          queueToggle.textContent = visible ? '显示队列JSON' : '隐藏队列JSON';
          updateQueueDebug();
        });
    
        panel.querySelector('#bs-queue-clear')?.addEventListener('click', clearPendingGreetings);
        panel.querySelector('#bs-ai-enable')?.addEventListener('click', enableAiGreetingAndReload);
        panel.querySelector('#bs-ai-diagnosis')?.addEventListener('click', async () => {
          await refreshAiDiagnosis();
          const raw = document.getElementById('bs-queue-raw');
          if (raw && raw.style.display !== 'none') {
            raw.textContent = JSON.stringify(aiDiagnosisRaw, null, 2);
          }
          updateQueueDebug();
        });
    
        panel.querySelector('#bs-go')?.addEventListener('click', () => {
          setSendButtons(true);
          runBatch();
        });
        panel.querySelector('#bs-stop')?.addEventListener('click', () => {
          running = false;
          setSendButtons(false);
          updateStatus();
        });
        panel.querySelector('#bs-once')?.addEventListener('click', async () => {
          const message = await getConfiguredGreeting();
          if (!doSend(message)) log('发当前配置失败: 未找到输入框或未配置话术');
        });
        panel.querySelector('#bs-clear')?.addEventListener('click', () => {
          sent.clear();
          save();
          updateStatus();
          log('已清空已发记录');
        });
      }
    
      function init() {
        save();
        mountPanel();
        refreshAiDiagnosis().then(updateQueueDebug);
        setInterval(() => refreshAiDiagnosis().then(updateQueueDebug), 5000);
        setInterval(updateQueueDebug, 1000);
        setInterval(mountPanel, 1500);
        if (isChatPage) {
          setTimeout(() => {
            const pending = pendingCount();
            if (pending > 0) log(`检测到待发队列 ${pending} 条，请确认后手动开始发送`);
          }, 2000);
        }
        if (isSearchPage) setupAutoJump();
      }
    
      if (document.readyState === 'complete') init();
      else window.addEventListener('load', init);
  },
})
