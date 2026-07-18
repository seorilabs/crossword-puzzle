import Phaser from "phaser";

import type {
  GameCommand,
  GameDomainEvent,
} from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";
import type {
  CrosswordGameInteractiveAck,
  CrosswordGameVisualPreferences,
} from "./contracts.ts";
import {
  ABBREVIATED_VFX_DURATION_MS,
  INCORRECT_FEEDBACK_DURATION_MS,
  INPUT_SETTLE_DURATION_MS,
  planCrosswordGamePresentationCues,
  resolveCrosswordGamePalette,
  shouldAbbreviateCrosswordGameVfx,
  type CrosswordGamePalette,
  type CrosswordGamePresentationCue,
} from "./presentationPolicy.ts";
import {
  pickEntryForCell,
  type BoardCellPresentation,
  type CrosswordPresentation,
} from "./projection.ts";

export const BOOT_SCENE_KEY = "crossword-boot";
export const PUZZLE_SCENE_KEY = "crossword-puzzle";

type SceneServices = Readonly<{
  acknowledgeInteractive: (ack: CrosswordGameInteractiveAck) => void;
  content: GameContentV1;
  getPresentation: () => CrosswordPresentation;
  getVisualPreferences: () => CrosswordGameVisualPreferences;
  isRuntimeSuspended: () => boolean;
  onEntrySelect: (entryId: string, commandSequence: number) => void;
  requestPresentationCommand: (
    command: GameCommand,
    commandSequence: number,
  ) => void;
}>;

type SceneLayout = Readonly<{
  boardHeight: number;
  boardWidth: number;
  boardX: number;
  boardY: number;
  cellSize: number;
  height: number;
  width: number;
  worldHeight: number;
}>;

type CrosswordVfxObject =
  | Phaser.GameObjects.Arc
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Text;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createLayout(
  presentation: CrosswordPresentation,
  width: number,
  height: number,
): SceneLayout {
  const safeWidth = Math.max(240, width);
  const safeHeight = Math.max(320, height);
  const outerPadding = clamp(safeWidth * 0.045, 12, 28);
  const worldHeight = clamp(safeHeight * 0.3, 112, 250);
  const availableBoardHeight = Math.max(
    160,
    safeHeight - worldHeight - outerPadding * 2,
  );
  const availableBoardWidth = safeWidth - outerPadding * 2;
  const cellSize = Math.max(
    24,
    Math.floor(
      Math.min(
        availableBoardWidth / presentation.board.cols,
        availableBoardHeight / presentation.board.rows,
        72,
      ),
    ),
  );
  const boardWidth = cellSize * presentation.board.cols;
  const boardHeight = cellSize * presentation.board.rows;

  return Object.freeze({
    boardHeight,
    boardWidth,
    boardX: Math.round((safeWidth - boardWidth) / 2),
    boardY: Math.round(
      worldHeight + Math.max(8, (safeHeight - worldHeight - boardHeight) / 2),
    ),
    cellSize,
    height: safeHeight,
    width: safeWidth,
    worldHeight,
  });
}

function cellCenter(
  layout: SceneLayout,
  row: number,
  col: number,
): Readonly<{ x: number; y: number }> {
  return Object.freeze({
    x: layout.boardX + (col + 0.5) * layout.cellSize,
    y: layout.boardY + (row + 0.5) * layout.cellSize,
  });
}

