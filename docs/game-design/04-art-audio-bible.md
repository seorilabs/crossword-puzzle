# 아트 오디오 바이블

- 제품명: `말길: 가로세로 모험` (제안명)
- 문서 상태: draft
- 소유자: Art Direction / Audio
- 버전/수정일: v0.2 / 2026-07-17
- Source of truth: 게임의 시각, VFX, 오디오, 햅틱 방향과 에셋 승인 기준은 이 문서가 소유한다.
- Depends on: `00-product-brief.md`, `02-gdd.md`, `03-ui-ux-spec.md`
- Open blockers: `BLK-ART-001`, `BLK-CHAR-001`, `BLK-AUDIO-001`, `BLK-LICENSE-001`, `BLK-I18N-001`
- 승인 근거: 부분 승인 — 2026-07-17 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` (`DEC-015`); 그 외 결정은 사용자 승인 전

## 아트 방향

핵심 문장은 `잉크로 이어 붙이는 따뜻한 종이 세계`다. 위에서 내려다본 2D 격자가 퍼즐 중에는 종이 지도처럼 보이고, 단어가 완성될수록 길, 집, 나무, 작은 주민이 얕은 2.5D 종이 모형으로 일어난다.

### 세 가지 원칙

1. **읽기 우선**: 격자, 단서, 입력은 장식보다 항상 선명하다.
2. **논리의 시각화**: 단어와 교차점의 관계를 잉크 흐름과 길 연결로 보여준다.
3. **손으로 만든 온기**: 종이 가장자리, 잉크 농담, 작은 불완전성을 쓰되 텍스트와 터치 표적에는 적용하지 않는다.

피해야 할 방향은 사실적인 3D, 수족관 수집, 일반적인 세계 명소 여행 배경, 과도한 반짝임, 카지노형 보상 연출, 읽기 어려운 AI풍 장식 문자다.

이 문서는 승인 전 direction draft다. `ART-ANCHOR-001` style anchor, high-fidelity key screen, machine-readable asset manifest가 승인되기 전 아트 양산 gate는 열린 상태로 유지한다.

## 시각 문법

| 상태      | 형태                           | 색               | 움직임                      |
| --------- | ------------------------------ | ---------------- | --------------------------- |
| 잠긴 길   | 끊긴 점선과 접힌 종이          | 저채도 남색      | 미세한 바람만               |
| 선택 단어 | 두꺼운 연속 외곽선             | 청록             | 느린 호흡 1회               |
| 부분 입력 | 칸 안 잉크 점                  | 짙은 남청        | 80ms 정착                   |
| 오답      | 접힌 모서리와 `다시 생각` 표식 | 진홍             | 좌우 흔들기 대신 한 번 접힘 |
| 완료 단어 | 이어진 길과 작은 등불          | 황금빛 주황      | 진행 방향 sweep             |
| 교차 연쇄 | 매듭 모양 교차점               | 청록→금색        | 파동이 연결 길로 전파       |
| 보드 완료 | 평면 지도가 입체 엽서로 전환   | 테마 팔레트 전체 | 2초 이내 단계적 펼침        |

- 완성 전과 후의 silhouette가 달라야 한다.
- 테마별 팔레트는 바뀌어도 선택, 오답, 완료의 기능 색 의미는 유지한다.
- 텍스트, 숫자, 정답 음절은 이미지에 굽지 않고 런타임 폰트로 렌더링한다.

### 기준 팔레트와 카메라

| Token     | Hex       | 용도                 |
| --------- | --------- | -------------------- |
| Paper 50  | `#FFF8E8` | 배경                 |
| Ink 900   | `#17243A` | 본문·미복원 길       |
| Teal 600  | `#087E78` | 선택·focus 보조      |
| Gold 500  | `#E59B32` | 완료·등불            |
| Red 600   | `#B83B45` | 오답·위험            |
| Leaf 500  | `#629B62` | 자연 챕터 accent     |
| Night 800 | `#26345F` | 밤 챕터 surface      |
| White     | `#FFFFFF` | 고대비 글자와 외곽선 |

- 기능 outline은 1x 기준 2px, focus는 3px, 캐릭터 silhouette는 1.5px를 시작값으로 한다.
- 광원은 좌상단 35도 단일 soft key와 완료 길의 emissive accent만 쓴다. 격자 위 그림자 opacity는 12% 이하로 제한한다.
- 퍼즐 중 카메라는 top-down 고정이며 pan과 zoom은 사용자 버튼에만 반응한다. 단어 완료 시 카메라 이동을 금지하고 보드 완료 때만 최대 6% dolly를 허용한다.

## 캐릭터와 세계

### 안내자 제안

작은 종이 두루마리에서 태어난 `마루`를 안내자로 둔다. 둥근 몸체와 접힌 책갈피 꼬리만으로 32px에서도 알아볼 수 있어야 한다. 사람, 특정 동물, 기존 경쟁작의 외계인·물고기와 직접 겹치지 않는다.

