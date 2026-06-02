import { readFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    assetRoot: "public",
    manifest: "public/puzzles/manifest.json",
  };

  for (const arg of argv) {
    if (arg.startsWith("--assetRoot=")) {
      options.assetRoot = arg.slice("--assetRoot=".length);
    }
    if (arg.startsWith("--manifest=")) {
      options.manifest = arg.slice("--manifest=".length);
    }
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isFilledCell(cell) {
  return cell != null && cell !== "";
}

function isInGrid(grid, row, col) {
  return row >= 0 && row < grid.length && col >= 0 && col < grid[row].length;
}

function directionDelta(direction) {
  return direction === "across" ? [0, 1] : [1, 0];
}

function scanSlots(grid) {
  const slots = [];

  for (const direction of ["across", "down"]) {
    const [rowDelta, colDelta] = directionDelta(direction);

    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        if (!isFilledCell(grid[row][col])) {
          continue;
        }

        const beforeRow = row - rowDelta;
        const beforeCol = col - colDelta;

        if (
          isInGrid(grid, beforeRow, beforeCol) &&
          isFilledCell(grid[beforeRow][beforeCol])
        ) {
          continue;
        }

        const cells = [];
        let currentRow = row;
        let currentCol = col;

        while (
          isInGrid(grid, currentRow, currentCol) &&
          isFilledCell(grid[currentRow][currentCol])
        ) {
          cells.push({ row: currentRow, col: currentCol });
          currentRow += rowDelta;
          currentCol += colDelta;
        }

        if (cells.length >= 2) {
          slots.push({
            answer: cells.map((cell) => grid[cell.row][cell.col]).join(""),
            col,
            direction,
            row,
          });
        }
      }
    }
  }

  return slots;
}

function slotKey(item) {
  return `${item.direction}:${item.row}:${item.col}`;
}

function validatePuzzle(puzzle) {
  const slots = scanSlots(puzzle.grid);
  const slotsByKey = new Map(slots.map((slot) => [slotKey(slot), slot]));
  const entriesByKey = new Map();

  for (const entry of puzzle.entries) {
    const key = slotKey(entry);
    entriesByKey.set(key, [...(entriesByKey.get(key) ?? []), entry]);
  }

  const missingEntries = slots.filter(
    (slot) => (entriesByKey.get(slotKey(slot))?.length ?? 0) === 0,
  );
  const entryWithoutSlots = puzzle.entries.filter(
    (entry) => !slotsByKey.has(slotKey(entry)),
  );
  const answerMismatches = puzzle.entries.flatMap((entry) => {
    const slot = slotsByKey.get(slotKey(entry));

    if (slot == null || slot.answer === entry.answer) {
      return [];
    }

    return [{ entry, slot }];
  });
  const duplicateEntries = Array.from(entriesByKey.values()).filter(
    (entries) => entries.length > 1,
  );

  return {
    answerMismatches,
    duplicateEntries,
    entryWithoutSlots,
    missingEntries,
    pass:
      missingEntries.length === 0 &&
      entryWithoutSlots.length === 0 &&
      answerMismatches.length === 0 &&
      duplicateEntries.length === 0,
    slots,
  };
}

function formatSlot(slot) {
  return `${slot.direction} (${slot.row},${slot.col}) ${slot.answer}`;
}

function resolvePuzzlePath(manifestPath, puzzlePath, assetRoot) {
  if (puzzlePath.startsWith("/")) {
    return path.resolve(assetRoot, puzzlePath.replace(/^\//, ""));
  }

  return path.resolve(path.dirname(manifestPath), puzzlePath);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const assetRoot = path.resolve(options.assetRoot);
  const manifest = await readJson(manifestPath);
  const failures = [];

  for (const item of manifest.puzzles) {
    const puzzlePath = resolvePuzzlePath(manifestPath, item.path, assetRoot);
    const puzzle = await readJson(puzzlePath);
    const validation = validatePuzzle(puzzle);

    if (!validation.pass) {
      failures.push({ item, puzzle, validation });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.puzzle.puzzleId} slot validation failed`);

      for (const slot of failure.validation.missingEntries) {
        console.error(`  missing entry: ${formatSlot(slot)}`);
      }

      for (const entry of failure.validation.entryWithoutSlots) {
        console.error(`  entry without slot: ${entry.id} ${formatSlot(entry)}`);
      }

      for (const { entry, slot } of failure.validation.answerMismatches) {
        console.error(
          `  answer mismatch: ${entry.id} ${entry.answer} != ${slot.answer}`,
        );
      }

      for (const entries of failure.validation.duplicateEntries) {
        console.error(
          `  duplicate entries: ${entries.map((entry) => entry.id).join(", ")}`,
        );
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log(`validated ${manifest.puzzles.length} puzzle(s)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
