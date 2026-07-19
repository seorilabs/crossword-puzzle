package com.seorilabs.crosswordpuzzle

object NativeDevelopmentGameRuntimeOverride {
  const val INTENT_EXTRA = "com.seorilabs.crosswordpuzzle.DEV_GAME_RUNTIME"
  const val INITIAL_PROPERTY_NAME = "nativeDevelopmentGameRuntimeOverride"
  const val INITIAL_PROPERTY_TOKEN = "crossword-native-game-runtime-debug-v1"

  fun resolveInitialProperty(isDebugBuild: Boolean, explicitlyRequested: Boolean): String? =
      if (isDebugBuild && explicitlyRequested) INITIAL_PROPERTY_TOKEN else null
}
