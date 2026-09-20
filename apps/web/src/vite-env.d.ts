/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin. Empty = same-origin / Vite proxy. Never put secrets here. */
  readonly VITE_UATU_API_URL?: string;
  /** When "true", UI can enter without OAuth (mock/local gate). */
  readonly VITE_UATU_MOCK_AUTH?: string;
  /** Public GitHub App slug for install deep-link (not a secret). */
  readonly VITE_UATU_GITHUB_APP_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
