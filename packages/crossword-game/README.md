# `@seorilabs/crossword-game`

Phaser 4 기반 게임 표현 계층이다. `GameController`가 만든 immutable
`GameSnapshot`만 projection하며 퍼즐 진행 상태를 직접 쓰지 않는다.

- renderer는 `Phaser.WEBGL`, scale mode는 `Phaser.Scale.RESIZE`로 고정한다.
- canvas는 `aria-hidden="true"`다. 단서, IME 입력, 접근성 semantics는 외부
  React/DOM 계층이 소유한다.
- canvas의 단어 선택과 presentation 완료는 `onCommand` callback으로만
  host에 요청한다. 실제 command 적용과 다음 snapshot 전달은 host가 맡는다.
- host는 `interactive` Promise를 boot watchdog의 첫 interactive ack로 사용한다.
- `update(snapshot, events)`, `updateVisualPreferences(update)`, `suspend()`,
  `resume()`, `destroy()`가 lifecycle API다. `update`의 domain event batch가
  입력·오답·단어·연쇄·보드 VFX의 원인이고 snapshot effect는 event가 없는 구형
  host의 호환 fallback으로만 사용한다.
- `updateVisualPreferences`는 runtime 재생성 없이 `reducedMotion`과
  `highContrast`를 갱신한다. `suspend`와 `resume`은 표현 loop만 제어하며 core
  command를 적용하지 않는다. 종료 시 반드시 `destroy()`를 호출한다.

```text
React/DOM command -> GameController -> immutable snapshot -> Phaser projection
Phaser selection -> onEntrySelect -> GameController
Phaser presentation ack -> onCommand -> GameController
```
