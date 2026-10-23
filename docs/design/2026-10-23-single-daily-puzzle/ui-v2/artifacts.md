# 시안 렌더와 증적 보관

- 보관 위치: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948`
- NAS: `smb://nas1dual/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948`
- 렌더 기준: `4170abdad5db7ad111702420f12a95736ce2c477`
- 검증: 실제 SMB 서버 nas1dual, 공유 Data 확인. 스트림 복사 후 NAS 파일을 다시 읽어 전체 40개, 1,399,607바이트의 크기와 SHA-256 대조 완료.
- 최종 목록: [VERIFIED.json](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/VERIFIED.json), SHA-256 `284db3f90b71ad4b88cddffa9d7a95f89e1b5e77658f602cba42bd19496a469b`
- 보관 목적: 시각 방향 선택, 설계 승인과 운영 점검 근거. 만료 기간 승인을 받지 않아 임의 삭제하지 않음.
- 로컬: 렌더 PNG와 원시 응답은 NAS 검증 후 정리. HTML, CSS, 예시 데이터와 확인 요약은 Git에 유지. 이미 들어간 Git 이력은 재작성하지 않음.

- [풀이 화면 비교](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/play-comparison.png)
- [홈 화면 비교](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/home-comparison.png)
- [영문 화면 예시](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/global-comparison.png)
- [작은 화면의 풀이](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/small-play.png)
- [작은 화면의 퍼즐북 홈](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/small-home-c.png)
- [작은 영문 화면](/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-23/4170abdad5db7ad111702420f12a95736ce2c477/puzzle-audit-ui-v2-20261023T095948/ui-v2/small-global.png)

## 시안 파일

| 파일 | 바이트 | SHA-256 |
|---|---|---|
| global-comparison.png | 207885 | `404100ad3936e28c2f4b67803eecd7dd3fc3aff07c2bc562b7c1473a4032461d` |
| home-comparison.png | 273165 | `53c88b71bd9d8c044a815b40c9095a53bfaf3a699874f9b3ca73e63fdd46993e` |
| play-comparison.png | 269973 | `0723f5397341f43b56182b4baa667039b5f1b6208b0861b5085e3966eae355db` |
| small-global.png | 49148 | `c1460ccba635f0005f1b5d69d5bc381e006789a8e95db092ebfec2e813776076` |
| small-home-c.png | 36016 | `6efa47749929fe7150d3c1a04cf5c0173082ed20fe268e658005c58e53cfb8c6` |
| small-play.png | 41461 | `371499d33f60d184ca44afd55c083c213c96d86609f198d83625849ac8820e5f` |
| preview.png | 95720 | `bf78c90aac3b84507b706444e862b497d6991ad608af9a029108861fb688d3c2` |

운영 점검의 원시 결과와 생성 실험은 같은 작업 폴더의 audit, exploration 아래 보관한다. 미리보기 확인은 앱 실행이나 출시 완료 근거가 아니다.
