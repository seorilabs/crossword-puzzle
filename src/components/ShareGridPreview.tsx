import {
  SHARE_GRID_CORRECT,
  SHARE_GRID_INCOMPLETE,
} from "../../packages/crossword-core/src";

export type ShareGridPreviewProps = {
  // buildShareGrid 가 만든 이모지 격자 문자열(🟩/⬜/전각공백, 줄바꿈 구분).
  shareGrid: string;
};

// 공유용 이모지 격자 문자열을 셀 단위 타일 미니 그리드로 렌더한다(#202).
// 정답 글자는 원본 문자열에 없으므로 여기서도 노출되지 않는다. 이모지는
// 서로게이트 쌍이라 코드포인트 단위([...line])로 나눠 1문자=1타일을 보장한다.
export function ShareGridPreview({ shareGrid }: ShareGridPreviewProps) {
  if (shareGrid.length === 0) {
    return null;
  }

  const rows = shareGrid.split("\n").map((line) => [...line]);

  return (
    <div
      className="shareGridPreview"
      role="img"
      aria-label="완성한 퍼즐 결과 격자"
    >
      {rows.map((cells, rowIndex) => (
        <div key={rowIndex} className="shareGridPreviewRow">
          {cells.map((mark, colIndex) => {
            const variant =
              mark === SHARE_GRID_CORRECT
                ? "shareGridTileCorrect"
                : mark === SHARE_GRID_INCOMPLETE
                  ? "shareGridTileIncomplete"
                  : "shareGridTileGap";
            return (
              <span key={colIndex} className={`shareGridTile ${variant}`} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
