/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUZZLE_MANIFEST_URL?: string;
  readonly VITE_PUZZLE_PACK_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
