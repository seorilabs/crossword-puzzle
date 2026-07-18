import type { JsonPrimitive } from "./saveV2.ts";

export type GameMotionMode = "system" | "reduced";
export type GameContrastMode = "system" | "high";
export type GameTextScale = "normal" | "large" | "extra-large";

export type GameExperiencePreferences = Readonly<{
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  hapticEnabled: boolean;
  motionMode: GameMotionMode;
  contrastMode: GameContrastMode;
  textScale: GameTextScale;
}>;

export const DEFAULT_GAME_EXPERIENCE_PREFERENCES: GameExperiencePreferences =
  Object.freeze({
    bgmEnabled: true,
    sfxEnabled: true,
    hapticEnabled: true,
    motionMode: "system",
    contrastMode: "system",
    textScale: "normal",
  });

function booleanValue(
  record: Readonly<Record<string, JsonPrimitive>>,
  key: string,
): boolean | null {
  return typeof record[key] === "boolean" ? record[key] : null;
}

export function normalizeGameTextScale(value: unknown): GameTextScale {
  return value === "large" || value === "extra-large" ? value : "normal";
}

export function getGameTextScaleMultiplier(scale: GameTextScale): number {
  if (scale === "extra-large") return 2;
  if (scale === "large") return 1.5;
  return 1;
}

export function normalizeGameExperiencePreferences(
  settings: Readonly<Record<string, JsonPrimitive>> = {},
  accessibility: Readonly<Record<string, JsonPrimitive>> = {},
): GameExperiencePreferences {
  const legacySound = booleanValue(settings, "soundEnabled");
  const motionMode =
    accessibility.motionMode === "reduced" ||
    booleanValue(accessibility, "reducedMotion") === true
      ? "reduced"
      : "system";
  const contrastMode =
    accessibility.contrastMode === "high" ||
    booleanValue(accessibility, "highContrast") === true
      ? "high"
      : "system";

  return Object.freeze({
    bgmEnabled:
      booleanValue(settings, "bgmEnabled") ??
      legacySound ??
      DEFAULT_GAME_EXPERIENCE_PREFERENCES.bgmEnabled,
    sfxEnabled:
      booleanValue(settings, "sfxEnabled") ??
      legacySound ??
      DEFAULT_GAME_EXPERIENCE_PREFERENCES.sfxEnabled,
    hapticEnabled:
      booleanValue(settings, "hapticEnabled") ??
      DEFAULT_GAME_EXPERIENCE_PREFERENCES.hapticEnabled,
    motionMode,
    contrastMode,
    textScale: normalizeGameTextScale(accessibility.textScale),
  });
}

export function resolveReducedMotion(
  preferences: Pick<GameExperiencePreferences, "motionMode">,
  systemPrefersReducedMotion: boolean,
): boolean {
  return preferences.motionMode === "reduced" || systemPrefersReducedMotion;
}

export function resolveHighContrast(
  preferences: Pick<GameExperiencePreferences, "contrastMode">,
  systemPrefersHighContrast: boolean,
): boolean {
  return preferences.contrastMode === "high" || systemPrefersHighContrast;
}

export function projectGamePreferenceRecords(
  preferences: GameExperiencePreferences,
): Readonly<{
  settings: Readonly<Record<string, JsonPrimitive>>;
  accessibility: Readonly<Record<string, JsonPrimitive>>;
}> {
  return Object.freeze({
    settings: Object.freeze({
      bgmEnabled: preferences.bgmEnabled,
      sfxEnabled: preferences.sfxEnabled,
      hapticEnabled: preferences.hapticEnabled,
      // Legacy runtime has one sound toggle. Re-enable it only when both new
      // channels are enabled so rollback never plays a channel the user muted.
      soundEnabled: preferences.bgmEnabled && preferences.sfxEnabled,
    }),
    accessibility: Object.freeze({
      motionMode: preferences.motionMode,
      reducedMotion: preferences.motionMode === "reduced",
      contrastMode: preferences.contrastMode,
      highContrast: preferences.contrastMode === "high",
      textScale: preferences.textScale,
    }),
  });
}