export class CrosswordBootScene extends Phaser.Scene {
  constructor(private readonly services: SceneServices) {
    super({ key: BOOT_SCENE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(
      resolveCrosswordGamePalette(this.services.getVisualPreferences()).paper,
    );
    this.scene.start(PUZZLE_SCENE_KEY, {
      puzzleId: this.services.content.puzzleId,
    });
  }
}

export class CrosswordPuzzleScene extends Phaser.Scene {
  readonly #services: SceneServices;
  #backgroundLayer: Phaser.GameObjects.Container | null = null;
  #boardLayer: Phaser.GameObjects.Container | null = null;
  #contextLost = false;
  #activeVfxObjects = new Set<CrosswordVfxObject>();
  #pendingVfxTimers = new Set<Phaser.Time.TimerEvent>();
  #pendingPresentationAck: Phaser.Time.TimerEvent | null = null;
  #playedCueKeys = new Set<string>();
  #presentation: CrosswordPresentation;
  #sentPresentationAcks = new Set<string>();
  #shutdownComplete = false;
  #vfxLayer: Phaser.GameObjects.Container | null = null;
  #worldLayer: Phaser.GameObjects.Container | null = null;

  constructor(services: SceneServices) {
    super({ key: PUZZLE_SCENE_KEY });
    this.#services = services;
    this.#presentation = services.getPresentation();
  }

  create(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      throw new Error("crossword-game requires the WEBGL renderer");
    }

    this.game.canvas.setAttribute("aria-hidden", "true");
    this.game.canvas.setAttribute("role", "presentation");
    this.game.canvas.tabIndex = -1;

    this.#backgroundLayer = this.add.container(0, 0).setDepth(0);
    this.#worldLayer = this.add.container(0, 0).setDepth(10);
    this.#boardLayer = this.add.container(0, 0).setDepth(20);
    this.#vfxLayer = this.add.container(0, 0).setDepth(30);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.#shutdown, this);

    this.#renderStatic();
    this.#syncInputState();

    this.game.renderer.once(Phaser.Renderer.Events.POST_RENDER, () => {
      if (!this.sys.isActive()) {
        return;
      }
      const presentation = this.#presentation;
      this.#services.acknowledgeInteractive(
        Object.freeze({
          canvasAriaHidden: true,
          commandSequence: presentation.commandSequence,
          contentChecksum: presentation.contentChecksum,
          contentLocale: this.#services.content.contentLocale,
          puzzleId: presentation.puzzleId,
          renderer: "webgl",
          scene: "puzzle",
        }),
      );
    });
  }

  updatePresentation(
    presentation: CrosswordPresentation,
    events: readonly GameDomainEvent[] = [],
  ): void {
    const previousSequence = this.#presentation.commandSequence;
    this.#presentation = presentation;
    const presentationChanged =
      presentation.commandSequence !== previousSequence;
    if (presentationChanged) {
      this.#renderStatic();
    }
    this.#playPresentationEvents(events, presentationChanged);
    this.#syncInputState();

    if (presentation.suspended) {
      this.#pausePresentation();
    } else if (!this.#contextLost && !this.#services.isRuntimeSuspended()) {
      this.#resumePresentation();
    }
  }

  suspendPresentation(): void {
    this.#pausePresentation();
  }

  resumePresentation(): void {
    if (!this.#contextLost && !this.#presentation.suspended) {
      this.#resumePresentation();
      this.#renderStatic();
    }
  }

  updateVisualPreferences(): void {
    this.#clearActiveVfx();
    this.cameras.main.setBackgroundColor(this.#palette().paper);
    this.#renderStatic();
  }

  handleContextLost(): void {
    this.#contextLost = true;
    this.#pausePresentation();
  }

  handleContextRestored(): void {
    this.#contextLost = false;
    this.#clearActiveVfx();
    this.#renderStatic();
    if (!this.#services.isRuntimeSuspended() && !this.#presentation.suspended) {
      this.#resumePresentation();
    }
  }

  #handleResize(): void {
    this.#clearActiveVfx();
    this.#renderStatic();
  }

  #renderStatic(): void {
    if (
      this.#backgroundLayer == null ||
      this.#worldLayer == null ||
      this.#boardLayer == null ||
      this.#vfxLayer == null
    ) {
      return;
    }

    const layout = createLayout(
      this.#presentation,
      this.scale.width,
      this.scale.height,
    );

    this.#backgroundLayer.removeAll(true);
    this.#worldLayer.removeAll(true);
    this.#boardLayer.removeAll(true);

