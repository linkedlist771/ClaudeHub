/*
 * 注入到 claude.ai webview 主世界的脚本：
 * 在对话页右上角 Share 按钮旁，添加一个「导出为 Markdown」按钮。
 * 复用页面已登录会话（credentials:include）直接调内部接口拿结构化对话，
 * 再转成 Markdown 下载。按钮样式克隆自 Claude 自带的 Share 按钮，融入原生 UI。
 *
 * 通过 webview.executeJavaScript(原始字符串) 注入，故此文件以 ?raw 形式引入，
 * 不参与打包/转译，可放心使用模板字符串、反引号、\n 与正则。
 */
(function () {
  if (window.__claudehubExportInjected) return
  // 仅在 claude.ai（含子域）上运行；其他站点直接返回
  if (location.hostname.indexOf('claude.ai') === -1) return
  window.__claudehubExportInjected = true

  var BTN_ID = 'claudehub-export-md'

  // —— 样式：直接克隆 Claude 自带 Share 按钮的类名，保证视觉一致 ——
  var BTN_CLASS =
    'cds-reset group/btn relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 ' +
    'whitespace-nowrap select-none border-0 outline-none rounded h-control font-sans text-body font-medium ' +
    '[&:disabled:not([aria-busy])]:opacity-50 disabled:pointer-events-none transition-shadow duration-fast ' +
    'focus-visible:shadow-focus text-primary aria-pressed:text-accent px-md'

  var BG_CLASS =
    'absolute -z-[1] rounded-[inherit] transition-colors duration-fast ' +
    'group-focus-visible/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)] bg-fill-secondary ' +
    'group-hover/btn:bg-fill-secondary-hover group-aria-expanded/btn:bg-fill-secondary-hover inset-0 ' +
    'cds-btn-squish shadow-field'

  var DOWNLOAD_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/></svg>'

  function createButton() {
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.id = BTN_ID
    btn.setAttribute('data-cds', 'Button')
    btn.setAttribute('data-size', 'sm')
    btn.setAttribute('data-testid', 'claudehub-export-md')
    btn.setAttribute('aria-label', '导出为 Markdown')
    btn.title = '导出当前对话为 Markdown'
    btn.className = BTN_CLASS
    btn.innerHTML =
      '<span aria-hidden="true" class="' + BG_CLASS + '"></span>' +
      '<span class="inline-flex items-center gap-1">' + DOWNLOAD_ICON + '<span>Markdown</span></span>'
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      onExportClick(btn)
    })
    return btn
  }

  // 把按钮插到 Share 按钮左侧（同一横向工具栏内，不另起一行，最不突兀）
  function ensureButton() {
    var containers = document.querySelectorAll('[data-testid="wiggle-controls-actions"]')
    for (var i = 0; i < containers.length; i++) {
      var container = containers[i]
      if (container.querySelector('#' + BTN_ID)) continue
      var shareBtn = container.querySelector('[data-testid="wiggle-controls-actions-share"]')
      var btn = createButton()
      if (shareBtn) {
        container.insertBefore(btn, shareBtn)
      } else {
        container.appendChild(btn)
      }
    }
  }

  // —— 轻量 toast 反馈 ——
  function toast(msg, isError) {
    var el = document.createElement('div')
    el.textContent = msg
    el.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'left:50%',
      'top:18px',
      'transform:translateX(-50%)',
      'max-width:80vw',
      'padding:10px 16px',
      'border-radius:10px',
      'font-size:13px',
      'font-weight:500',
      'color:#fff',
      'box-shadow:0 6px 24px rgba(0,0,0,0.18)',
      'background:' + (isError ? '#b54a35' : '#3d7a52'),
      'opacity:0',
      'transition:opacity .2s ease, top .2s ease',
      'pointer-events:none'
    ].join(';')
    document.body.appendChild(el)
    requestAnimationFrame(function () {
      el.style.opacity = '1'
      el.style.top = '26px'
    })
    setTimeout(function () {
      el.style.opacity = '0'
      setTimeout(function () { el.remove() }, 250)
    }, isError ? 4200 : 2600)
  }

  function onExportClick(btn) {
    if (btn.getAttribute('aria-busy') === 'true') return
    var label = btn.querySelector('span > span:last-child')
    var prev = label ? label.textContent : ''
    btn.setAttribute('aria-busy', 'true')
    btn.disabled = true
    if (label) label.textContent = '导出中…'

    exportCurrentConversation()
      .then(function (info) {
        toast('已导出：' + info.filename, false)
      })
      .catch(function (err) {
        toast('导出失败：' + (err && err.message ? err.message : err), true)
      })
      .then(function () {
        btn.removeAttribute('aria-busy')
        btn.disabled = false
        if (label) label.textContent = prev || 'Markdown'
      })
  }

  // —— 核心：拉取当前对话并转 Markdown 下载 ——
  async function exportCurrentConversation() {
    var m = location.pathname.match(/\/chat\/([0-9a-fA-F-]{8,})/)
    if (!m) throw new Error('请在某个对话页面里点击导出')
    var convId = m[1]

    var headers = { 'anthropic-client-platform': 'web_claude_ai', accept: '*/*' }

    var orgsRes = await fetch('/api/organizations', { credentials: 'include', headers: headers })
    if (!orgsRes.ok) throw new Error('获取组织失败 (' + orgsRes.status + ')')
    var orgs = await orgsRes.json()
    var list = Array.isArray(orgs) ? orgs : []
    var org =
      list.find(function (o) { return o && Array.isArray(o.capabilities) && o.capabilities.indexOf('chat') !== -1 }) ||
      list[0]
    var orgId = org && org.uuid
    if (!orgId) throw new Error('未找到组织（可能未登录）')

    var url =
      '/api/organizations/' + orgId + '/chat_conversations/' + convId + '?rendering_mode=messages&tree=False'
    var convoRes = await fetch(url, { credentials: 'include', headers: headers })
    if (!convoRes.ok) throw new Error('获取对话失败 (' + convoRes.status + ')')
    var convo = await convoRes.json()

    var md = convertToMarkdown(convo)
    var filename = sanitizeFilename(convo.name || 'claude-conversation') + '.md'
    download(md, filename)
    return { filename: filename }
  }

  function convertToMarkdown(convo) {
    var lines = []
    var title = (convo.name && convo.name.trim()) || 'Claude Conversation'
    lines.push('# ' + title)
    lines.push('')
    lines.push('> 从 claude.ai 导出 · ' + new Date().toLocaleString())
    if (convo.uuid) lines.push('> Conversation ID: `' + convo.uuid + '`')
    lines.push('')

    var messages = (convo.chat_messages || []).slice()
    // 有 index 时按 index 排序，保证顺序稳定
    messages.sort(function (a, b) {
      var ai = typeof a.index === 'number' ? a.index : 0
      var bi = typeof b.index === 'number' ? b.index : 0
      return ai - bi
    })

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i]
      var role = msg.sender === 'human' ? '🧑 Human' : '🤖 Assistant'
      lines.push('---')
      lines.push('')
      lines.push('## ' + role)
      lines.push('')
      lines.push(renderMessage(msg))
      lines.push('')
    }
    return lines.join('\n')
  }

  function renderMessage(msg) {
    var parts = []
    var content = msg.content
    if (Array.isArray(content) && content.length) {
      for (var i = 0; i < content.length; i++) {
        var rendered = renderBlock(content[i])
        if (rendered) parts.push(rendered)
      }
    } else if (msg.text) {
      parts.push(msg.text)
    }

    // 附件（人类上传的文件）
    var atts = []
    if (Array.isArray(msg.attachments)) {
      msg.attachments.forEach(function (a) {
        if (a && a.file_name) atts.push(a.file_name)
      })
    }
    if (Array.isArray(msg.files)) {
      msg.files.forEach(function (f) {
        if (f && f.file_name) atts.push(f.file_name)
      })
    }
    if (atts.length) parts.push('> 📎 附件: ' + atts.join(', '))

    var body = parts
      .filter(function (s) { return s != null && String(s).trim() !== '' })
      .join('\n\n')
    return body || '_（空消息）_'
  }

  function renderBlock(b) {
    if (!b || typeof b !== 'object') return ''
    var fence = '```'
    switch (b.type) {
      case 'text':
        return b.text || ''
      case 'thinking':
        var think = b.thinking || b.text || ''
        if (!think.trim()) return ''
        return '<details>\n<summary>💭 思考过程</summary>\n\n' + think + '\n\n</details>'
      case 'tool_use':
        var name = b.name || 'tool'
        var input = ''
        try {
          input = fence + 'json\n' + JSON.stringify(b.input, null, 2) + '\n' + fence
        } catch (e) {
          input = ''
        }
        return '> 🔧 **工具调用: ' + name + '**\n\n' + input
      case 'tool_result':
        var c = b.content
        if (Array.isArray(c)) {
          c = c.map(function (x) { return (x && x.text) || '' }).join('\n')
        } else if (c != null && typeof c !== 'string') {
          try { c = JSON.stringify(c, null, 2) } catch (e) { c = String(c) }
        }
        c = c || ''
        return '> 📥 **工具结果**\n\n' + fence + '\n' + c + '\n' + fence
      default:
        return b.text || ''
    }
  }

  function sanitizeFilename(name) {
    return String(name)
      .replace(/[\\/:*?"<>| -]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'claude-conversation'
  }

  function download(text, filename) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    var objUrl = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () {
      URL.revokeObjectURL(objUrl)
      a.remove()
    }, 1500)
  }

  // —— 保持按钮存在：SPA 路由切换 / 工具栏重渲染后自动补回 ——
  var scheduled = false
  function schedule() {
    if (scheduled) return
    scheduled = true
    setTimeout(function () {
      scheduled = false
      ensureButton()
    }, 200)
  }
  try {
    var obs = new MutationObserver(schedule)
    obs.observe(document.documentElement, { childList: true, subtree: true })
  } catch (e) {}
  ensureButton()
  setInterval(ensureButton, 1500)
})()
