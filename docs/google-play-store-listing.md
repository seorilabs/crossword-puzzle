# Google Play 스토어 등록 정보

## Source Of Truth

- 설정 파일: `play-store/google-play.config.json`
- 이미지 폴더: `play-store/assets`, `play-store/screenshots/phone`
- API-writable listing 검증 명령:

```bash
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root . --allow-missing-tablet --allow-console-gates
npm run play:listing:dry-run
```

- 전체 launch readiness 검증 명령:

```bash
npm run check:play
```

`npm run check:play`는 Play Console 정책 gate가 끝나기 전까지 실패하는 것이 정상이다.

## 현재 확정값

| 항목             | 값                 |
| ---------------- | ------------------ |
| packageName      | `com.seorilabs.crosswordpuzzle` |
| 기본 언어        | `ko-KR`            |
| 앱 유형          | `game`             |
| 가격             | `free`             |
| 고객 문의 이메일 | `cs@seorilabs.com` |
| 개인정보 처리방침 | `https://www.seorilabs.com/privacy/` |
| 광고             | 현재 제출 binary 기준 `no`. AdMob 콘솔 ID는 확보했고 native adapter 연결 전 |
| 한국 배포        | `yes`              |
| 첫 업로드 트랙   | `internal`         |

## 확정 필요

| 항목                  | 후보/메모                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Data Safety           | 로그인, 결제, 서버 저장 없음. 로컬 저장만 사용한다는 현재 구현 기준으로 설문 검토 필요                               |
| 콘텐츠 등급           | 낱말 퍼즐 게임 기준 IARC 설문 완료 필요                                                                              |
| 타겟 연령             | 아동 대상 여부와 가족 정책 해당 여부 확인 필요                                                                       |
| 한국 게임 등급        | 한국 배포 유지 시 GRAC/자체등급분류 필요 여부 확인 필요                                                              |

## 2026-06-07 검토 메모

- `https://www.seorilabs.com/privacy/`는 공개 URL이며 200 응답을 확인했다.
- Android `apps/mobile` 타깃은 `INTERNET` 권한과 원격 퍼즐팩 fetch를 사용한다.
- Android `apps/mobile` 타깃은 RNFirebase Analytics/Remote Config를 사용한다. AdMob 콘솔 앱/광고 단위는 생성했지만 AdMob SDK/native adapter는 아직 없다.
- 진행 상태와 미션 상태는 `AsyncStorage`에 로컬 저장된다.
- Data Safety 최종 선언은 Play Console에서 직접 검토해야 한다. Google Play 기준상 앱/SDK가 사용자 데이터를 기기 밖으로 전송하는지 여부가 핵심이고, 로컬 처리만 하는 데이터는 수집으로 보지 않는다.

## 2026-06-09 AdMob 콘솔 ID

현재 ID 확보 상태이며, 운영 광고 게재는 AdMob SDK/native adapter 연결과 QA 이후 적용한다. 개발/QA 빌드는 Google test ad unit을 사용한다.

| 항목 | 값 |
| --- | --- |
| Android AdMob app ID | `ca-app-pub-2444587584524186~5456766418` |
| `android_rewarded_hint` | `ca-app-pub-2444587584524186/7533141122` |
| `android_interstitial_result` | `ca-app-pub-2444587584524186/4930691809` |
| `android_rewarded_bonus_puzzle` | `ca-app-pub-2444587584524186/2299285882` |

## 2026-06-07 API 반영 결과

- Android Publisher API edit `01758169730218357159`로 details/listing/images를 반영하고 commit했다.
- `npm run play:listing:verify` readback 결과 `defaultLanguage`, `contactEmail`, 한국어 앱명, 짧은 설명, 상세 설명이 config와 일치했다.
- 반영된 이미지: 앱 아이콘 1장, feature graphic 1장, phone screenshot 3장.
- privacy policy URL은 API 적용 대상이 아니므로 Play Console에서 직접 입력/검토해야 한다.

## 등록 문구

앱 이름:

```text
가로세로 낱말 퍼즐
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
