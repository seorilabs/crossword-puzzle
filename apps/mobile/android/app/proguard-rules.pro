# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# =====================================================================
# R8(minify) 활성화용 방어 규칙. React Native·Firebase·Google Mobile Ads 등
# 최신 네이티브 모듈은 대부분 AAR에 consumer proguard 규칙을 포함하지만,
# 라이브 앱 안정성을 위해 리플렉션/네이티브 접근 지점을 방어적으로 유지한다.
# =====================================================================

# --- React Native / Hermes ---
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclasseswithmembernames class * { native <methods>; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# --- 앱 네이티브 코드(MainActivity/MainApplication 등, 리플렉션 대비) ---
-keep class com.seorilabs.crosswordpuzzle.** { *; }

# --- Firebase / Google Mobile Ads(consumer 규칙 보완, 경고 억제) ---
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
