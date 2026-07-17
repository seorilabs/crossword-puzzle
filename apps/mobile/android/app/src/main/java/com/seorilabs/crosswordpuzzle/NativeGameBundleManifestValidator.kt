package com.seorilabs.crosswordpuzzle

import android.content.res.AssetManager
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

data class ValidatedNativeGameBundle(val assetManifestChecksum: String)

object NativeGameBundleManifestValidator {
  private const val ASSET_ROOT = "crossword-game"
  private const val MANIFEST_PATH = "$ASSET_ROOT/asset-manifest.json"
  private const val MAX_MANIFEST_BYTES = 512 * 1024
  private const val MAX_ASSET_COUNT = 4096
  private const val EXPECTED_AGGREGATE_FORMAT = "path\\0bytes\\0sha256\\n"
  private val sha256Pattern = Regex("[0-9a-f]{64}")
  private val aggregateChecksumPattern = Regex("sha256:[0-9a-f]{64}")

  fun validate(assetManager: AssetManager): ValidatedNativeGameBundle {
    val manifestBytes =
        assetManager.open(MANIFEST_PATH, AssetManager.ACCESS_STREAMING).use {
          it.readAtMost(MAX_MANIFEST_BYTES)
        }
    val manifest = JSONObject(decodeUtf8Strict(manifestBytes))
    requireExactKeys(
        manifest,
        setOf("schemaVersion", "algorithm", "aggregateFormat", "aggregateChecksum", "files"),
    )
    require(manifest.opt("schemaVersion") is Number && manifest.getInt("schemaVersion") == 1)
    require(manifest.opt("algorithm") == "sha256")
    require(manifest.opt("aggregateFormat") == EXPECTED_AGGREGATE_FORMAT)

    val aggregateChecksum = manifest.opt("aggregateChecksum") as? String
    require(aggregateChecksum != null && aggregateChecksumPattern.matches(aggregateChecksum))
    val files = manifest.opt("files") as? JSONArray ?: error("files must be an array")
    require(files.length() in 1..MAX_ASSET_COUNT)

    val aggregateDigest = MessageDigest.getInstance("SHA-256")
    val expectedAssetPaths = linkedSetOf<String>()
    var previousPath: String? = null
    var containsIndex = false

    for (index in 0 until files.length()) {
      val entry = files.opt(index) as? JSONObject ?: error("invalid asset manifest entry")
      requireExactKeys(entry, setOf("path", "bytes", "sha256"))
      val path = entry.opt("path") as? String ?: error("asset path must be a string")
      require(CrosswordGameUrls.isSafeRelativeAssetPath(path))
      require(expectedAssetPaths.add(path))
      previousPath?.let { require(compareUtf8Bytewise(it, path) < 0) }
      previousPath = path
      containsIndex = containsIndex || path == "index.html"

      val byteCountValue = entry.opt("bytes") as? Number ?: error("asset bytes must be numeric")
      require(byteCountValue is Int || byteCountValue is Long)
      val expectedByteCount = byteCountValue.toLong()
      require(expectedByteCount >= 0)
      val expectedSha256 =
          entry.opt("sha256") as? String ?: error("asset sha256 must be a string")
      require(sha256Pattern.matches(expectedSha256))

      val actualDigest = MessageDigest.getInstance("SHA-256")
      val actualByteCount =
          assetManager.open("$ASSET_ROOT/$path", AssetManager.ACCESS_STREAMING).use { input ->
            digestAndCount(input, actualDigest)
          }
      require(actualByteCount == expectedByteCount)
      require(actualDigest.digest().toHex() == expectedSha256)

      aggregateDigest.update(path.toByteArray(StandardCharsets.UTF_8))
      aggregateDigest.update(0.toByte())
      aggregateDigest.update(expectedByteCount.toString().toByteArray(StandardCharsets.UTF_8))
      aggregateDigest.update(0.toByte())
      aggregateDigest.update(expectedSha256.toByteArray(StandardCharsets.UTF_8))
      aggregateDigest.update('\n'.code.toByte())
    }

    require(containsIndex)
    require("sha256:${aggregateDigest.digest().toHex()}" == aggregateChecksum)

    val packagedPaths = listAssetFiles(assetManager, ASSET_ROOT).mapTo(linkedSetOf()) {
      it.removePrefix("$ASSET_ROOT/")
    }
    require(packagedPaths == expectedAssetPaths + "asset-manifest.json")
    return ValidatedNativeGameBundle(aggregateChecksum)
  }

  private fun requireExactKeys(objectValue: JSONObject, expected: Set<String>) {
    val actual = buildSet {
      val keys = objectValue.keys()
      while (keys.hasNext()) add(keys.next())
    }
    require(actual == expected)
  }

  private fun InputStream.readAtMost(maxBytes: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maxBytes, DEFAULT_BUFFER_SIZE))
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0
    while (true) {
      val read = read(buffer)
      if (read < 0) return output.toByteArray()
      if (read == 0) continue
      total = Math.addExact(total, read)
      require(total <= maxBytes)
      output.write(buffer, 0, read)
    }
  }

  private fun decodeUtf8Strict(bytes: ByteArray): String =
      StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes))
          .toString()

  private fun digestAndCount(input: InputStream, digest: MessageDigest): Long {
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0L
    while (true) {
      val read = input.read(buffer)
      if (read < 0) return total
      if (read == 0) continue
      digest.update(buffer, 0, read)
      total = Math.addExact(total, read.toLong())
    }
  }

  private fun listAssetFiles(assetManager: AssetManager, path: String): Set<String> {
    val children = assetManager.list(path) ?: error("unable to list packaged assets")
    if (children.isEmpty()) return setOf(path)
    return children.flatMapTo(linkedSetOf()) { child ->
      listAssetFiles(assetManager, "$path/$child")
    }
  }

  private fun compareUtf8Bytewise(left: String, right: String): Int {
    val leftBytes = left.toByteArray(StandardCharsets.UTF_8)
    val rightBytes = right.toByteArray(StandardCharsets.UTF_8)
    val sharedLength = minOf(leftBytes.size, rightBytes.size)
    for (index in 0 until sharedLength) {
      val difference =
          (leftBytes[index].toInt() and 0xff) - (rightBytes[index].toInt() and 0xff)
      if (difference != 0) return difference
    }
    return leftBytes.size - rightBytes.size
  }

  private fun ByteArray.toHex(): String =
      joinToString(separator = "") { byte -> "%02x".format(byte) }
}
