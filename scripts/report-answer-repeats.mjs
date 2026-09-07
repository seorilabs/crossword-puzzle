#!/usr/bin/env node
// 발행 manifest 의 퍼즐과 정답 이력(answer-history.json)을 대조해 정확히 같은
// 정답이 다시 나온 쌍을 표로 출력한다. 라이브 Hosting(--baseUrl) 또는 로컬 생성
// 결과(--manifest/--assetRoot/--history)를 대상으로 쓴다.
//
//   npm run report:answer-repeats -- --baseUrl=https://crossword-puzzle-79ae0.web.app --date=2026-09-08
//   npm run report:answer-repeats -- --manifest=<dir>/puzzles/manifest.json --assetRoot=<dir> \
//     --history=<dir>/puzzles/answer-history.json --days=90
//
// 반복이 하나라도 있으면 exit 1(--exitZero 로 끌 수 있다). 이력 파일이 없으면
// manifest 퍼즐끼리만 대조하고 그 사실을 경고로 남긴다.
import path from "node:path";

import {
  DEFAULT_ANSWER_HISTORY_DAYS,
  createEmptyAnswerHistory,
  findAnswerHistoryRepeats,
  makeAnswerHistoryEntry,
  parseAnswerHistory,
  upsertAnswerHistory,
} from "../packages/crossword-core/src/answerHistory.ts";
import { isDifficulty } from "../packages/crossword-core/src/difficultyProfiles.ts";
import {
  fetchJsonFresh,
  readJsonOptional,
  resolveAnswerHistoryUrl,
} from "../server/batch/puzzlePackIo.mjs";

const DEFAULT_BASE_URL = "https://crossword-puzzle-79ae0.web.app";

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((item) => item.startsWith(prefix));

  return argument?.slice(prefix.length) ?? fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function resolveLocalPuzzlePath(assetRoot, manifestPath, puzzlePath) {
  if (puzzlePath.startsWith("/")) {
    return path.resolve(assetRoot, puzzlePath.replace(/^\//, ""));
  }

  return path.resolve(path.dirname(manifestPath), puzzlePath);
}

async function loadSource() {
  const manifestPath = readOption("manifest");

  if (manifestPath != null) {
    const assetRoot = readOption(
      "assetRoot",
      path.dirname(path.dirname(path.resolve(manifestPath))),
    );
    const historyPath = readOption(
      "history",
      path.join(path.dirname(path.resolve(manifestPath)), "answer-history.json"),
    );
    const manifest = await readJsonOptional(path.resolve(manifestPath));
    if (manifest == null) {
      throw new Error(`manifest not found: ${manifestPath}`);
    }

    return {
      label: path.resolve(manifestPath),
      manifest,
      loadPuzzle: (item) =>
        readJsonOptional(
          resolveLocalPuzzlePath(assetRoot, path.resolve(manifestPath), item.path),
        ),
      loadHistory: () => readJsonOptional(path.resolve(historyPath)),
    };
  }

  const baseUrl = readOption(
    "baseUrl",
    process.env.PUZZLE_HOSTING_BASE_URL ?? DEFAULT_BASE_URL,
  );
  const manifest = await fetchJsonFresh(
    new URL("/puzzles/manifest.json", baseUrl).toString(),
    { allowNotFound: false, label: "repeatReport" },
  );

  return {
    label: baseUrl,
    manifest,
    loadPuzzle: (item) =>
      fetchJsonFresh(new URL(item.path, baseUrl).toString(), {
        allowNotFound: true,
        label: "repeatReport",
      }),
    loadHistory: () =>
      fetchJsonFresh(resolveAnswerHistoryUrl(baseUrl), {
        allowNotFound: true,
        label: "repeatReport",
      }),
  };
}

async function run() {
  const days = Number(readOption("days", String(DEFAULT_ANSWER_HISTORY_DAYS)));
  const onlyDate = readOption("date");
  const source = await loadSource();
  const items = (source.manifest.puzzles ?? []).filter((item) =>
    isDifficulty(item.difficulty),
  );
  const entries = [];

  for (const item of items) {
    const puzzle = await source.loadPuzzle(item);
    if (puzzle == null) {
      console.warn(`[answer-repeats] puzzle not found: ${item.path}`);
      continue;
    }
    entries.push(makeAnswerHistoryEntry(puzzle));
  }

  const rawHistory = await source.loadHistory();
  const parsedHistory = rawHistory == null ? null : parseAnswerHistory(rawHistory);
  if (rawHistory == null) {
    console.warn(
      "[answer-repeats] answer-history.json not found; comparing manifest puzzles only",
    );
  } else if (parsedHistory == null) {
    console.warn(
      "[answer-repeats] answer-history.json is malformed; comparing manifest puzzles only",
    );
  }
  const latestDate = entries.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    "0000-00-00",
  );
  // manifest 퍼즐을 이력에 합쳐 두면 이력 파일이 없거나 뒤처져도 최근 14판끼리는
  // 대조된다.
  const history = upsertAnswerHistory(
    parsedHistory?.history ?? createEmptyAnswerHistory(days),
    entries,
    { retentionDays: Math.max(days, 1) * 4, today: latestDate },
  );
  const targets =
    onlyDate == null ? entries : entries.filter((entry) => entry.date === onlyDate);
  const repeats = findAnswerHistoryRepeats(targets, history, { days });

  console.log(
    `[answer-repeats] source=${source.label} puzzles=${targets.length}${onlyDate == null ? "" : ` date=${onlyDate}`} history=${history.puzzles.length} days=${days}`,
  );
  for (const repeat of repeats) {
    console.log(
      `${repeat.date} ${repeat.difficulty} ${repeat.puzzleId} "${repeat.answer}" <- ${repeat.previousDate} ${repeat.previousDifficulty} ${repeat.previousPuzzleId} (${repeat.gapDays}d)`,
    );
  }
  console.log(`[answer-repeats] repeats=${repeats.length}`);

  if (repeats.length > 0 && !hasFlag("exitZero")) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[answer-repeats] FAIL ${error.message}`);
  process.exitCode = 1;
});
