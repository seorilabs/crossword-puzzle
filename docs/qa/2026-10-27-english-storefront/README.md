# 영어 스토어 등록정보 준비

2026년 10월 27일 App Store Connect에서 1.3.1의 `READY_FOR_SALE`, 빌드 `1003001`, 한국어 등록정보와 판매 국가 `KOR`을 확인했다. 다음 업데이트용 영문 문구와 이미지 원본을 준비했으며 이 변경만으로 스토어 언어, 판매 국가나 배포 버전은 바뀌지 않는다.

## 등록 원본

- App Store 문구는 `app-store/app-store.config.json`의 `en-US`다. 영문 이름은 앱의 실제 영문 홈 이름과 맞춘 `Daily Word Play: Crosswords`다.
- Google Play 문구는 `play-store/google-play.config.json`의 `en-US`다.
- `app-store/english-localizations.json`은 원본 언어, 제공자 언어, 스크린샷과 영문 정책 URL을 지정한다. App Store는 `en-US`, `en-CA`, `en-AU`에 같은 미국식 영어 안내를 사용한다. 영어 퍼즐의 미국식 철자는 소개에 명시했다. 뉴질랜드의 기본 등록 언어는 Apple 공식 표에 따라 `en-AU`다.
- 한국어 기본 언어, 기존 한국어 이미지와 공개된 1.3.1의 자료는 유지한다. config의 다음 업데이트용 한국어 및 영어 개선 문구는 이번 등록정보 변경만 설명한다. 게임 기능은 1.3.1에서 이미 출시했다.

## 이미지와 확인 범위

영문 iPhone 3장, iPad 3장, Play 휴대전화 3장, 7인치 태블릿 2장과 10인치 태블릿 2장을 추가했다. 최종 이미지와 크기, SHA-256은 `app-store/english-assets.manifest.json`과 `app-store/english-storefront-review.json`에 있다.

제품 코드 기준은 `900b346608b0b35c165c185ebae51741c6bff4b2`다. `vite.qa-native.config.ts`로 실제 RN 앱을 RN Web에서 실행하고 공개된 2026년 10월 27일 영어 1번 퍼즐을 사용했다. 홈, 타일 세 단어 입력, 13단어 완료를 실제 버튼 입력으로 캡처했다. 시각 합성, 이미지 크기 변경이나 가짜 운영체제 화면은 사용하지 않았다. 13장을 열어 문구와 화면을 확인했고 가로 넘침과 페이지 오류는 없었다. 기존 영문 보드로 만든 Play feature graphic과 아이콘은 재사용한다.

외부 광고, 저장과 플랫폼 서비스 경계에는 개발용 adapter를 사용했다. 실제 광고 SDK, iOS Simulator 또는 실기기 실행을 주장하지 않는다. 게임 화면 코드는 바꾸지 않았으며 새 UI 독립 검수 회차도 시작하지 않았다.

## 검증

- 13장 PNG의 지정 크기, 불투명 배경, 언어별 장수와 파일 해시 확인
- App Store 제목 26자, 부제 29자, 홍보 문구 123자, 소개 726자, 키워드 62자로 제한 이내
- 한국어와 영어 문구의 기능, 날짜 갱신, 언어별 저장과 완료 후 광고 설명을 실제 구현과 대조
- App Store 필드와 이미지에서 다른 모바일 마켓의 홍보나 구현하지 않은 기능 주장 없음
- 기존 deliver 준비 도구에 언어별 파생 config를 전달해 3개 영어 언어의 필드 9개와 이미지 6장씩 생성, 누락 없음
- Play 등록 스크립트의 영문 config dry-run 통과. 외부 API 호출 없음
- `check:app-store`, `check:play`, `typecheck`, `lint`, `check:release-parity`, `build`, `check:mobile` 통과. 모바일 21개 묶음, 130개 테스트 통과

`check:app-store`와 `check:play`는 로컬 자료 검사이며 스토어 저장이나 공개의 증거가 아니다. 이번 변경은 문구, 번역, 이미지와 등록 메타데이터뿐이라 로컬 모델 코드 리뷰 대상이 아니다.

## 다음 실행

Apple은 편집 가능한 상태에서만 새 언어를 추가할 수 있다. 현재 새 편집 버전은 없다. 다음 패치 `1.3.2`를 확인받으면 태그 정본으로 새 후보와 빌드를 준비하고 해당 초안에 영문 정보를 저장한다. 공개된 1.3.1의 한국어 정보와 이미지는 덮어쓰지 않는다. 실제 저장 후 모든 활성 언어와 이미지 처리, 순서, 체크섬을 다시 읽어 대조한다.

국가 확대 제안은 기존 한국을 유지하면서 미국, 캐나다, 호주와 뉴질랜드를 추가하는 것이다. 아직 국가 변경을 실행하지 않았다. 영문 심사 승인과 공개 확인 후 국가별 상품 페이지를 재조회한다.

Google Play는 기존 개발자 계정 확인의 미해결 사항을 유지하며 등록정보를 쓰지 않았다. AIT의 법적 확인과 기기 검증 대기도 별도다. 새 국가, 가격, 광고 지면, 권한과 앱 식별자를 바꾸지 않았다.

## 참고

- [Apple 언어 추가와 수정](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information)
- [국가별 App Store 언어](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations)
- [영문 개인정보처리방침](https://www.seorilabs.com/en/apps/crossword-puzzle/privacy/)
- [영문 지원](https://www.seorilabs.com/en/support/)

검증 원본, 캡처 원본과 API 조회 원본 137개, 4,865,686바이트를 다음 위치에 보관했다. 파일을 직접 기록한 뒤 flush, fsync, 직접 재읽기와 SHA-256 대조를 완료했다. 작업에서 생긴 AppleDouble 보조 파일은 제거했고 원장에 든 파일은 유지했다.

`/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/english-storefront-20261026T235625Z/VERIFIED.json`

공개 개인정보처리방침의 과거 힌트 안내는 [공식 사이트 PR #100](https://github.com/seorilabs/seorilabs-official/pull/100)에서 1.3.1 동작과 이전 버전 설명으로 정정한다. 두 언어의 320px 실행, 사이트 검사, lint와 83개 페이지 빌드도 통과했다.
