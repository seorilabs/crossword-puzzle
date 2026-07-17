package com.seorilabs.crosswordpuzzle

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import com.reactnativecommunity.webview.RNCWebViewClient
import java.io.ByteArrayInputStream

class CrosswordGameWebViewClient(context: Context) : RNCWebViewClient() {
  private val assetLoader =
      WebViewAssetLoader.Builder()
          .setDomain("appassets.androidplatform.net")
          .setHttpAllowed(false)
          .addPathHandler(
              CrosswordGameUrls.ASSET_PATH_PREFIX,
              CrosswordGameAssetPathHandler(context),
          )
          .build()

  override fun shouldInterceptRequest(
      view: WebView,
      request: WebResourceRequest,
  ): WebResourceResponse? {
    if (request.method != "GET") return blockedResponse(405, "Method Not Allowed")
    return intercept(request.url)
  }

  @Suppress("DEPRECATION")
  override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
      intercept(Uri.parse(url))

  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    if (
        request.isForMainFrame &&
            !CrosswordGameUrls.isAllowedTopLevelNavigation(request.url.toString())
    ) {
      return true
    }
    return super.shouldOverrideUrlLoading(view, request)
  }

  @Suppress("DEPRECATION")
  override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
    if (!CrosswordGameUrls.isAllowedTopLevelNavigation(url)) return true
    return super.shouldOverrideUrlLoading(view, url)
  }

  private fun intercept(uri: Uri): WebResourceResponse? {
    if (!CrosswordGameUrls.isAllowedAssetRequest(uri.toString())) {
      return blockedResponse(403, "Forbidden")
    }
    return assetLoader.shouldInterceptRequest(uri) ?: blockedResponse(404, "Not Found")
  }

  private fun blockedResponse(statusCode: Int, reasonPhrase: String): WebResourceResponse =
      WebResourceResponse(
          "text/plain",
          "UTF-8",
          statusCode,
          reasonPhrase,
          mapOf(
              "Cache-Control" to "no-store",
              "Content-Security-Policy" to "default-src 'none'",
          ),
          ByteArrayInputStream(ByteArray(0)),
      )
}
