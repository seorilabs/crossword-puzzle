# 보드 고정 수정본

- 렌더 기준: `39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3`
- 보관 위치: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3/fixed-board-20261023T131855`
- 최종 목록: [VERIFIED.json](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3/fixed-board-20261023T131855/VERIFIED.json), SHA-256 `7ea0be79f3f4781ffec59a9e2ca81c9412be5a35d6fabba16c06bdf556bcbda4`
- 실제 NAS1dual Data SMB 연결 확인 뒤 스트림 복사와 fsync, 닫기 후 직접 읽기로 3개, 195,069바이트의 크기와 SHA-256을 대조했다.
- 목적은 시안 확인이다. 만료 기간을 승인받지 않아 임의 삭제하지 않는다. 로컬 작업 파일은 최종 확인 뒤 정리한다.
- 단어 이동 240개 경우와 최대 10개 후보의 12개 경우에서 보드, 단서, 답칸과 버튼의 위치 및 크기가 유지됐다. 360×800, 390×844, 430×932와 단서 22px 설정을 포함한다. 후보 높이 57px, 최소 너비 55.18px를 확인했다. 실제 앱 반영과 L3는 미실행이다.

| 파일 | 바이트 | SHA-256 |
|---|---:|---|
| [tile-preview.html](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3/fixed-board-20261023T131855/tile-preview.html) | 45915 | `515a1f36220945b65a587e879dcb7fa4749765e10e5e702c7aa20576addc45ff` |
| [fixed-board-comparison.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3/fixed-board-20261023T131855/fixed-board-comparison.png) | 112020 | `a02bd31a64ee7b71d1dc9e06d387821babf9ef87e15d51bfa279ea29d9d96f85` |
| [small-fixed-board.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/39fbc2bff6d60c24d5fedb7e4aa2164fe8d9bca3/fixed-board-20261023T131855/small-fixed-board.png) | 37134 | `370e2abf7a9f03f9f42bb49ae9bf8395863b2a537a8aa9117da2b797adf6ea82` |

## 이전 시안과 실행 원본 보관

- 렌더 기준: `14571481af069aa01eb108fe63f93e604144647f`
- 보관 위치: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427`
- NAS: `smb://nas1dual/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427`
- 스트림 복사, 닫기와 fsync 후 NAS 사본 직접 읽기로 6개 파일, 576,547바이트의 크기와 SHA-256을 대조했다.
- 마지막 검증 목록: [VERIFIED.json](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/VERIFIED.json), SHA-256 `0cee6299bd8d95eca4eac3bebce5100320ad8a4a8a399cb7ea9ebf2d692b1f17`
- 목적은 시안과 입력 흐름 검토다. 만료 기간을 승인받지 않아 임의 삭제하지 않는다.
- 로컬 렌더와 중간 파일은 최종 확인 뒤 정리한다. 편집 원본과 작은 점검 요약은 Git에 둔다.

| 파일 | 바이트 | SHA-256 |
|---|---:|---|
| [tile-preview.html](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/tile-preview.html) | 46618 | `8dc6f6711361c0c60fb13b678516509ed55a5b9f5d35e1d9ad171605bf04b66b` |
| [ko-comparison.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/ko-comparison.png) | 197131 | `8475a04e7e89d33a297df82ea4b1c1afd4015b81ed8dc3741eecb70cddc10dec` |
| [en-comparison.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/en-comparison.png) | 208929 | `e06f234132087883aaca02ee107c1203716abce8561072681fc2473519a49620` |
| [ko-play.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/ko-play.png) | 42135 | `ed9d7047f22aab775ede6da98245cdfdf5120b2c7f490ca56df60fbbdd7797d5` |
| [small-play.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/small-play.png) | 40620 | `76f101290c47238a040ca21398948c276552e8ca7148ad0aa4ff3e6f491a96b5` |
| [large-text-play.png](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/14571481af069aa01eb108fe63f93e604144647f/tile-ui-v3-20261023T110427/large-text-play.png) | 41114 | `9875251a84161bca5acb5be4502bf6fd809f9969e7944523f249885c9f4fb69a` |

`tile-preview.html`은 외부 파일 없이 열리는 단일 HTML이다. 타일 선택, 오답 복구와 완주를 누를 수 있다. 초기화는 시안의 저장 키만 지운다. 영어는 배치 예시다. 제품 앱과 계정, 실제 저장에는 연결되지 않는다.

독립 Edge 브라우저에서 한국어 18단어와 영어 예시 22단어의 타일 완주, 오답과 취소, 힌트, 이어풀기를 확인했다. 132개 배치에서 가림과 넘침이 없었고, 후보 타일 높이는 57px이었다. 360×800 화면에서 단서 22px와 안내 14px도 별도로 확인했다. 시스템 키보드 입력 요소는 없다. 제품 앱의 L3와 독립 검수는 미실행이다.
