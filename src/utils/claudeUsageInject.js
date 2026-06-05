/*
 * 注入到 claude.ai webview 主世界的脚本：在「真正的对话界面」里渲染额度/计费用量，
 * 位置与样式对齐 Claude-Usage-Extension：
 *   1) 左侧边栏顶部「Usage」盒子（带 ⚙ 图标，Session / Weekly 两条进度条 + ⏱ 重置倒计时）；
 *   2) 输入框工具栏下方一条整行：左「Quota: x%」+ 进度条，右「Est. messages: x.x」+「Reset in: xh ym」。
 * 复用页面已登录会话（credentials:include）直接 fetch 内部接口，自动过 Cloudflare。
 *
 * 通过 webview.executeJavaScript(原始字符串) 注入，故以 ?raw 引入，不参与打包/转译。
 */
(function () {
  if (window.__claudehubUsageInjected) return
  if (location.hostname.indexOf('claude.ai') === -1) return
  window.__claudehubUsageInjected = true

  var BLUE = '#2c84db'
  var RED = '#de2929'
  var GREEN = '#22c55e'
  // 额度三档配色：与主界面 Dashboard 的 usageColor 完全一致（sage / ochre / clay-red）
  var C_OK = '#5E876B'      // < 70%  健康（--ok）
  var C_WARN = '#BC8E3C'    // >= 70% 中等（--warn）
  var C_ALERT = '#BB4F3D'   // >= 90% 偏高/受限（--alert）
  var C_FAINT = '#A8A599'   // 无数据（--faint）
  var SIDEBAR_ID = 'claudehub-usage-sidebar'
  var QUOTA_ID = 'claudehub-usage-quota'

  // ---- 估算用的 token 上限（移植自参考实现 bg-components/utils.js，纯属经验值/“napkin math”）----
  var MODEL_WEIGHTS = { opus: 5, sonnet: 3, haiku: 1 }
  var DEFAULT_WEIGHT = 5
  var BASE_SYSTEM_PROMPT_TOKENS = 3200
  var ESTIMATED_CAPS = (function () {
    var caps = {
      claude_free: { session: 375000 },
      claude_pro: {},
      claude_team: {},
      claude_max_5x: { session: 15e6, weekly: 150e6 },
      claude_max_20x: {}
    }
    var mult = { claude_pro: 1, claude_team: 1.25, claude_max_5x: 5, claude_max_20x: 20 }
    var tiers = ['claude_pro', 'claude_team', 'claude_max_5x', 'claude_max_20x']
    ;['session', 'weekly'].forEach(function (key) {
      var src = tiers.find(function (t) { return caps[t] && caps[t][key] != null })
      if (!src) return
      var proEq = caps[src][key] / mult[src]
      tiers.forEach(function (t) {
        caps[t] = caps[t] || {}
        if (caps[t][key] == null) caps[t][key] = proEq * mult[t]
      })
    })
    return caps
  })()

  // 最近一次取到的数据（每秒只刷新倒计时，不必每次重新请求）
  var state = {
    five: null, seven: null,     // { pct, resetsAt(ms) }
    error: null, loaded: false,
    orgId: null,
    tier: null,                  // 'claude_max_5x' 等
    convId: null,                // 当前对话 id（用于缓存 token 估算）
    convTokens: null,            // 当前对话估算 token 数（含系统提示）
    convTurns: null              // 当前对话的「人类轮数」，用来估每轮增量 d
  }

  // ========== 取数 ==========
  var HEADERS = { 'anthropic-client-platform': 'web_claude_ai', accept: '*/*' }

  async function getOrgId() {
    if (state.orgId) return state.orgId
    var res = await fetch('/api/organizations', { credentials: 'include', headers: HEADERS })
    if (!res.ok) throw new Error('orgs ' + res.status)
    var list = await res.json()
    list = Array.isArray(list) ? list : []
    var org = list.find(function (o) {
      return o && Array.isArray(o.capabilities) && o.capabilities.indexOf('chat') !== -1
    }) || list[0]
    if (!org || !org.uuid) throw new Error('未登录')
    state.orgId = org.uuid
    return state.orgId
  }

  // 订阅档位 → 估算上限（移植自参考的 getSubscriptionTier，弱网/失败时回退 free）
  async function fetchTier(orgId) {
    if (state.tier) return state.tier
    try {
      var res = await fetch('/api/bootstrap/' + orgId + '/app_start?statsig_hashing_algorithm=djb2',
        { credentials: 'include', headers: HEADERS })
      if (!res.ok) throw new Error('bootstrap ' + res.status)
      var data = await res.json()
      var memberships = (data.account && data.account.memberships) || []
      var m = memberships.find(function (x) { return x.organization && x.organization.uuid === orgId })
      var org = m && m.organization
      var caps = (org && org.capabilities) || []
      var rateTier = (org && org.rate_limit_tier) || 'default_claude_ai'
      if (org && org.raven_type) state.tier = 'claude_team'
      else if (caps.indexOf('claude_max') !== -1) state.tier = rateTier.indexOf('5x') !== -1 ? 'claude_max_5x' : 'claude_max_20x'
      else if (caps.indexOf('claude_pro') !== -1) state.tier = 'claude_pro'
      else state.tier = 'claude_free'
    } catch (e) {
      state.tier = state.tier || 'claude_free'
    }
    return state.tier
  }

  function toLimit(obj) {
    if (!obj) return null
    var pct = typeof obj.utilization === 'number' ? obj.utilization : null
    var resetsAt = obj.resets_at ? new Date(obj.resets_at).getTime() : null
    if (pct == null && resetsAt == null) return null
    return { pct: pct, resetsAt: resetsAt }
  }

  async function fetchUsage() {
    try {
      var orgId = await getOrgId()
      fetchTier(orgId) // 后台拿档位，不阻塞用量展示
      var res = await fetch('/api/organizations/' + orgId + '/usage', { credentials: 'include', headers: HEADERS })
      if (!res.ok) throw new Error('usage ' + res.status)
      var data = await res.json()
      state.five = toLimit(data && data.five_hour)
      state.seven = toLimit(data && data.seven_day)
      state.error = null
      state.loaded = true
    } catch (e) {
      state.error = (e && e.message) ? e.message : String(e)
      state.loaded = true
    }
    render()
  }

  // 估算当前对话 token 数（粗略：所有消息字符数/4 + 系统提示），按对话 id 缓存
  async function fetchConvTokens() {
    var m = location.pathname.match(/\/chat\/([0-9a-fA-F-]{8,})/)
    var convId = m ? m[1] : null
    if (convId !== state.convId) { state.convId = convId; state.convTokens = null; state.convTurns = null }
    if (!convId || state.convTokens != null) return
    try {
      var orgId = await getOrgId()
      var url = '/api/organizations/' + orgId + '/chat_conversations/' + convId + '?rendering_mode=messages&tree=False'
      var res = await fetch(url, { credentials: 'include', headers: HEADERS })
      if (!res.ok) return
      var convo = await res.json()
      var chars = 0, humanTurns = 0
      var msgs = convo.chat_messages || []
      msgs.forEach(function (msg) {
        if (msg && msg.sender === 'human') humanTurns++
        if (Array.isArray(msg.content)) {
          msg.content.forEach(function (b) { if (b && b.text) chars += b.text.length })
        } else if (msg.text) chars += msg.text.length
      })
      state.convTokens = Math.round(chars / 4) + BASE_SYSTEM_PROMPT_TOKENS
      // 自回归累积的「步长」用平均人类轮数估；拿不到 sender 时退化成消息对数
      state.convTurns = humanTurns || Math.ceil(msgs.length / 2) || 1
      render()
    } catch (e) {}
  }

  // ========== 估算「还能发多少条」 ==========
  function currentWeight() {
    var sel = document.querySelector('[data-testid="model-selector-dropdown"]')
    var name = (sel && sel.textContent ? sel.textContent : '').toLowerCase()
    for (var k in MODEL_WEIGHTS) if (name.indexOf(k) !== -1) return MODEL_WEIGHTS[k]
    return DEFAULT_WEIGHT
  }

  // 返回 messages-left（数字）或 null
  //
  // LLM 上下文是自回归累积的：在同一对话里继续聊，每一轮都要重新处理全部历史，
  // 所以「下一条消息的成本」不是常数，而是随轮数线性增长：
  //   第 k 条未来消息成本 ≈ C + (k-1)·d
  //   C = 当前上下文（含系统提示）× 模型权重
  //   d = 平均每轮新增 token × 模型权重
  // N 条的累计成本 S(N) = N·C + d·N(N-1)/2，是二次（三角数），不能用 R/C 线性近似。
  // 解 S(N) = R 取正根即为「还能发多少条」；d→0 时自然退化回线性 R/C。
  function estMessages() {
    if (!state.convId || !state.convTokens) return null
    var caps = ESTIMATED_CAPS[state.tier || 'claude_free'] || {}
    var w = currentWeight()
    var C = state.convTokens * w
    if (C <= 0) return null
    var turns = state.convTurns || 1
    var d = ((state.convTokens - BASE_SYSTEM_PROMPT_TOKENS) / turns) * w
    if (!(d > 0)) d = C   // 估不出步长时退化为线性（每条都按整段算）

    var best = Infinity
    var pairs = [['session', state.five], ['weekly', state.seven]]
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0], lim = pairs[i][1], cap = caps[key]
      if (!lim || lim.pct == null || !cap) continue
      var R = ((100 - lim.pct) / 100) * cap
      var left
      if (R <= 0) left = 0
      else {
        // (d/2)·N² + (C - d/2)·N - R = 0 的正根
        var a = d / 2, b = C - d / 2
        left = (-b + Math.sqrt(b * b + 4 * a * R)) / (2 * a)
      }
      if (left < best) best = left
    }
    return best === Infinity ? null : Math.max(best, 0)
  }

  // ========== 工具 ==========
  // 与主界面相同的三档阈值配色（>=90 红 / >=70 橙 / 其余绿）
  function colorFor(pct) {
    if (pct == null) return C_FAINT
    if (pct >= 90) return C_ALERT
    if (pct >= 70) return C_WARN
    return C_OK
  }
  function pctText(pct) { return pct == null ? '—' : (Math.round(pct * 10) / 10) + '%' }

  // 侧边栏倒计时：⏱ 相对（对齐参考 formatResetTime）
  function resetSidebar(ms) {
    if (!ms) return ''
    var diff = ms - Date.now()
    if (diff <= 0) return '<span style="color:' + GREEN + '">Resetting…</span>'
    var totalMin = Math.floor(diff / 60000)
    var h = Math.floor(totalMin / 60), mn = totalMin % 60
    if (h >= 24) return '⏱ ' + Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
    if (h === 0) return '⏱ ' + mn + 'm'
    return '⏱ ' + h + 'h ' + mn + 'm'
  }

  // 底部倒计时：Reset in: <蓝色 xh ym>（对齐参考 getResetTimeHTML）
  function resetBottom(ms) {
    if (!ms) return ''
    var totalMin = Math.round((ms - Date.now()) / 60000)
    if (totalMin <= 0) return 'Reset in: <span style="color:' + BLUE + '">&lt;1m</span>'
    var h = Math.floor(totalMin / 60), mn = totalMin % 60
    var t = h > 0 ? (h + 'h ' + mn + 'm') : (totalMin + 'm')
    return 'Reset in: <span style="color:' + BLUE + '">' + t + '</span>'
  }

  // ========== 侧边栏 Usage 盒子 ==========
  function buildSidebar() {
    var box = document.createElement('div')
    box.id = SIDEBAR_ID
    box.className = 'flex flex-col'
    box.style.cssText = 'margin:0 0 16px 0;padding:0 8px;'

    var header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px 6px;user-select:none;'
    var title = document.createElement('span')
    title.textContent = 'Usage'
    title.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-500,#9a938a);'
    var gear = document.createElement('button')
    gear.type = 'button'
    gear.title = '刷新用量'
    gear.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:0;background:transparent;cursor:pointer;color:' + BLUE + ';'
    gear.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>'
    gear.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation()
      gear.style.transition = 'transform .5s ease'
      gear.style.transform = 'rotate(180deg)'
      setTimeout(function () { gear.style.transform = '' }, 500)
      state.tier = null
      fetchUsage()
    })
    header.appendChild(title)
    header.appendChild(gear)
    box.appendChild(header)

    box.appendChild(buildBar('cb-five', 'Session'))
    box.appendChild(buildBar('cb-seven', 'Weekly'))

    var err = document.createElement('div')
    err.id = 'cb-usage-err'
    err.style.cssText = 'display:none;font-size:11px;color:' + RED + ';padding:2px 8px;'
    box.appendChild(err)
    return box
  }

  function buildBar(idPrefix, label) {
    var row = document.createElement('div')
    row.style.cssText = 'margin:0 8px 8px;'
    var top = document.createElement('div')
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;white-space:nowrap;margin-bottom:3px;'
    var left = document.createElement('div')
    left.style.cssText = 'display:flex;align-items:center;gap:6px;'
    var title = document.createElement('span')
    title.textContent = label
    title.style.cssText = 'font-size:11px;color:var(--text-300,#b7afa4);'
    var pct = document.createElement('span')
    pct.id = idPrefix + '-pct'
    pct.style.cssText = 'font-size:11px;font-weight:600;'
    pct.textContent = '—'
    left.appendChild(title); left.appendChild(pct)
    var reset = document.createElement('span')
    reset.id = idPrefix + '-reset'
    reset.style.cssText = 'font-size:10px;color:var(--text-400,#8a847b);'
    top.appendChild(left); top.appendChild(reset)
    var track = document.createElement('div')
    track.style.cssText = 'height:5px;border-radius:3px;background:rgba(128,128,128,0.22);overflow:hidden;'
    var fill = document.createElement('div')
    fill.id = idPrefix + '-fill'
    fill.style.cssText = 'height:100%;width:0%;border-radius:3px;background:' + C_OK + ';transition:width .3s ease,background .3s ease;'
    track.appendChild(fill)
    row.appendChild(top); row.appendChild(track)
    return row
  }

  // ========== 输入框下方整行：左 Quota，右 Est.messages + Reset ==========
  function buildQuota() {
    var row = document.createElement('div')
    row.id = QUOTA_ID
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px 0;width:100%;box-sizing:border-box;'

    var label = document.createElement('span')
    label.textContent = 'Quota:'
    label.style.cssText = 'font-size:11px;color:var(--text-400,#8a847b);flex-shrink:0;'
    var pct = document.createElement('span')
    pct.id = 'cb-quota-pct'
    pct.style.cssText = 'font-size:11px;font-weight:600;flex-shrink:0;min-width:34px;'
    pct.textContent = '—'
    var track = document.createElement('div')
    // 固定较短宽度，不再撑满整行
    track.style.cssText = 'flex:0 0 auto;width:180px;max-width:40vw;height:5px;border-radius:3px;background:rgba(128,128,128,0.22);overflow:hidden;'
    var fill = document.createElement('div')
    fill.id = 'cb-quota-fill'
    fill.style.cssText = 'height:100%;width:0%;border-radius:3px;background:' + C_OK + ';transition:width .3s ease,background .3s ease;'
    track.appendChild(fill)

    // 弹性留白：把 Est.messages / Reset 推到行尾
    var spacer = document.createElement('div')
    spacer.style.cssText = 'flex:1;min-width:8px;'

    var est = document.createElement('span')
    est.id = 'cb-quota-est'
    est.style.cssText = 'font-size:11px;color:var(--text-400,#8a847b);flex-shrink:0;display:none;'
    var reset = document.createElement('span')
    reset.id = 'cb-quota-reset'
    reset.style.cssText = 'font-size:11px;color:var(--text-400,#8a847b);flex-shrink:0;margin-left:10px;'

    row.appendChild(label); row.appendChild(pct); row.appendChild(track)
    row.appendChild(spacer); row.appendChild(est); row.appendChild(reset)
    return row
  }

  // ========== 渲染（state → DOM） ==========
  function render() {
    if (document.getElementById(SIDEBAR_ID)) {
      paintBar('cb-five', state.five)
      paintBar('cb-seven', state.seven)
      var err = document.getElementById('cb-usage-err')
      if (err) {
        if (state.error) { err.style.display = ''; err.textContent = '⚠ ' + state.error }
        else err.style.display = 'none'
      }
    }
    if (document.getElementById(QUOTA_ID)) {
      var five = state.five
      var p = five ? five.pct : null
      var qp = document.getElementById('cb-quota-pct')
      var qf = document.getElementById('cb-quota-fill')
      var qe = document.getElementById('cb-quota-est')
      var qr = document.getElementById('cb-quota-reset')
      if (qp) { qp.textContent = pctText(p); qp.style.color = colorFor(p) }
      if (qf) { qf.style.width = Math.min(p || 0, 100) + '%'; qf.style.background = colorFor(p) }
      if (qr) qr.innerHTML = five && five.resetsAt ? resetBottom(five.resetsAt) : ''
      if (qe) {
        var n = estMessages()
        if (n == null) { qe.style.display = 'none' }
        else {
          qe.style.display = ''
          var col = n < 15 ? RED : BLUE
          qe.innerHTML = 'Est. messages: <span style="color:' + col + ';font-weight:600">' + n.toFixed(1) + '</span>'
        }
      }
    }
  }

  function paintBar(idPrefix, limit) {
    var pct = document.getElementById(idPrefix + '-pct')
    var fill = document.getElementById(idPrefix + '-fill')
    var reset = document.getElementById(idPrefix + '-reset')
    var p = limit ? limit.pct : null
    if (pct) { pct.textContent = pctText(p); pct.style.color = colorFor(p) }
    if (fill) { fill.style.width = Math.min(p || 0, 100) + '%'; fill.style.background = colorFor(p) }
    if (reset) reset.innerHTML = limit && limit.resetsAt ? resetSidebar(limit.resetsAt) : ''
  }

  // ========== 挂载点（对齐参考选择器，含 web / desktop 兜底） ==========
  function getSidebarAnchor() {
    var nav = document.querySelector('nav.flex')
    if (nav) {
      var wrap = nav.querySelector('.flex.flex-grow.flex-col.overflow-y-auto')
      var containers = wrap && wrap.querySelectorAll('.flex-1.relative')
      if (containers && containers.length) {
        var last = containers[containers.length - 1]
        var main = last.querySelector('.px-2.mt-4') || last.querySelector('.px-2.pt-2')
        if (main) {
          var starred = main.querySelector('div.flex.flex-col.mb-4')
          return { parent: main, ref: starred || main.firstChild || null }
        }
      }
    }
    var body = document.querySelector('.dframe-sidebar-body')
    if (body) {
      var scroll = body.querySelector('.dframe-nav-scroll')
      if (scroll && scroll.parentElement) return { parent: scroll.parentElement, ref: scroll }
    }
    return null
  }

  function getQuotaAnchor() {
    var sel = document.querySelector('[data-testid="model-selector-dropdown"]')
    if (!sel) return null
    var toolbar = sel.closest('.flex.w-full.items-center')
    if (!toolbar) return null
    return { after: toolbar }
  }

  function mountSidebar() {
    var existing = document.getElementById(SIDEBAR_ID)
    var anchor = getSidebarAnchor()
    if (!anchor) return
    if (!existing) existing = buildSidebar()
    var needs = existing.parentElement !== anchor.parent ||
      (anchor.ref && existing.nextElementSibling !== anchor.ref)
    if (needs) anchor.parent.insertBefore(existing, anchor.ref || null)
  }

  function mountQuota() {
    var existing = document.getElementById(QUOTA_ID)
    var anchor = getQuotaAnchor()
    if (!anchor) return
    if (!existing) existing = buildQuota()
    if (anchor.after.nextElementSibling !== existing) anchor.after.after(existing)
  }

  function ensureMounted() {
    mountSidebar()
    mountQuota()
    render()
  }

  // ========== 生命周期 ==========
  var scheduled = false
  function schedule() {
    if (scheduled) return
    scheduled = true
    setTimeout(function () { scheduled = false; ensureMounted() }, 200)
  }
  try {
    var obs = new MutationObserver(schedule)
    obs.observe(document.documentElement, { childList: true, subtree: true })
  } catch (e) {}

  ensureMounted()
  setInterval(ensureMounted, 1500)     // 补回被 SPA 重渲染清掉的节点
  setInterval(render, 1000)            // 每秒刷新倒计时
  setInterval(fetchConvTokens, 2000)   // 跟随对话切换更新 token 估算
  fetchUsage()                         // 首次取数
  fetchConvTokens()
  setInterval(fetchUsage, 60000)       // 每分钟刷新用量
})()