    this.#renderBackground(layout);
    this.#renderWorld(layout);
    this.#renderBoard(layout);
    this.#schedulePresentationAck();
  }

  #renderBackground(layout: SceneLayout): void {
    const palette = this.#palette();
    const graphics = this.add.graphics();
    graphics.fillStyle(palette.paper, 1);
    graphics.fillRect(0, 0, layout.width, layout.height);
    graphics.fillStyle(
      palette.paperShade,
      this.#preferences().highContrast ? 0.08 : 0.2,
    );
    for (let y = 12; y < layout.height; y += 28) {
      graphics.fillRect(0, y, layout.width, 1);
    }
    this.#backgroundLayer?.add(graphics);
  }

  #renderWorld(layout: SceneLayout): void {
    const palette = this.#palette();
    const highContrast = this.#preferences().highContrast;
    const graphics = this.add.graphics();
    const world = this.#presentation.world;
    const left = Math.max(18, layout.width * 0.08);
    const right = layout.width - left;
    const centerY = layout.worldHeight * 0.58;
    const span = right - left;

    graphics.fillGradientStyle(
      palette.sky,
      palette.sky,
      palette.paper,
      palette.paper,
      1,
    );
    graphics.fillRoundedRect(
      8,
      8,
      layout.width - 16,
      layout.worldHeight - 12,
      20,
    );

    graphics.lineStyle(
      highContrast ? 10 : 8,
      palette.worldDormant,
      highContrast ? 0.7 : 0.22,
    );
    graphics.beginPath();
    graphics.moveTo(left, centerY);
    graphics.lineTo(right, centerY);
    graphics.strokePath();

    if (world.progress > 0) {
      graphics.lineStyle(
        highContrast ? 10 : 8,
        palette.worldRestored,
        highContrast ? 1 : 0.82,
      );
      graphics.beginPath();
      graphics.moveTo(left, centerY);
      graphics.lineTo(left + span * world.progress, centerY);
      graphics.strokePath();
    }

    for (let index = 0; index < world.totalLandmarks; index += 1) {
      const denominator = Math.max(1, world.totalLandmarks - 1);
      const x = left + (span * index) / denominator;
      const restored = index < world.restoredLandmarks;
      graphics.fillStyle(
        restored ? palette.worldRestored : palette.worldDormant,
        restored ? 1 : highContrast ? 0.82 : 0.42,
      );
      graphics.fillCircle(x, centerY, restored ? 11 : 8);
      if (restored) {
        graphics.lineStyle(highContrast ? 3 : 2, palette.paper, 0.9);
        graphics.strokeCircle(x, centerY, 5);
      }
    }

    const houseX = layout.width * 0.5;
    const houseY = layout.worldHeight * 0.3;
    graphics.fillStyle(
      world.stage === "restored" ? palette.complete : palette.worldDormant,
      world.stage === "dormant" ? (highContrast ? 0.62 : 0.25) : 0.82,
    );
    graphics.fillRoundedRect(houseX - 22, houseY, 44, 34, 5);
    graphics.beginPath();
    graphics.moveTo(houseX - 29, houseY + 2);
    graphics.lineTo(houseX, houseY - 22);
    graphics.lineTo(houseX + 29, houseY + 2);
    graphics.closePath();
    graphics.fillPath();

    this.#worldLayer?.add(graphics);
  }

  #renderBoard(layout: SceneLayout): void {
    const palette = this.#palette();
    const highContrast = this.#preferences().highContrast;
    const pathGraphics = this.add.graphics();
    const pathsByEntryId = new Map(
      this.#presentation.board.paths.map((path) => [path.entryId, path]),
    );

    for (const path of this.#presentation.board.paths) {
      if (path.cellKeys.length < 2) {
        continue;
      }
      const first = this.#getCellByKey(path.cellKeys[0]);
      const last = this.#getCellByKey(path.cellKeys[path.cellKeys.length - 1]);
      if (first == null || last == null) {
        continue;
      }
      const firstCenter = cellCenter(layout, first.row, first.col);
      const lastCenter = cellCenter(layout, last.row, last.col);
      const color = path.completed
        ? palette.complete
        : path.selected
          ? palette.focus
          : palette.path;
      const alpha =
        path.completed || path.selected ? 0.92 : highContrast ? 0.6 : 0.28;
      pathGraphics.lineStyle(
        layout.cellSize * (path.selected && highContrast ? 0.3 : 0.23),
        color,
        alpha,
      );
      pathGraphics.beginPath();
      pathGraphics.moveTo(firstCenter.x, firstCenter.y);
      pathGraphics.lineTo(lastCenter.x, lastCenter.y);
      pathGraphics.strokePath();
    }
    this.#boardLayer?.add(pathGraphics);

    for (const cell of this.#presentation.board.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      const fillColor = cell.completed
        ? palette.completeSoft
        : cell.selected
          ? palette.focusSoft
          : palette.paper;
      const strokeColor = cell.completed
        ? palette.complete
        : cell.selected
          ? palette.focus
          : palette.ink;
      const cellRectangle = this.add
        .rectangle(
          center.x,
          center.y,
          layout.cellSize - 5,
          layout.cellSize - 5,
          fillColor,
          0.98,
        )
        .setStrokeStyle(
          cell.selected ? (highContrast ? 5 : 4) : highContrast ? 3 : 2,
          strokeColor,
          1,
        );

      if (this.#canSelectEntry()) {
        cellRectangle.setInteractive({ useHandCursor: true });
        cellRectangle.on(Phaser.Input.Events.POINTER_DOWN, () => {
          const entryId = pickEntryForCell(
            cell,
            this.#presentation.selectedEntryId,
          );
          if (entryId != null) {
            this.#services.onEntrySelect(
              entryId,
              this.#presentation.commandSequence,
            );
          }
        });
      }
      this.#boardLayer?.add(cellRectangle);

      if (cell.value != null) {
        const valueText = this.add
          .text(center.x, center.y, cell.value, {
            color: highContrast ? "#000000" : "#17243A",
            fontFamily: "sans-serif",
            fontSize: `${Math.max(18, Math.floor(layout.cellSize * 0.46))}px`,
            fontStyle: cell.justResolved ? "bold" : "normal",
          })
          .setOrigin(0.5);
        this.#boardLayer?.add(valueText);
      }

      if (cell.completed) {
        const check = this.add
          .text(
            center.x + layout.cellSize * 0.29,
            center.y - layout.cellSize * 0.3,
            "✓",
            {
              color: highContrast ? "#000000" : "#8A4E06",
              fontFamily: "sans-serif",
              fontSize: `${Math.max(10, Math.floor(layout.cellSize * 0.19))}px`,
              fontStyle: "bold",
            },
          )
          .setOrigin(0.5);
        this.#boardLayer?.add(check);
      }
    }

    const selectedPath =
      this.#presentation.selectedEntryId == null
        ? null
        : (pathsByEntryId.get(this.#presentation.selectedEntryId) ?? null);
    if (selectedPath != null && selectedPath.cellKeys.length > 0) {
      const first = this.#getCellByKey(selectedPath.cellKeys[0]);
      if (first != null) {
        const center = cellCenter(layout, first.row, first.col);
        const marker = this.add
          .text(
            center.x - layout.cellSize * 0.28,
            center.y - layout.cellSize * 0.28,
            "◆",
            {
              color: highContrast ? "#000000" : "#147D7C",
              fontFamily: "sans-serif",
              fontSize: `${Math.max(9, Math.floor(layout.cellSize * 0.2))}px`,
              fontStyle: "bold",
            },
          )
          .setOrigin(0.5);
        this.#boardLayer?.add(marker);
      }
    }
  }

  #playPresentationEvents(
    events: readonly GameDomainEvent[],
    presentationChanged: boolean,
  ): void {
    if (shouldAbbreviateCrosswordGameVfx(events)) {
      this.#abbreviateActiveVfx();
    }

    const cues = planCrosswordGamePresentationCues(
      events,
      presentationChanged
        ? this.#presentation.effect
        : Object.freeze({
            kind: "none" as const,
            sequence: this.#presentation.commandSequence,
            entryIds: Object.freeze([]),
          }),
    );
    if (cues.length === 0) return;

    const boardCue = cues.find((cue) => cue.kind === "board");
    if (boardCue != null) {
      this.#clearActiveVfx();
      this.#playCue(boardCue);
      return;
    }

    const inputSequences = new Set(
      cues
        .filter((cue) => cue.kind === "input-settle")
        .map((cue) => cue.commandSequence),
    );
    for (const cue of cues) {
      if (
        cue.kind !== "input-settle" &&
        inputSequences.has(cue.commandSequence)
      ) {
        this.#delayVfx(INPUT_SETTLE_DURATION_MS, () => this.#playCue(cue));
      } else {
        this.#playCue(cue);
      }
    }
  }

  #playCue(cue: CrosswordGamePresentationCue): void {
    const cueKey = `${cue.commandSequence}:${cue.kind}:${cue.entryIds.join(",")}`;
    if (this.#playedCueKeys.has(cueKey)) return;
    if (this.#playedCueKeys.size >= 128) this.#playedCueKeys.clear();
    this.#playedCueKeys.add(cueKey);

    const layout = createLayout(
      this.#presentation,
      this.scale.width,
      this.scale.height,
    );
    if (cue.kind === "input-settle") {
      this.#playInputSettle(layout, cue);
    } else if (cue.kind === "incorrect") {
      this.#playIncorrectFeedback(layout, cue);
    } else if (cue.kind === "board") {
      this.#playBoardRestore(layout);
    } else {
      this.#playWordRestore(layout, cue);
    }
  }

  #playInputSettle(
    layout: SceneLayout,
    cue: CrosswordGamePresentationCue,
  ): void {
    const palette = this.#palette();
    const cellKeys = this.#getCueCellKeys(cue).slice(
      0,
      cue.committedCellCount ?? undefined,
    );
    for (const key of cellKeys) {
      const cell = this.#getCellByKey(key);
      if (cell == null || cell.value == null) continue;
      const center = cellCenter(layout, cell.row, cell.col);
      const ink = this.#trackVfx(
        this.add.rectangle(
          center.x,
          center.y,
          layout.cellSize * 0.7,
          layout.cellSize * 0.7,
          palette.ink,
          this.#preferences().highContrast ? 0.18 : 0.12,
        ),
      );
      if (!this.#preferences().reducedMotion) ink.setScale(1.08);
      this.tweens.add({
        alpha: 0,
        duration: INPUT_SETTLE_DURATION_MS,
        ease: "Sine.Out",
        onComplete: () => this.#destroyVfx(ink),
        scale: 1,
        targets: ink,
      });
    }
  }

  #playIncorrectFeedback(
    layout: SceneLayout,
    cue: CrosswordGamePresentationCue,
  ): void {
    const palette = this.#palette();
    const cellKeys = this.#getCueCellKeys(cue);
    for (const key of cellKeys) {
      const cell = this.#getCellByKey(key);
      if (cell == null) continue;
      const center = cellCenter(layout, cell.row, cell.col);
      const outline = this.#trackVfx(
        this.add
          .rectangle(
            center.x,
            center.y,
            layout.cellSize - 2,
            layout.cellSize - 2,
            palette.errorSoft,
            this.#preferences().highContrast ? 0.16 : 0.08,
          )
          .setStrokeStyle(
            this.#preferences().highContrast ? 5 : 3,
            palette.error,
            1,
          ),
      );
      if (this.#preferences().reducedMotion) {
        this.tweens.add({
          alpha: 0,
          duration: INCORRECT_FEEDBACK_DURATION_MS,
          onComplete: () => this.#destroyVfx(outline),
          targets: outline,
        });
      } else {
        this.tweens.add({
          duration: INCORRECT_FEEDBACK_DURATION_MS / 2,
          ease: "Sine.InOut",
          onComplete: () => this.#destroyVfx(outline),
          scaleY: 0.78,
          targets: outline,
          yoyo: true,
        });
      }
    }

    const first = this.#getCellByKey(cellKeys[0]);
    if (first != null) {
      const center = cellCenter(layout, first.row, first.col);
      const marker = this.#trackVfx(
        this.add
          .text(center.x, center.y, "!", {
            color: this.#preferences().highContrast ? "#000000" : "#A50016",
            fontFamily: "sans-serif",
            fontSize: `${Math.max(16, Math.floor(layout.cellSize * 0.42))}px`,
            fontStyle: "bold",
          })
          .setOrigin(0.5),
      );
      this.tweens.add({
        alpha: 0,
        duration: INCORRECT_FEEDBACK_DURATION_MS,
        onComplete: () => this.#destroyVfx(marker),
        targets: marker,
      });
    }
  }

  #playWordRestore(
    layout: SceneLayout,
    cue: CrosswordGamePresentationCue,
  ): void {
    const palette = this.#palette();
    const uniqueCellKeys = this.#getCueCellKeys(cue);
    this.#playWorldRestorePulse(layout);

    for (const [index, key] of uniqueCellKeys.entries()) {
      const cell = this.#getCellByKey(key);
      if (cell == null) continue;
      const center = cellCenter(layout, cell.row, cell.col);
      const sweep = this.#trackVfx(
        this.add.rectangle(
          center.x,
          center.y,
          layout.cellSize * 0.78,
          layout.cellSize * 0.78,
          palette.complete,
          this.#preferences().highContrast ? 0.52 : 0.38,
        ),
      );

      if (this.#preferences().reducedMotion) {
        sweep.setFillStyle(palette.complete, 0.22);
        this.tweens.add({
          alpha: 0,
          duration: 150,
          onComplete: () => this.#destroyVfx(sweep),
          targets: sweep,
        });
      } else {
        sweep.setScale(0.12, 1);
        this.tweens.add({
          alpha: 0,
          delay: Math.min(250, index * 45),
          duration: 200,
          ease: "Sine.Out",
          onComplete: () => this.#destroyVfx(sweep),
          scaleX: 1,
          targets: sweep,
        });
      }
    }

    if (cue.kind === "chain") {
      const crossing = this.#presentation.board.cells.find(
        (cell) =>
          cell.entryIds.filter((entryId) => cue.entryIds.includes(entryId))
            .length > 1,
      );
      if (crossing != null) {
        const center = cellCenter(layout, crossing.row, crossing.col);
        const wave = this.#trackVfx(
          this.add
            .circle(
              center.x,
              center.y,
              layout.cellSize * 0.18,
              palette.focus,
              0,
            )
            .setStrokeStyle(
              this.#preferences().highContrast ? 6 : 4,
              palette.complete,
              1,
            ),
        );
        this.tweens.add({
          alpha: 0,
          duration: this.#preferences().reducedMotion ? 150 : 380,
          ease: "Sine.Out",
          onComplete: () => this.#destroyVfx(wave),
          scale: this.#preferences().reducedMotion ? 1 : 2.6,
          targets: wave,
        });
      }
    }
  }

  #playBoardRestore(layout: SceneLayout): void {
    const palette = this.#palette();
    const paper = this.#trackVfx(
      this.add.rectangle(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth + 12,
        layout.boardHeight + 12,
        palette.completeSoft,
        this.#preferences().highContrast ? 0.62 : 0.42,
      ),
    );
    const marker = this.#trackVfx(
      this.add
        .text(
          layout.boardX + layout.boardWidth / 2,
          layout.boardY + layout.boardHeight / 2,
          "✓",
          {
            color: this.#preferences().highContrast ? "#000000" : "#8A4E06",
            fontFamily: "sans-serif",
            fontSize: `${Math.max(28, Math.floor(layout.cellSize * 0.9))}px`,
            fontStyle: "bold",
          },
        )
        .setOrigin(0.5),
    );

    if (this.#preferences().reducedMotion) {
      for (const target of [paper, marker]) {
        this.tweens.add({
          alpha: 0,
          duration: INCORRECT_FEEDBACK_DURATION_MS,
          onComplete: () => this.#destroyVfx(target),
          targets: target,
        });
      }
      return;
    }

    paper.setScale(1, 0.04);
    marker.setScale(0.7);
    this.tweens.add({
      alpha: 0,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => this.#destroyVfx(paper),
      scaleY: 1,
      targets: paper,
    });
    this.tweens.add({
      alpha: 0,
      delay: 120,
      duration: 420,
      ease: "Back.Out",
      onComplete: () => this.#destroyVfx(marker),
      scale: 1.15,
      targets: marker,
    });
  }

  #playWorldRestorePulse(layout: SceneLayout): void {
    const world = this.#presentation.world;
    if (world.progress <= 0) return;
    const palette = this.#palette();
    const left = Math.max(18, layout.width * 0.08);
    const right = layout.width - left;
    const x = left + (right - left) * world.progress;
    const y = layout.worldHeight * 0.58;
    const pulse = this.#trackVfx(
      this.add
        .circle(x, y, 10, palette.worldRestored, 0)
        .setStrokeStyle(
          this.#preferences().highContrast ? 6 : 4,
          palette.worldRestored,
          1,
        ),
    );

    this.tweens.add({
      alpha: 0,
      duration: this.#preferences().reducedMotion ? 150 : 420,
      ease: "Sine.Out",
      onComplete: () => this.#destroyVfx(pulse),
      scale: this.#preferences().reducedMotion ? 1 : 2.4,
      targets: pulse,
    });
  }

  #getCueCellKeys(cue: CrosswordGamePresentationCue): string[] {
    return [
      ...new Set(
        cue.entryIds.flatMap((entryId) => {
          const path = this.#presentation.board.paths.find(
            (candidate) => candidate.entryId === entryId,
          );
          return path?.cellKeys ?? [];
        }),
      ),
    ];
  }

  #trackVfx<T extends CrosswordVfxObject>(object: T): T {
    this.#activeVfxObjects.add(object);
    this.#vfxLayer?.add(object);
    return object;
  }

  #destroyVfx(object: CrosswordVfxObject): void {
    if (!this.#activeVfxObjects.delete(object)) return;
    object.destroy();
  }

  #delayVfx(delay: number, callback: () => void): void {
    const timer = this.time.delayedCall(delay, () => {
      this.#pendingVfxTimers.delete(timer);
      callback();
    });
    this.#pendingVfxTimers.add(timer);
  }

  #abbreviateActiveVfx(): void {
    for (const timer of this.#pendingVfxTimers) timer.remove(false);
    this.#pendingVfxTimers.clear();
    if (this.#activeVfxObjects.size === 0) return;

    if (this.#preferences().reducedMotion) {
      this.#clearActiveVfx();
      return;
    }
    for (const object of [...this.#activeVfxObjects]) {
      this.tweens.killTweensOf(object);
      this.tweens.add({
        alpha: 0,
        duration: ABBREVIATED_VFX_DURATION_MS,
        onComplete: () => this.#destroyVfx(object),
        targets: object,
      });
    }
  }

  #clearActiveVfx(): void {
    for (const timer of this.#pendingVfxTimers) timer.remove(false);
    this.#pendingVfxTimers.clear();
    for (const object of this.#activeVfxObjects) {
      this.tweens.killTweensOf(object);
    }
    this.#vfxLayer?.removeAll(true);
    this.#activeVfxObjects.clear();
  }

  #preferences(): CrosswordGameVisualPreferences {
    return this.#services.getVisualPreferences();
  }

  #palette(): CrosswordGamePalette {
    return resolveCrosswordGamePalette(this.#preferences());
  }

  #getCellByKey(key: string | undefined): BoardCellPresentation | null {
    if (key == null) {
      return null;
    }
    return (
      this.#presentation.board.cells.find((cell) => cell.key === key) ?? null
    );
  }

  #canSelectEntry(): boolean {
    return (
      !this.#contextLost &&
      !this.#services.isRuntimeSuspended() &&
      !this.#presentation.suspended &&
      (this.#presentation.phase === "active" ||
        this.#presentation.phase === "composing" ||
        this.#presentation.phase === "word-resolved")
    );
  }

  #syncInputState(): void {
    this.input.enabled = this.#canSelectEntry();
  }

  #schedulePresentationAck(): void {
    this.#pendingPresentationAck?.remove(false);
    this.#pendingPresentationAck = null;

    if (
      this.#contextLost ||
      this.#services.isRuntimeSuspended() ||
      this.#presentation.suspended
    ) {
      return;
    }

    let command: GameCommand | null = null;
    let delay = 0;
    if (this.#presentation.phase === "word-resolved") {
      command = { type: "resolution.complete" };
      delay = this.#preferences().reducedMotion ? 180 : 460;
    } else if (this.#presentation.phase === "board-resolved") {
      command = { type: "board.presentation.complete" };
      delay = this.#preferences().reducedMotion ? 200 : 680;
    }

    if (command == null) {
      return;
    }
    const ackKey = `${this.#presentation.commandSequence}:${command.type}`;
    if (this.#sentPresentationAcks.has(ackKey)) {
      return;
    }

    this.#pendingPresentationAck = this.time.delayedCall(delay, () => {
      this.#pendingPresentationAck = null;
      this.#sentPresentationAcks.add(ackKey);
      this.#services.requestPresentationCommand(
        command,
        this.#presentation.commandSequence,
      );
    });
  }

  #pausePresentation(): void {
    this.#pendingPresentationAck?.remove(false);
    this.#pendingPresentationAck = null;
    for (const timer of this.#pendingVfxTimers) timer.paused = true;
    this.tweens.pauseAll();
    this.input.enabled = false;
  }

  #resumePresentation(): void {
    for (const timer of this.#pendingVfxTimers) timer.paused = false;
    this.tweens.resumeAll();
    this.#syncInputState();
    this.#schedulePresentationAck();
  }

  #shutdown(): void {
    if (this.#shutdownComplete) {
      return;
    }
    this.#shutdownComplete = true;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize, this);
    this.#pendingPresentationAck?.remove(false);
    this.#pendingPresentationAck = null;
    this.#clearActiveVfx();
    this.#backgroundLayer = null;
    this.#worldLayer = null;
    this.#boardLayer = null;
    this.#vfxLayer = null;
  }
}

export type CrosswordSceneServices = SceneServices;
