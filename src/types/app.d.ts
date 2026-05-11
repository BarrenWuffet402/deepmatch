interface AppConfig {
  name: string
  tagline: string
  accent: string
  accentB: string
  bg: string
}

declare global {
  interface Window {
    APP: AppConfig
  }
}

export {}
