// Claude 用量（额度/计费）探测与展示的共享逻辑
// 主进程直接请求用量接口会被 Cloudflare 403，因此统一在「已登录的 webview」内
// 通过 executeJavaScript 发 fetch —— 真浏览器上下文、已过 Cloudflare、cookie 自动带上。

// 在 webview 主世界里执行的取数脚本（返回 { ok, data } 或 { ok:false, ... }）
export const USAGE_SCRIPT = `
  (async function() {
    try {
      const h = { 'anthropic-client-platform': 'web_claude_ai', accept: '*/*' };
      const orgsRes = await fetch('/api/organizations', { credentials: 'include', headers: h });
      if (!orgsRes.ok) return { ok: false, stage: 'orgs', status: orgsRes.status };
      const orgs = await orgsRes.json();
      const list = Array.isArray(orgs) ? orgs : [];
      const org = list.find(o => Array.isArray(o.capabilities) && o.capabilities.includes('chat')) || list[0];
      const orgId = org && org.uuid;
      if (!orgId) return { ok: false, stage: 'orgs', error: '未找到组织（可能未登录）' };
      const usageRes = await fetch('/api/organizations/' + orgId + '/usage', { credentials: 'include', headers: h });
      if (!usageRes.ok) return { ok: false, stage: 'usage', status: usageRes.status };
      const data = await usageRes.json();
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  })()
`

export interface ClaudeUsage {
  fiveHourPercent?: number     // 5 小时窗口已用百分比
  fiveHourResetsAt?: string    // 5 小时窗口重置时间（ISO）
  sevenDayPercent?: number     // 7 天窗口已用百分比
  sevenDayResetsAt?: string    // 7 天窗口重置时间（ISO）
  limited?: boolean            // 是否已受限（任一窗口 >= 100%）
  loading?: boolean            // 正在刷新
  error?: string               // 刷新失败原因
  updatedAt?: number           // 上次更新时间戳
}

// 把用量接口返回的原始 JSON 解析成 ClaudeUsage
export function parseUsage(data: any): ClaudeUsage {
  const five = data?.five_hour
  const seven = data?.seven_day
  const fivePct = five?.utilization
  const sevenPct = seven?.utilization
  return {
    fiveHourPercent: fivePct,
    fiveHourResetsAt: five?.resets_at,
    sevenDayPercent: sevenPct,
    sevenDayResetsAt: seven?.resets_at,
    limited: (fivePct ?? 0) >= 100 || (sevenPct ?? 0) >= 100,
    loading: false,
    error: undefined,
    updatedAt: Date.now()
  }
}

// 在指定 webview 内取一次用量，返回 ClaudeUsage 或抛错
export async function fetchUsageFromWebview(webview: any): Promise<ClaudeUsage> {
  if (!webview?.executeJavaScript) throw new Error('webview 尚未就绪')
  const res = await webview.executeJavaScript(USAGE_SCRIPT)
  if (res?.ok && res.data) return parseUsage(res.data)
  throw new Error(res?.error || `获取失败${res?.status ? ' (' + res.status + ')' : ''}`)
}

// 额度状态颜色（与 Dashboard 保持一致）
export function usageColor(percent?: number): string {
  if (percent == null) return 'var(--faint)'
  if (percent >= 90) return 'var(--alert)'
  if (percent >= 70) return 'var(--warn)'
  return 'var(--ok)'
}

// 百分比展示（四舍五入）
export function pct(p?: number): string {
  return p == null ? '—' : `${Math.round(p)}%`
}

// 5 小时窗口：紧凑相对时间「47m」「2h10m」
export function fiveHourResetShort(iso?: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = t - Date.now()
  if (diff <= 0) return '重置中'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h${m}m` : `${h}h`
}

// 7 天窗口：紧凑「周五 23:00」
export function sevenDayResetShort(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${week} ${hh}:${mm}`
}
