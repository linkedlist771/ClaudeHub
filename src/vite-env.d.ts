/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  accountSessions?: {
    exportAccounts(accounts: { id: string; name: string }[]): Promise<AccountSessionResult>
    importAccounts(): Promise<AccountSessionResult>
  }
}

interface AccountSessionResult {
  ok: boolean
  canceled?: boolean
  error?: string
  count?: number
  filePath?: string
  accounts?: { id: string; name: string }[]
}
