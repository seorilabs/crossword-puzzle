package com.seorilabs.crosswordpuzzle

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

class CrosswordGameWebViewManager : RNCWebViewManager() {
  override fun getName(): String = NAME

  override fun addEventEmitters(
      reactContext: ThemedReactContext,
      view: RNCWebViewWrapper,
  ) {
    view.webView.webViewClient = CrosswordGameWebViewClient(reactContext)
  }

  override fun setNewSource(view: RNCWebViewWrapper, value: ReadableMap?) {
    val sourceUrl =
        if (value != null && value.hasKey("uri") && !value.isNull("uri")) {
          value.getString("uri")
        } else {
          null
        }
    val isSafeGet =
        sourceUrl == CrosswordGameUrls.INDEX_URL &&
            value != null &&
            (!value.hasKey("method") ||
                value.getString("method").equals("GET", ignoreCase = true)) &&
            !value.hasKey("body") &&
            !value.hasKey("headers")
    super.setNewSource(view, if (isSafeGet) value else null)
  }

  override fun loadUrl(view: RNCWebViewWrapper, url: String) {
    if (CrosswordGameUrls.isAllowedTopLevelNavigation(url)) {
      super.loadUrl(view, url)
    }
  }

  override fun setAllowFileAccess(view: RNCWebViewWrapper, value: Boolean) =
      super.setAllowFileAccess(view, false)

  override fun setAllowFileAccessFromFileURLs(view: RNCWebViewWrapper, value: Boolean) =
      super.setAllowFileAccessFromFileURLs(view, false)

  override fun setAllowUniversalAccessFromFileURLs(view: RNCWebViewWrapper, value: Boolean) =
      super.setAllowUniversalAccessFromFileURLs(view, false)

  override fun setMixedContentMode(view: RNCWebViewWrapper, value: String?) =
      super.setMixedContentMode(view, "never")

  override fun setJavaScriptCanOpenWindowsAutomatically(
      view: RNCWebViewWrapper,
      value: Boolean,
  ) = super.setJavaScriptCanOpenWindowsAutomatically(view, false)

  override fun setThirdPartyCookiesEnabled(view: RNCWebViewWrapper, value: Boolean) =
      super.setThirdPartyCookiesEnabled(view, false)

  override fun setWebviewDebuggingEnabled(view: RNCWebViewWrapper, value: Boolean) =
      super.setWebviewDebuggingEnabled(view, false)

  companion object {
    const val NAME = "CrosswordGameWebView"
  }
}
