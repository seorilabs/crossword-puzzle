import type { Puzzle } from "../../packages/crossword-core/src";
import { formatDifficultyLabel, formatThemeChipLabel } from "../puzzleLabels";

type PuzzleMetaChipsProps = {
  difficulty?: Puzzle["difficulty"];
  themeLabel?: string;
  themeTag?: string;
};

// 선택한 퍼즐 카드에 주제(테마)·난이도 칩을 노출한다(#248).
// 주제 칩은 themeLabel 이 있을 때만, 난이도 칩은 difficulty 가 있을 때만 렌더한다.
// 둘 다 없으면 컨테이너 자체를 렌더하지 않아 일반 퍼즐에서 회귀가 없다.
export function PuzzleMetaChips({
  difficulty,
  themeLabel,
  themeTag,
}: PuzzleMetaChipsProps) {
  const themeChipLabel = formatThemeChipLabel(themeLabel, themeTag);
  const difficultyLabel = formatDifficultyLabel(difficulty);

  if (themeChipLabel == null && difficultyLabel === "") {
    return null;
  }

  return (
    <div className="puzzleMetaChips" aria-label="퍼즐 정보">
      {themeChipLabel != null && (
        <span className="puzzleChip puzzleChipTheme">{themeChipLabel}</span>
      )}
      {difficultyLabel !== "" && (
        <span className="puzzleChip puzzleChipDifficulty">
          {difficultyLabel}
        </span>
      )}
    </div>
  );
}
