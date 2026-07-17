package com.seorilabs.crosswordpuzzle

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader

class CrosswordGameAssetPathHandler(context: Context) : WebViewAssetLoader.PathHandler {
  private val assetsPathHandler = WebViewAssetLoader.AssetsPathHandler(context)

  override fun handle(path: String): WebResourceResponse? {
    if (!CrosswordGameUrls.isSafeRelativeAssetPath(path)) return null
    return assetsPathHandler.handle("crossword-game/$path")
  }
}
