import Phaser from "phaser";

import type { GameCommand } from "../../crossword-core/src/gameController.ts";
import type {
  CrosswordGameCommandSource,
  CrosswordGameInteractiveAck,
  CrosswordGameOptions,
  CrosswordGameRuntime,
  CrosswordGameRuntimeEvent,
} from "./contracts.ts";
import { projectGameSnapshot } from "./projection.ts";
import {
  CrosswordBootScene,
  CrosswordPuzzleScene,
  PUZZLE_SCENE_KEY,
  type CrosswordSceneServices,
} from "./scenes.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCrosswordGameRuntime(
  options: CrosswordGameOptions,
): CrosswordGameRuntime {
  let currentPresentation = projectGameSnapshot(
    options.content,
    options.initialSnapshot,
  );
  let destroyed = false;
  let interactiveSettled = false;
  let runtimeSuspended = false;
  let gameReference: Phaser.Game | null = null;

  let resolveInteractive: (ack: CrosswordGameInteractiveAck) => void = () =>
    undefined;
  let rejectInteractive: (reason: Error) => void = () => undefined;
  const interactive = new Promise<CrosswordGameInteractiveAck>(
    (resolve, reject) => {
      resolveInteractive = resolve;
      rejectInteractive = reject;
    },
  );
  void interactive.catch(() => undefined);

  const emitRuntimeEvent = (event: CrosswordGameRuntimeEvent): void => {
    try {
      options.onRuntimeEvent?.(event);
    } catch {
      // Host telemetry failure must not corrupt or stop the game renderer.
    }
  };

  const requestCommand = (
    command: GameCommand,
    commandSequence: number,
    source: CrosswordGameCommandSource,
  ): void => {
    if (destroyed || options.onCommand == null) {
      return;
    }

    emitRuntimeEvent(
      Object.freeze({
        type: "command-requested",
        commandSequence,
        commandType: command.type,
        source,
      }),
    );

    try {
      Promise.resolve(
        options.onCommand(Object.freeze({ command, commandSequence, source })),
      ).catch((error: unknown) => {
        emitRuntimeEvent(
          Object.freeze({
            type: "command-request-failed",
            commandSequence,
            commandType: command.type,
            message: errorMessage(error),
            source,
          }),
        );
      });
    } catch (error: unknown) {
      emitRuntimeEvent(
        Object.freeze({
          type: "command-request-failed",
          commandSequence,
          commandType: command.type,
          message: errorMessage(error),
          source,
        }),
      );
    }
  };

  const requestEntrySelection = (
    entryId: string,
    commandSequence: number,
  ): void => {
    if (destroyed) {
      return;
    }
    const command: GameCommand = { type: "entry.select", entryId };
    emitRuntimeEvent(
      Object.freeze({
        type: "command-requested",
        commandSequence,
        commandType: command.type,
        source: "canvas-selection",
      }),
    );

    try {
      Promise.resolve(
        options.onEntrySelect(entryId, Object.freeze({ commandSequence })),
      ).catch((error: unknown) => {
        emitRuntimeEvent(
          Object.freeze({
            type: "command-request-failed",
            commandSequence,
            commandType: command.type,
            message: errorMessage(error),
            source: "canvas-selection",
          }),
        );
      });
    } catch (error: unknown) {
      emitRuntimeEvent(
        Object.freeze({
          type: "command-request-failed",
          commandSequence,
          commandType: command.type,
          message: errorMessage(error),
          source: "canvas-selection",
        }),
      );
    }
  };

  const acknowledgeInteractive = (ack: CrosswordGameInteractiveAck): void => {
    if (destroyed || interactiveSettled) {
      return;
    }
    interactiveSettled = true;
    resolveInteractive(ack);
    try {
      options.onInteractive?.(ack);
    } catch {
      // The promise remains the authoritative ack if a host callback fails.
    }
    emitRuntimeEvent(Object.freeze({ type: "interactive", ack }));
  };

  const services: CrosswordSceneServices = Object.freeze({
    acknowledgeInteractive,
    content: options.content,
    getPresentation: () => currentPresentation,
    isRuntimeSuspended: () => runtimeSuspended,
    onEntrySelect: requestEntrySelection,
    reducedMotion: options.reducedMotion ?? false,
    requestPresentationCommand: (command, commandSequence) => {
      requestCommand(command, commandSequence, "presentation-ack");
    },
  });

  const bootScene = new CrosswordBootScene(services);
  const puzzleScene = new CrosswordPuzzleScene(services);

  const getPuzzleScene = (): CrosswordPuzzleScene | null => {
    const activeGame = gameReference;
    if (activeGame == null || !activeGame.scene.isBooted) {
      return null;
    }
    return activeGame.scene.keys[PUZZLE_SCENE_KEY] instanceof
      CrosswordPuzzleScene
      ? (activeGame.scene.keys[PUZZLE_SCENE_KEY] as CrosswordPuzzleScene)
      : null;
  };

  const onContextLost = (): void => {
    if (destroyed) {
      return;
    }
    getPuzzleScene()?.handleContextLost();
    emitRuntimeEvent(
      Object.freeze({
        type: "context-lost",
        commandSequence: currentPresentation.commandSequence,
        puzzleId: currentPresentation.puzzleId,
      }),
    );
  };
  const onContextRestored = (): void => {
    if (destroyed) {
      return;
    }
    getPuzzleScene()?.handleContextRestored();
    emitRuntimeEvent(
      Object.freeze({
        type: "context-restored",
        commandSequence: currentPresentation.commandSequence,
        puzzleId: currentPresentation.puzzleId,
      }),
    );
  };

  const game = new Phaser.Game({
    antialias: true,
    antialiasGL: true,
    audio: { noAudio: true },
    autoFocus: false,
    backgroundColor: "#FFFBEF",
    banner: false,
    callbacks: {
      postBoot: (bootedGame) => {
        gameReference = bootedGame;
        bootedGame.canvas.setAttribute("aria-hidden", "true");
        bootedGame.canvas.setAttribute("role", "presentation");
        bootedGame.canvas.tabIndex = -1;
        bootedGame.renderer.on(
          Phaser.Renderer.Events.LOSE_WEBGL,
          onContextLost,
        );
        bootedGame.renderer.on(
          Phaser.Renderer.Events.RESTORE_WEBGL,
          onContextRestored,
        );
      },
    },
    disableContextMenu: true,
    parent: options.parent,
    render: {
      failIfMajorPerformanceCaveat: true,
      powerPreference: "default",
      roundPixels: true,
      skipUnreadyShaders: true,
    },
    scale: {
      autoCenter: Phaser.Scale.CENTER_BOTH,
      autoRound: true,
      height: "100%",
      mode: Phaser.Scale.RESIZE,
      parent: options.parent,
      width: "100%",
    },
    scene: [bootScene, puzzleScene],
    title: "말길: 가로세로 모험",
    transparent: false,
    type: Phaser.WEBGL,
    version: "0.1.0",
  });
  gameReference = game;

  return Object.freeze({
    canvas: game.canvas,
    interactive,
    update: (snapshot, events = []) => {
      if (destroyed) {
        throw new Error("cannot update a destroyed crossword-game runtime");
      }
      void events;
      const nextPresentation = projectGameSnapshot(options.content, snapshot);
      if (
        nextPresentation.commandSequence < currentPresentation.commandSequence
      ) {
        throw new Error("cannot project a stale game snapshot");
      }
      currentPresentation = nextPresentation;
      getPuzzleScene()?.updatePresentation(nextPresentation);
    },
    suspend: () => {
      if (destroyed || runtimeSuspended) {
        return;
      }
      runtimeSuspended = true;
      getPuzzleScene()?.suspendPresentation();
      game.loop.sleep();
    },
    resume: () => {
      if (destroyed || !runtimeSuspended) {
        return;
      }
      runtimeSuspended = false;
      game.loop.wake(true);
      getPuzzleScene()?.resumePresentation();
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      gameReference?.renderer.off(
        Phaser.Renderer.Events.LOSE_WEBGL,
        onContextLost,
      );
      gameReference?.renderer.off(
        Phaser.Renderer.Events.RESTORE_WEBGL,
        onContextRestored,
      );
      if (!interactiveSettled) {
        interactiveSettled = true;
        rejectInteractive(
          new Error("crossword-game destroyed before interactive ack"),
        );
      }
      emitRuntimeEvent(
        Object.freeze({
          type: "disposed",
          puzzleId: currentPresentation.puzzleId,
        }),
      );
      game.destroy(true, false);
      gameReference = null;
    },
  });
}
