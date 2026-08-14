/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_AUTH_BYPASS?: string
}

declare module '*.svg?component' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

declare module '*.svg?url' {
  const url: string
  export default url
}
