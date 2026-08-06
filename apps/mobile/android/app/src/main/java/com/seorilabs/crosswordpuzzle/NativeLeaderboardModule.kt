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

  override fun submitScore(score: Double, promise: Promise) {
    withAuthenticatedActivity(promise) { activity ->
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
    withAuthenticatedActivity(promise) { activity ->
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
    action: (Activity) -> Unit,
  ) {
    if (!isSupported()) {
      promise.reject(ERROR_NOT_CONFIGURED, "Play Games leaderboard is not configured")
      return
    }

    val activity = reactApplicationContext.getCurrentActivity()
    if (activity == null) {
      promise.reject(ERROR_ACTIVITY_UNAVAILABLE, "Current Android activity is unavailable")
      return
    }

    val signInClient = PlayGames.getGamesSignInClient(activity)
    signInClient.isAuthenticated
      .addOnSuccessListener { result ->
        if (result.isAuthenticated) {
          action(activity)
          return@addOnSuccessListener
        }

        // 자동 인증이 끝나지 않은 경우 사용자가 순위 기능을 요청한 시점에만 계정
        // 선택 UI를 연다. 퍼즐 시작/풀이 플로우에는 인증을 강제하지 않는다.
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
