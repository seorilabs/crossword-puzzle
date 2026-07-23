# AppsInToss 등록 이미지 (crossword-puzzle-game)

게임 카테고리로 재등록하는 `crossword-puzzle-game`(miniAppId 56407)용 AIT 등록 이미지 세트다.
브랜드는 기존 앱과 동일한 **가로세로 낱말 퍼즐**로 통일했다. 실제 앱 UI/무드(코랄+틸+크림 타일, Toss 팔레트)에 맞춰 제작했고, 규격·알파 검증을 통과했다.

## 파일 / 규격 / 콘솔 매핑

| 파일 | 규격 | 콘솔 항목 | MCP 필드 |
| ---- | ---- | --------- | -------- |
| `crossword-puzzle-game-icon-600.png` | 600×600 PNG, 불투명 | 앱 로고/아이콘 | `iconUri` (icon 업로드) |
| `crossword-puzzle-game-thumbnail-1932x828.png` | 1932×828 PNG, 불투명 | 가로 썸네일 | images `THUMBNAIL`/`HORIZONTAL`, `gameInfo.horizontalThumbnailUri` |
| `screenshots/crossword-puzzle-game-start-636x1048.png` | 636×1048 PNG | 스크린샷1(시작/홈) | images `PREVIEW`/`VERTICAL` |
| `screenshots/crossword-puzzle-game-play-636x1048.png` | 636×1048 PNG | 스크린샷2(퍼즐 풀이) | images `PREVIEW`/`VERTICAL` |
| `screenshots/crossword-puzzle-game-result-636x1048.png` | 636×1048 PNG | 스크린샷3(결과/완성판) | images `PREVIEW`/`VERTICAL` |

## MCP 이미지 페이로드 참고값

- 썸네일: `backgroundColor` `#FB6547`(아이콘과 동일 코랄), `backgroundTheme` `LIGHT`
- 스크린샷 3장: `backgroundColor` `#FFFFFF`, `backgroundTheme` `LIGHT`
- 게임은 PREVIEW 스크린샷이 필수라 3장을 모두 등록한다.

## 제작 메모

- 로고: 코랄 풀블리드 배경 + 틸 말풍선 패널 + 크림 타일(낱·말·스마일). 기존 로고의 **둥근 앱마스크 형태를 제거**해 AIT 가이드(둥근 마스크·테두리 프레임 금지)를 맞췄다.
- 썸네일: 워드마크 **"가로세로 낱말"**(스토어명과 일치). 배경을 **아이콘과 동일한 코랄(#FB6547)** 로 통일하고, 워드마크는 코랄 위 대형 흰색 볼드(가독성 확보), 세부 힌트·보드는 흰 카드에 배치. 정답 타일은 아이콘의 크림 타일을 에코.
- 스크린샷: 실제 앱 화면(홈/풀이/결과)을 픽셀 충실하게 재현. 결과 화면은 하단 여백을 "오늘의 완성판" 미니보드로 채워 강화했다.
- Toss/외부 저작물 리소스를 사용하지 않았다. 폰트는 Apple SD Gothic Neo(앱의 Pretendard 대체).
- 재생성 스크립트: 세션 scratchpad `gen_assets.py`(로고·썸네일), `gen_shots.py`(스크린샷).

## 검증

```bash
python3 ~/.claude/skills/apps-in-toss-registration-images/scripts/validate_registration_images.py \
  --asset-dir release-assets/apps-in-toss --app-id crossword-puzzle-game
```
