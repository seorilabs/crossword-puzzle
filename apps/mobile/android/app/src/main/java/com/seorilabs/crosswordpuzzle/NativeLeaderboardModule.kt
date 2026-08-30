package com.seorilabs.crosswordpuzzle

import android.app.Activity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.google.android.gms.games.PlayGames

class NativeLeaderboardModule(
  reactContext: ReactApplicationContext,
) : NativeLeaderboardSpec(reactContext) {

  override fun getName() = NAME

  override fun isSupported(): Boolean =
    BuildConfig.PLAY_GAMES_PROJECT_ID.isNotBlank() &&
      BuildConfig.PLAY_GAMES_LEADERBOARD_ID.isNotBlank()

  override fun isAuthenticated(promise: Promise) {
    val activity = getSupportedActivity(promise) ?: return
    PlayGames.getGamesSignInClient(activity).isAuthenticated
      .addOnSuccessListener { result -> promise.resolve(result.isAuthenticated) }
      .addOnFailureListener { error ->
        promise.reject(ERROR_AUTH_FAILED, error.message, error)
      }
  }

  override fun submitScore(score: Double, promise: Promise) {
    withAuthenticatedActivity(promise, requireInteractiveSignIn = false) { activity ->
      PlayGames.getLeaderboardsClient(activity)
        .submitScoreImmediate(
          BuildConfig.PLAY_GAMES_LEADERBOARD_ID,
          score.coerceAtLeast(0.0).toLong(),
        )
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { error ->
          promise.reject(ERROR_SUBMIT_FAILED, error.message, error)
        }
    }
  }

  override fun openLeaderboard(promise: Promise) {
    withAuthenticatedActivity(promise, requireInteractiveSignIn = true) { activity ->
      PlayGames.getLeaderboardsClient(activity)
        .getLeaderboardIntent(BuildConfig.PLAY_GAMES_LEADERBOARD_ID)
        .addOnSuccessListener { intent ->
          activity.runOnUiThread {
            activity.startActivityForResult(intent, LEADERBOARD_REQUEST_CODE)
            promise.resolve(null)
          }
        }
        .addOnFailureListener { error ->
          promise.reject(ERROR_OPEN_FAILED, error.message, error)
        }
    }
  }

  private fun withAuthenticatedActivity(
    promise: Promise,
    requireInteractiveSignIn: Boolean,
    action: (Activity) -> Unit,
  ) {
    val activity = getSupportedActivity(promise) ?: return

    val signInClient = PlayGames.getGamesSignInClient(activity)
    signInClient.isAuthenticated
      .addOnSuccessListener { result ->
        if (result.isAuthenticated) {
          action(activity)
          return@addOnSuccessListener
        }

        if (!requireInteractiveSignIn) {
          promise.reject(ERROR_AUTH_REQUIRED, "Play Games authentication is required")
          return@addOnSuccessListener
        }

        // 자동 인증이 끝나지 않은 경우 사용자가 순위 CTA를 누른 명시적 열람 경로에서만
        // 계정 선택 UI를 연다. 완료 직후 자동 제출은 위 auth_required로 종결한다.
        signInClient.signIn()
          .addOnSuccessListener { signInResult ->
            if (signInResult.isAuthenticated) {
              action(activity)
            } else {
              promise.reject(ERROR_AUTH_REQUIRED, "Play Games authentication is required")
            }
          }
          .addOnFailureListener { error ->
            promise.reject(ERROR_AUTH_FAILED, error.message, error)
          }
      }
      .addOnFailureListener { error ->
        promise.reject(ERROR_AUTH_FAILED, error.message, error)
      }
  }

  private fun getSupportedActivity(promise: Promise): Activity? {
    if (!isSupported()) {
      promise.reject(ERROR_NOT_CONFIGURED, "Play Games leaderboard is not configured")
      return null
    }

    val activity = reactApplicationContext.getCurrentActivity()
    if (activity == null) {
      promise.reject(ERROR_ACTIVITY_UNAVAILABLE, "Current Android activity is unavailable")
      return null
    }
    return activity
  }

  companion object {
    const val NAME = "NativeLeaderboard"
    private const val LEADERBOARD_REQUEST_CODE = 9004
    private const val ERROR_NOT_CONFIGURED = "leaderboard_not_configured"
    private const val ERROR_ACTIVITY_UNAVAILABLE = "activity_unavailable"
    private const val ERROR_AUTH_REQUIRED = "leaderboard_auth_required"
    private const val ERROR_AUTH_FAILED = "leaderboard_auth_failed"
    private const val ERROR_SUBMIT_FAILED = "leaderboard_submit_failed"
    private const val ERROR_OPEN_FAILED = "leaderboard_open_failed"
  }
}