필수 포즈는 idle, look, walk, celebrate, puzzled, sleep 6종이다. 표정은 눈과 몸 기울기만 사용해 작은 화면에서도 읽히게 한다. 캐릭터가 정답을 대신 말하거나 단서를 가리지 않도록 격자 길 바깥을 이동한다.

### 세계 구조

| 챕터 | 테마          | 복원 대상            | 색 온도     |
| ---- | ------------- | -------------------- | ----------- |
| 1    | 골목의 말들   | 표지판, 가게, 우체통 | 따뜻한 오후 |
| 2    | 숲의 말들     | 오솔길, 버섯집, 개울 | 청록과 연두 |
| 3    | 밤하늘의 말들 | 관측대, 별길, 등대   | 남색과 금색 |
| 4    | 기억의 서재   | 책장, 사다리, 종이새 | 갈색과 자주 |

장소는 정답 때문에 실제로 변해야 한다. 배경만 교체하고 같은 격자 연출을 반복하는 방식은 승인하지 않는다.

## UI 아트 경계

- Phaser 후보가 Phase 0을 통과하면 세계, 격자 배경, 잉크 길, 캐릭터, VFX를 렌더링한다.
- React/DOM 또는 native 계층은 locale별 단서·입력, 설정, 결제·광고 확인, 접근성 semantics를 렌더링한다.
- UI 버튼과 텍스트는 생성형 이미지로 만들지 않고 안정적인 string key로 엔진 렌더링한다. 세계·캐릭터·프레임·엽서 자산에는 번역 대상 문구를 굽지 않는다.
- 장식이 입력 focus ring, 오류 문구, 단서 숫자와 겹치지 않게 safe inset을 둔다.
- 배경 질감은 압축 후 banding이 없고 본문 대비를 흔들지 않도록 opacity 3% 이하로 제한한다.
- 9-slice 패널, 아이콘, 배지의 기능 상태는 코드 토큰과 같은 이름으로 관리한다.

## 에셋 매니페스트

| Asset ID      | Logical path        | 사용·variant      | 형식              | 출처·권리                       | memory 목표 | 상태    |
| ------------- | ------------------- | ----------------- | ----------------- | ------------------------------- | ----------: | ------- |
| ART-WORLD-001 | `world/ch01`        | 복원 전·후 2장    | WebP atlas        | 신규 original, 권리 원장 대기   |         8MB | planned |
| ART-TILE-001  | `tiles/path`        | 9-slice·5상태     | PNG/WebP          | 신규 original                   |         1MB | planned |
| ART-CHAR-001  | `character/maru`    | 6상태·24~36 frame | sprite atlas 후보 | 신규 original, 캐릭터 승인 대기 |         3MB | planned |
| ART-VFX-001   | `vfx/ink`           | sweep·교차·펼침   | shader+sprite     | 신규 original                   |         2MB | planned |
| ART-MAP-001   | `map/chapter-nodes` | 잠김·열림·완료    | SVG master→WebP   | 신규 original                   |         2MB | planned |
| ART-POST-001  | `postcards/frames`  | frame 8종         | WebP layer        | 신규 original                   |         4MB | planned |
| ART-COS-001   | `cosmetics/trails`  | 길·흔적 12종      | palette+sprite    | 신규 original                   |         2MB | planned |
| UI-ICON-001   | `ui/icons`          | 18개·3상태        | SVG               | 신규 original                   |       0.2MB | planned |
| FONT-KR-001   | `fonts/ui-kr`       | regular·bold      | WOFF2/native      | 상업 라이선스 검토 대기         |         8MB | blocked |
| AUD-BGM-001   | `audio/bgm-map`     | 60~90초 loop      | OGG/AAC           | 신규 original                   |         2MB | planned |
| AUD-BGM-002   | `audio/bgm-puzzle`  | 2곡 loop          | OGG/AAC           | 신규 original                   |         4MB | planned |
| AUD-SFX-001   | `audio/sfx-core`    | 사건 12종         | 48kHz             | 신규 original                   |         1MB | planned |

출시 font/glyph gate는 `ko-KR`만 소유한다. future locale font는 기존 한국어 atlas에 임의로 합치지 않고 locale별 fallback, 라이선스, glyph coverage와 memory budget을 별도 manifest 항목으로 승인한다.

asset manifest의 machine-readable record에는 `localeScope`(`universal` 또는 BCP 47 tag 목록)와 텍스트 자산의 `scriptCoverage`를 둔다. 배경·캐릭터·VFX·장식 frame은 원칙적으로 `universal`, font와 locale-specific store art만 명시 locale 범위를 가진다.

