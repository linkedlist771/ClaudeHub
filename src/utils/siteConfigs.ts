// Website configuration used by the ChatGPT webview input adapter.
export interface SiteConfig {
  id: string
  domains: string[]
  name: string
  url: string
  color: string
  textareaSelectors: string[]
  sendButtonSelectors: string[]
  textInputMethod: 'direct' | 'simulate' | 'chatgpt_safe' | 'gemini_safe' | 'contenteditable_safe'
}

export const SITE_CONFIGS: SiteConfig[] = [
  {
    id: 'chatgpt',
    domains: ['chatgpt.com', 'chat.openai.com'],
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#0F9D7A',
    textareaSelectors: [
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      '[contenteditable="true"]'
    ],
    sendButtonSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]'
    ],
    textInputMethod: 'chatgpt_safe'
  }
]

export function getSiteConfigById(id: string): SiteConfig | undefined {
  return SITE_CONFIGS.find(config => config.id === id)
}
