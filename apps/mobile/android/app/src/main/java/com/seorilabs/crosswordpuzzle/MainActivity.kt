package com.seorilabs.crosswordpuzzle

import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.util.UUID

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "CrosswordPuzzleMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? = createLaunchOptions()
      }

  private fun createLaunchOptions(): Bundle? =
      try {
        val validatedBundle = NativeGameBundleManifestValidator.validate(assets)
        Bundle().apply {
          putBundle(
              "nativeGameBundle",
              Bundle().apply {
                putString("indexUrl", CrosswordGameUrls.INDEX_URL)
                putString("assetManifestUrl", CrosswordGameUrls.ASSET_MANIFEST_URL)
                putString("assetManifestChecksum", validatedBundle.assetManifestChecksum)
                putString("bridgeSessionId", UUID.randomUUID().toString())
              },
          )
          NativeDevelopmentGameRuntimeOverride.resolveInitialProperty(
                  isDebugBuild = BuildConfig.DEBUG,
                  explicitlyRequested =
                      intent.getBooleanExtra(
                          NativeDevelopmentGameRuntimeOverride.INTENT_EXTRA,
                          false,
                      ),
              )
              ?.let { value ->
                putString(NativeDevelopmentGameRuntimeOverride.INITIAL_PROPERTY_NAME, value)
              }
        }
      } catch (error: Exception) {
        Log.e(TAG, "Native game bundle validation failed; game runtime disabled.", error)
        null
      }

  companion object {
    private const val TAG = "CrosswordMainActivity"
  }
}
