/// <reference types="vite/client" />

// 빌드 시 vite define으로 주입되는 패키지 유래 앱 버전 상수(#293). release_version
// 계측의 fallback으로 쓴다(배포 시 VITE_APP_VERSION 미주입 환경 대비).
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // 배포 워크플로가 주입하는 태그 유래 버전(예: 0.1.1)과 릴리즈 태그(예: v0.1.1).
  readonly VITE_APP_VERSION?: string;
  readonly VITE_RELEASE_TAG?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_PUZZLE_MANIFEST_URL?: string;
  readonly VITE_PUZZLE_PACK_BASE_URL?: string;
  readonly VITE_RETURN_REMINDER_TEMPLATE_CODE?: string;
  readonly VITE_SHARE_LANDING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
