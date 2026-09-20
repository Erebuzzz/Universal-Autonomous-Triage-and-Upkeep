/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UATU_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
