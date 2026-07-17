import Phaser from "phaser";

import type { GameCommand } from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";
import type { CrosswordGameInteractiveAck } from "./contracts.ts";
import {
  pickEntryForCell,
  type BoardCellPresentation,
  type CrosswordPresentation,
} from "./projection.ts";

export const BOOT_SCENE_KEY = "crossword-boot";
export const PUZZLE_SCENE_KEY = "crossword-puzzle";

const COLOR = Object.freeze({
  complete: 0xd89035,
  completeSoft: 0xffe4b8,
  focus: 0x147d7c,
  focusSoft: 0xd9f2ee,
  ink: 0x17243a,
  muted: 0x748093,
  paper: 0xfffbef,
  paperShade: 0xeee5d1,
  path: 0x9aa4ae,
  sky: 0xe6f0eb,
  worldDormant: 0x85908f,
  worldRestored: 0x4e9270,
});

type SceneServices = Readonly<{
  acknowledgeInteractive: (ack: CrosswordGameInteractiveAck) => void;
  content: GameContentV1;
  getPresentation: () => CrosswordPresentation;
  isRuntimeSuspended: () => boolean;
  onEntrySelect: (entryId: string, commandSequence: number) => void;
  reducedMotion: boolean;
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
    this.cameras.main.setBackgroundColor(COLOR.paper);
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
  #lastAnimatedEffectKey: string | null = null;
  #pendingPresentationAck: Phaser.Time.TimerEvent | null = null;
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

    this.#render(false);
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

  updatePresentation(presentation: CrosswordPresentation): void {
    const previousSequence = this.#presentation.commandSequence;
    this.#presentation = presentation;
    this.#render(presentation.commandSequence !== previousSequence);
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
      this.#render(false);
    }
  }

  handleContextLost(): void {
    this.#contextLost = true;
    this.#pausePresentation();
  }

  handleContextRestored(): void {
    this.#contextLost = false;
    this.#render(false);
    if (!this.#services.isRuntimeSuspended() && !this.#presentation.suspended) {
      this.#resumePresentation();
    }
  }

  #handleResize(): void {
    this.#render(false);
  }

  #render(animate: boolean): void {
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
    this.#vfxLayer.removeAll(true);
    this.tweens.killAll();

    this.#renderBackground(layout);
    this.#renderWorld(layout);
    this.#renderBoard(layout);

    if (animate) {
      this.#playEffect(layout);
    }
    this.#schedulePresentationAck();
  }

  #renderBackground(layout: SceneLayout): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(COLOR.paper, 1);
    graphics.fillRect(0, 0, layout.width, layout.height);
    graphics.fillStyle(COLOR.paperShade, 0.2);
    for (let y = 12; y < layout.height; y += 28) {
      graphics.fillRect(0, y, layout.width, 1);
    }
    this.#backgroundLayer?.add(graphics);
  }

  #renderWorld(layout: SceneLayout): void {
    const graphics = this.add.graphics();
    const world = this.#presentation.world;
    const left = Math.max(18, layout.width * 0.08);
    const right = layout.width - left;
    const centerY = layout.worldHeight * 0.58;
    const span = right - left;

    graphics.fillGradientStyle(
      COLOR.sky,
      COLOR.sky,
      COLOR.paper,
      COLOR.paper,
      1,
    );
    graphics.fillRoundedRect(
      8,
      8,
      layout.width - 16,
      layout.worldHeight - 12,
      20,
    );

    graphics.lineStyle(8, COLOR.worldDormant, 0.22);
    graphics.beginPath();
    graphics.moveTo(left, centerY);
    graphics.lineTo(right, centerY);
    graphics.strokePath();

    if (world.progress > 0) {
      graphics.lineStyle(8, COLOR.worldRestored, 0.82);
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
        restored ? COLOR.worldRestored : COLOR.worldDormant,
        restored ? 1 : 0.42,
      );
      graphics.fillCircle(x, centerY, restored ? 11 : 8);
      if (restored) {
        graphics.lineStyle(2, COLOR.paper, 0.9);
        graphics.strokeCircle(x, centerY, 5);
      }
    }

    const houseX = layout.width * 0.5;
    const houseY = layout.worldHeight * 0.3;
    graphics.fillStyle(
      world.stage === "restored" ? COLOR.complete : COLOR.worldDormant,
      world.stage === "dormant" ? 0.25 : 0.72,
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
        ? COLOR.complete
        : path.selected
          ? COLOR.focus
          : COLOR.path;
      const alpha = path.completed || path.selected ? 0.78 : 0.28;
      pathGraphics.lineStyle(layout.cellSize * 0.23, color, alpha);
      pathGraphics.beginPath();
      pathGraphics.moveTo(firstCenter.x, firstCenter.y);
      pathGraphics.lineTo(lastCenter.x, lastCenter.y);
      pathGraphics.strokePath();
    }
    this.#boardLayer?.add(pathGraphics);

    for (const cell of this.#presentation.board.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      const fillColor = cell.completed
        ? COLOR.completeSoft
        : cell.selected
          ? COLOR.focusSoft
          : COLOR.paper;
      const strokeColor = cell.completed
        ? COLOR.complete
        : cell.selected
          ? COLOR.focus
          : COLOR.ink;
      const cellRectangle = this.add
        .rectangle(
          center.x,
          center.y,
          layout.cellSize - 5,
          layout.cellSize - 5,
          fillColor,
          0.98,
        )
        .setStrokeStyle(cell.selected ? 4 : 2, strokeColor, 1);

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
            color: "#17243A",
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
              color: "#8A4E06",
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
          .circle(
            center.x - layout.cellSize * 0.28,
            center.y - layout.cellSize * 0.28,
            Math.max(3, layout.cellSize * 0.065),
            COLOR.focus,
            1,
          )
          .setStrokeStyle(1, COLOR.paper, 1);
        this.#boardLayer?.add(marker);
      }
    }
  }

  #playEffect(layout: SceneLayout): void {
    const effect = this.#presentation.effect;
    if (effect.kind === "none") {
      return;
    }

    const effectKey = `${effect.sequence}:${effect.kind}`;
    if (effectKey === this.#lastAnimatedEffectKey) {
      return;
    }
    this.#lastAnimatedEffectKey = effectKey;

    if (effect.kind === "board") {
      this.#playBoardRestore(layout);
      return;
    }

    const targetCells = effect.entryIds.flatMap((entryId) => {
      const path = this.#presentation.board.paths.find(
        (candidate) => candidate.entryId === entryId,
      );
      return path?.cellKeys ?? [];
    });
    const uniqueCellKeys = [...new Set(targetCells)];

    this.#playWorldRestorePulse(layout);

    for (const [index, key] of uniqueCellKeys.entries()) {
      const cell = this.#getCellByKey(key);
      if (cell == null) {
        continue;
      }
      const center = cellCenter(layout, cell.row, cell.col);
      const sweep = this.add.rectangle(
        center.x,
        center.y,
        layout.cellSize * 0.78,
        layout.cellSize * 0.78,
        COLOR.complete,
        0.38,
      );
      this.#vfxLayer?.add(sweep);

      if (this.#services.reducedMotion) {
        sweep.setFillStyle(COLOR.complete, 0.22);
        this.tweens.add({
          alpha: 0,
          duration: 150,
          onComplete: () => sweep.destroy(),
          targets: sweep,
        });
      } else {
        sweep.setScale(0.12, 1);
        this.tweens.add({
          alpha: 0,
          delay: Math.min(250, index * 45),
          duration: 200,
          ease: "Sine.Out",
          onComplete: () => sweep.destroy(),
          scaleX: 1,
          targets: sweep,
        });
      }
    }

    if (effect.kind === "chain") {
      const crossing = this.#presentation.board.cells.find(
        (cell) =>
          cell.entryIds.filter((entryId) => effect.entryIds.includes(entryId))
            .length > 1,
      );
      if (crossing != null) {
        const center = cellCenter(layout, crossing.row, crossing.col);
        const wave = this.add
          .circle(center.x, center.y, layout.cellSize * 0.18, COLOR.focus, 0)
          .setStrokeStyle(4, COLOR.complete, 0.9);
        this.#vfxLayer?.add(wave);
        this.tweens.add({
          alpha: 0,
          duration: this.#services.reducedMotion ? 150 : 380,
          ease: "Sine.Out",
          onComplete: () => wave.destroy(),
          scale: this.#services.reducedMotion ? 1 : 2.6,
          targets: wave,
        });
      }
    }
  }

  #playBoardRestore(layout: SceneLayout): void {
    const paper = this.add.rectangle(
      layout.boardX + layout.boardWidth / 2,
      layout.boardY + layout.boardHeight / 2,
      layout.boardWidth + 12,
      layout.boardHeight + 12,
      COLOR.completeSoft,
      0.42,
    );
    this.#vfxLayer?.add(paper);

    if (this.#services.reducedMotion) {
      this.tweens.add({
        alpha: 0,
        duration: 180,
        onComplete: () => paper.destroy(),
        targets: paper,
      });
      return;
    }

    paper.setScale(1, 0.04);
    this.tweens.add({
      alpha: 0,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => paper.destroy(),
      scaleY: 1,
      targets: paper,
    });
  }

  #playWorldRestorePulse(layout: SceneLayout): void {
    const world = this.#presentation.world;
    if (world.progress <= 0) {
      return;
    }
    const left = Math.max(18, layout.width * 0.08);
    const right = layout.width - left;
    const x = left + (right - left) * world.progress;
    const y = layout.worldHeight * 0.58;
    const pulse = this.add
      .circle(x, y, 10, COLOR.worldRestored, 0)
      .setStrokeStyle(4, COLOR.worldRestored, 0.82);
    this.#vfxLayer?.add(pulse);

    this.tweens.add({
      alpha: 0,
      duration: this.#services.reducedMotion ? 150 : 420,
      ease: "Sine.Out",
      onComplete: () => pulse.destroy(),
      scale: this.#services.reducedMotion ? 1 : 2.4,
      targets: pulse,
    });
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
      delay = this.#services.reducedMotion ? 180 : 460;
    } else if (this.#presentation.phase === "board-resolved") {
      command = { type: "board.presentation.complete" };
      delay = this.#services.reducedMotion ? 200 : 680;
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
    this.tweens.pauseAll();
    this.input.enabled = false;
  }

  #resumePresentation(): void {
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
    this.tweens.killAll();
    this.#backgroundLayer = null;
    this.#worldLayer = null;
    this.#boardLayer = null;
    this.#vfxLayer = null;
  }
}

export type CrosswordSceneServices = SceneServices;
