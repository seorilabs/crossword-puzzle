import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  DEFAULT_GAME_EXPERIENCE_PREFERENCES,
  getGameTextScaleMultiplier,
  normalizeGameExperiencePreferences,
  projectGamePreferenceRecords,
  resolveHighContrast,
  resolveReducedMotion,
} from "./gamePreferences.ts";

describe("game experience preferences", () => {
  it("기본값은 시스템 motion/contrast와 독립 BGM·SFX·햅틱이다", () => {
    assert.deepEqual(
      normalizeGameExperiencePreferences(),
      DEFAULT_GAME_EXPERIENCE_PREFERENCES,
    );
  });

  it("legacy sound toggle을 BGM과 SFX 두 채널에 안전하게 이관한다", () => {
    assert.deepEqual(
      normalizeGameExperiencePreferences(
        { soundEnabled: false, hapticEnabled: false },
        { reducedMotion: true, highContrast: true, textScale: "large" },
      ),
      {
        bgmEnabled: false,
        sfxEnabled: false,
        hapticEnabled: false,
        motionMode: "reduced",
        contrastMode: "high",
        textScale: "large",
      },
    );
  });

  it("앱 reduced/high 설정과 시스템 설정 중 더 안전한 값을 적용한다", () => {
    assert.equal(resolveReducedMotion({ motionMode: "system" }, true), true);
    assert.equal(resolveReducedMotion({ motionMode: "reduced" }, false), true);
    assert.equal(resolveHighContrast({ contrastMode: "system" }, true), true);
    assert.equal(resolveHighContrast({ contrastMode: "high" }, false), true);
  });

  it("100/150/200% 글자 배율과 legacy projection을 결정적으로 만든다", () => {
    assert.equal(getGameTextScaleMultiplier("normal"), 1);
    assert.equal(getGameTextScaleMultiplier("large"), 1.5);
    assert.equal(getGameTextScaleMultiplier("extra-large"), 2);
    const records = projectGamePreferenceRecords({
      bgmEnabled: false,
      sfxEnabled: true,
      hapticEnabled: true,
      motionMode: "reduced",
      contrastMode: "high",
      textScale: "extra-large",
    });
    assert.equal(records.settings.soundEnabled, false);
    assert.equal(records.accessibility.reducedMotion, true);
    assert.equal(records.accessibility.textScale, "extra-large");
  });
});
