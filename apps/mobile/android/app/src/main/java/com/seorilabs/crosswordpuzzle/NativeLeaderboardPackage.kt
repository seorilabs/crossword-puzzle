package com.seorilabs.crosswordpuzzle

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class NativeLeaderboardPackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? =
    if (name == NativeLeaderboardModule.NAME) {
      NativeLeaderboardModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      NativeLeaderboardModule.NAME to ReactModuleInfo(
        name = NativeLeaderboardModule.NAME,
        className = NativeLeaderboardModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
    )
  }
}
