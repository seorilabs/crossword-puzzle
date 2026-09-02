package com.seorilabs.crosswordpuzzle

import com.facebook.react.bridge.ReactApplicationContext

class NativeAppInfoModule(
  reactContext: ReactApplicationContext,
) : NativeAppInfoSpec(reactContext) {

  override fun getName() = NAME

  // 태그 유래 실제 앱 버전. build.gradle 의 APP_VERSION_NAME → versionName → BuildConfig 로
  // 들어온 값이라 릴리즈마다 달라진다. JS 분석 레이어가 release_version 으로 싣는다.
  override fun getAppVersion(): String = BuildConfig.VERSION_NAME

  companion object {
    const val NAME = "NativeAppInfo"
  }
}
