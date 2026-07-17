package com.seorilabs.crosswordpuzzle

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrosswordGameUrlsTest {
  @Test
  fun allowsOnlyPackagedGameAssetRequests() {
    assertTrue(CrosswordGameUrls.isAllowedAssetRequest(CrosswordGameUrls.INDEX_URL))
    assertTrue(
        CrosswordGameUrls.isAllowedAssetRequest(
            "https://appassets.androidplatform.net/assets/crossword-game/assets/index-Abc_123.js",
        ),
    )

    assertFalse(CrosswordGameUrls.isAllowedAssetRequest("https://example.com/game.js"))
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest(
            "https://appassets.androidplatform.net/assets/other/index.html",
        ),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest(
            "https://appassets.androidplatform.net/assets/crossword-game/../private.txt",
        ),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest(
            "https://appassets.androidplatform.net/assets/crossword-game/%2e%2e/private.txt",
        ),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest("file:///android_asset/index.html"),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest(
            "http://appassets.androidplatform.net/assets/crossword-game/index.html",
        ),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedAssetRequest(
            "${CrosswordGameUrls.INDEX_URL}?remote=true",
        ),
    )
  }

  @Test
  fun allowsOnlyExactIndexAsTopLevelNavigation() {
    assertTrue(CrosswordGameUrls.isAllowedTopLevelNavigation(CrosswordGameUrls.INDEX_URL))
    assertTrue(CrosswordGameUrls.isAllowedTopLevelNavigation("about:blank"))

    assertFalse(CrosswordGameUrls.isAllowedTopLevelNavigation("https://example.com"))
    assertFalse(
        CrosswordGameUrls.isAllowedTopLevelNavigation(
            "${CrosswordGameUrls.INDEX_URL}#redirect",
        ),
    )
    assertFalse(
        CrosswordGameUrls.isAllowedTopLevelNavigation(
            CrosswordGameUrls.ASSET_MANIFEST_URL,
        ),
    )
  }
}
