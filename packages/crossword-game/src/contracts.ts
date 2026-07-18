import type {
  GameCommand,
  GameController,
  GameDomainEvent,
  GameSnapshot,
} from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";

export type CrosswordGameCommandSource =
  | "canvas-selection"
  | "presentation-ack";

export type CrosswordGameCommandRequest = Readonly<{
  command: GameCommand;
  commandSequence: number;
  source: CrosswordGameCommandSource;
}>;

export type CrosswordGameInteractiveAck = Readonly<{
  canvasAriaHidden: true;
  commandSequence: number;
  contentChecksum: string;
  contentLocale: string;
  puzzleId: string;
  renderer: "webgl";
  scene: "puzzle";
}>;

export type CrosswordGameVisualPreferences = Readonly<{
  highContrast: boolean;
  reducedMotion: boolean;
}>;

export type CrosswordGameVisualPreferenceUpdate = Readonly<
  Partial<CrosswordGameVisualPreferences>
>;

export type CrosswordGameRuntimeEvent =
  | Readonly<{
      type: "interactive";
      ack: CrosswordGameInteractiveAck;
    }>
  | Readonly<{
      type: "context-lost" | "context-restored";
      commandSequence: number;
      puzzleId: string;
    }>
  | Readonly<{
      type: "command-requested";
      commandSequence: number;
      commandType: GameCommand["type"];
      source: CrosswordGameCommandSource;
    }>
  | Readonly<{
      type: "command-request-failed";
      commandSequence: number;
      commandType: GameCommand["type"];
      message: string;
      source: CrosswordGameCommandSource;
    }>
  | Readonly<{
      type: "disposed";
      puzzleId: string;
    }>;

/**
 * Phaser가 구독할 수 있는 GameController의 read-only surface다.
 * `dispatch`를 의도적으로 제외해 scene을 상태 writer로 만들지 않는다.
 */
export type ReadonlyGameControllerProjection = Pick<
  GameController,
  "getSnapshot" | "subscribe"
>;

export type CrosswordGameOptions = Readonly<{
  content: GameContentV1;
  initialSnapshot: GameSnapshot;
  onCommand?: (request: CrosswordGameCommandRequest) => Promise<void> | void;
  onEntrySelect: (
    entryId: string,
    context: Readonly<{ commandSequence: number }>,
  ) => Promise<void> | void;
  onInteractive?: (ack: CrosswordGameInteractiveAck) => void;
  onRuntimeEvent?: (event: CrosswordGameRuntimeEvent) => void;
  parent: HTMLElement | string;
  highContrast?: boolean;
  reducedMotion?: boolean;
}>;

export type CrosswordGameRuntime = Readonly<{
  canvas: HTMLCanvasElement;
  interactive: Promise<CrosswordGameInteractiveAck>;
  update: (snapshot: GameSnapshot, events?: readonly GameDomainEvent[]) => void;
  updateVisualPreferences: (
    preferences: CrosswordGameVisualPreferenceUpdate,
  ) => void;
  suspend: () => void;
  resume: () => void;
  destroy: () => void;
}>;
