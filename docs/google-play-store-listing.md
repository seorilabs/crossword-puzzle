# Google Play 스토어 등록 정보

## Source Of Truth

- 설정 파일: `play-store/google-play.config.json`
- 이미지 폴더: `play-store/assets`, `play-store/screenshots/phone`
- 검증 명령:

```bash
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root . --allow-missing-tablet
npm run check:play
```

## 현재 확정값

| 항목             | 값                 |
| ---------------- | ------------------ |
| 기본 언어        | `ko-KR`            |
| 앱 유형          | `game`             |
| 가격             | `free`             |
| 고객 문의 이메일 | `cs@seorilabs.com` |
| 광고             | `no`               |
| 한국 배포        | `yes`              |
| 첫 업로드 트랙   | `internal`         |

## 확정 필요

| 항목                  | 후보/메모                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| packageName           | RN skeleton은 `com.seorilabs.crosswordpuzzle`로 생성됨. Play Console 생성 후 삭제/재사용이 불가하므로 최종 확인 필요 |
| 개인정보 처리방침 URL | 후보: `https://www.seorilabs.com/privacy`. 실제 내용이 이 앱의 데이터 처리와 맞는지 확인 필요                        |
| Data Safety           | 로그인, 결제, 서버 저장 없음. 로컬 저장만 사용한다는 현재 구현 기준으로 설문 검토 필요                               |
| 콘텐츠 등급           | 낱말 퍼즐 게임 기준 IARC 설문 완료 필요                                                                              |
| 타겟 연령             | 아동 대상 여부와 가족 정책 해당 여부 확인 필요                                                                       |
| 한국 게임 등급        | 한국 배포 유지 시 GRAC/자체등급분류 필요 여부 확인 필요                                                              |

## 등록 문구

앱 이름:

```text
가로세로낱말퍼즐
```

짧은 설명:

```text
매일 한 판씩 푸는 한글 가로세로 낱말 퍼즐
```

상세 설명은 `play-store/google-play.config.json`의 `storeListing.fullDescription.ko-KR`를 기준으로 한다.

## 이미지

| 용도               | 파일                                             | 규격        |
| ------------------ | ------------------------------------------------ | ----------- |
| 앱 아이콘          | `play-store/assets/icon-512.png`                 | 512 x 512   |
| Feature graphic    | `play-store/assets/feature-graphic-1024x500.png` | 1024 x 500  |
| Phone screenshot 1 | `play-store/screenshots/phone/phone-1.png`       | 1080 x 1920 |
| Phone screenshot 2 | `play-store/screenshots/phone/phone-2.png`       | 1080 x 1920 |
| Phone screenshot 3 | `play-store/screenshots/phone/phone-3.png`       | 1080 x 1920 |

Tablet screenshot은 아직 만들지 않았다. 지금 검증은 `--allow-missing-tablet`로 진행한다.
