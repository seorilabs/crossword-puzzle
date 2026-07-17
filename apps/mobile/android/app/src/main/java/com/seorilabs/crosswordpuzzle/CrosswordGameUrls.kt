package com.seorilabs.crosswordpuzzle

import java.net.URI

object CrosswordGameUrls {
  const val ASSET_ORIGIN = "https://appassets.androidplatform.net"
  const val ASSET_PATH_PREFIX = "/assets/crossword-game/"
  const val INDEX_URL = "$ASSET_ORIGIN${ASSET_PATH_PREFIX}index.html"
  const val ASSET_MANIFEST_URL = "$ASSET_ORIGIN${ASSET_PATH_PREFIX}asset-manifest.json"

  private val safePathSegment = Regex("[A-Za-z0-9._-]+")

  fun isAllowedAssetRequest(candidateUrl: String): Boolean {
    val uri = parse(candidateUrl) ?: return false
    if (!hasExpectedOrigin(uri) || uri.rawQuery != null || uri.rawFragment != null) return false
    val path = uri.rawPath ?: return false
    if (!path.startsWith(ASSET_PATH_PREFIX)) return false
    return isSafeRelativeAssetPath(path.removePrefix(ASSET_PATH_PREFIX))
  }

  fun isAllowedTopLevelNavigation(candidateUrl: String): Boolean =
      candidateUrl == INDEX_URL || candidateUrl == "about:blank"

  fun isSafeRelativeAssetPath(path: String): Boolean {
    if (
        path.isEmpty() ||
            path.startsWith('/') ||
            path.endsWith('/') ||
            '\\' in path ||
            '%' in path
    ) {
      return false
    }
    return path.split('/').all { segment ->
      segment != "." && segment != ".." && safePathSegment.matches(segment)
    }
  }

  private fun hasExpectedOrigin(uri: URI): Boolean =
      uri.scheme.equals("https", ignoreCase = true) &&
          uri.host.equals("appassets.androidplatform.net", ignoreCase = true) &&
          uri.port == -1 &&
          uri.rawUserInfo == null

  private fun parse(candidateUrl: String): URI? =
      try {
        URI(candidateUrl)
      } catch (_: IllegalArgumentException) {
        null
      }
}
