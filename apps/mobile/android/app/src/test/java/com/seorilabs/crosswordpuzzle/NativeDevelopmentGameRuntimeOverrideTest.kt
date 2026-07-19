package com.seorilabs.crosswordpuzzle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeDevelopmentGameRuntimeOverrideTest {
  @Test
  fun requiresDebugBuildAndExplicitIntentExtra() {
    assertNull(
        NativeDevelopmentGameRuntimeOverride.resolveInitialProperty(
            isDebugBuild = false,
            explicitlyRequested = true,
        ),
    )
    assertNull(
        NativeDevelopmentGameRuntimeOverride.resolveInitialProperty(
            isDebugBuild = true,
            explicitlyRequested = false,
        ),
    )
    assertEquals(
        NativeDevelopmentGameRuntimeOverride.INITIAL_PROPERTY_TOKEN,
        NativeDevelopmentGameRuntimeOverride.resolveInitialProperty(
            isDebugBuild = true,
            explicitlyRequested = true,
        ),
    )
  }
}