실제 `assets.manifest.json`은 logical path, usage, variants, source file, author, generator 사용 여부, model version, license, memory, checksum, approval status를 required field로 둔다.

`ART-ANCHOR-001`은 챕터 1의 8×8 보드에서 한 단어가 완료된 순간을 담은 Compact key screen이다. 서로 다른 3개 style frame을 비교해 읽기, 인과, 독창성을 승인한 뒤 anchor와 reference key를 고정한다.

## VFX 언어

- **잉크 sweep**: 단어 진행 방향을 450ms 안에 보여준다. 알파 입자가 글자를 가리지 않는다.
- **교차 파동**: 교차 횟수에 따라 반경과 음정을 올리되 화면 전체 flash는 쓰지 않는다.
- **종이 펼침**: 보드 완료 때만 사용한다. 입력 도중에는 카메라 이동과 zoom을 금지한다.
- **힌트**: 정답 칸을 직접 폭발시키지 않고 잉크 방울이 후보 위치에 머문다.
- **오답**: 붉은 flash 대신 접힘과 짧은 외곽선으로 표시한다.
- reduced motion에서는 이동 경로를 제거하고 100~180ms crossfade와 외곽선 변화만 남긴다.

## 오디오와 햅틱

### 음악

- 악기: 나무 타악기, 낮은 마림바, 가벼운 현, 종이 마찰 texture
- 지도: 72~84 BPM, 탐험 기대감, 명확한 cadence를 줄인다.
- 퍼즐: 60~76 BPM, 음성·단서 읽기를 방해하지 않는 중역 밀도
- 완료: 현재 BGM key 안에서 2초 phrase로 끝나 seamless loop로 복귀

### 효과음

- 입력은 피로가 적은 짧은 종이 탭으로 만들고 음절마다 pitch를 크게 바꾸지 않는다.
- 단어 완료 motif는 3음, 교차 연쇄는 기존 motif의 다음 음을 이어 사용한다.
- 오답은 낮은 나무 click 하나로 끝내고 부정적 buzzer를 쓰지 않는다.
- 광고와 background 진입 즉시 모든 loop를 pause하고 복귀 시 중복 재생하지 않는다.

### 믹스와 햅틱

- 기본 loudness: BGM -18 LUFS 전후, SFX peak -6 dBFS 이하를 시작점으로 실기기 조정한다.
- BGM, SFX, 햅틱을 독립 설정한다.
- 햅틱은 입력마다 기본 발생시키지 않고 단어 완료, 오답, 보드 완료에 제한한다.
- 동일 사건의 오디오와 햅틱 발생 차이는 50ms 이내를 목표로 한다.

## 생성과 라이선스

- 레퍼런스 보드는 직접 촬영·구매·공개 라이선스 자료로 구성하고 경쟁작 스크린샷을 스타일 원본으로 넣지 않는다.
- 생성형 도구는 탐색과 초안에 사용할 수 있지만 최종 에셋은 형태, 손, 문자, 반복 pattern, 상표 유사성을 사람이 검사한다.
- 생성형 에셋은 사용 모델, 약관 확인일, 프롬프트, 후편집 내역을 매니페스트에 기록한다.
- 폰트, 음원, SFX, texture는 상업 이용과 재배포 범위를 원본 URL·영수증과 함께 보관한다.
- 한국어 사전 단서와 게임 아트 라이선스는 별도 원장으로 관리한다.
- 자동 생성 이미지 안의 글자는 모두 제거하고 런타임 텍스트로 교체한다.

## 승인 게이트

| Gate             | 증거                                        | 승인자          | 실패 시                  |
| ---------------- | ------------------------------------------- | --------------- | ------------------------ |
| ART-G01 형태     | 32px, 64px, 128px 마루 식별 테스트          | Art + Product   | silhouette 재설계        |
| ART-G02 가독성   | 7×7, 8×8, 9×9 위 아트 적용 캡처             | UX + QA         | 질감·VFX 축소            |
| ART-G03 인과     | 정답 전후 5초 무음 영상으로 변화 이해       | Game Design     | 연출 순서 수정           |
| ART-G04 성능     | low-tier 기기 atlas, shader, memory profile | Client + QA     | atlas 분리·shader 단순화 |
| ART-G05 접근성   | reduced motion, 고대비, screen reader 영상  | UX + QA         | 대체 표현 추가           |
| ART-G06 독창성   | 경쟁작·상표 유사성 검토표                   | Product + Legal | 콘셉트 폐기 또는 수정    |
| ART-G07 라이선스 | 원본·제작자·권리·checksum 원장              | Producer        | 빌드 제외                |
| AUD-G01 피로도   | 15분 반복 청취와 스펙트럼 검사              | Audio + QA      | 반복·고역 수정           |

수직 슬라이스 승인에는 ART-G01~G05와 AUD-G01이 필요하고, 상용 출시에는 모든 gate가 필요하다.
