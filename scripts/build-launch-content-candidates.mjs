#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isSelfReferentialClue } from "../packages/crossword-core/src/clueCuration.ts";
import { assignThemeTags } from "../packages/crossword-core/src/themeTags.ts";
import {
  KRDIC_SOURCE_ARTIFACTS,
  KRDIC_SOURCE_COMMIT,
} from "./krdict-source-lock.mjs";

const CONTENT_LOCALE = "ko-KR";
const REVIEWED_AT = "2026-07-18T00:00:00.000Z";
const REVIEW_THEME_IDS = Object.freeze([
  "table-kitchen",
  "living-world",
  "home-family",
  "road-places",
  "learning-culture",
  "work-community",
]);
const TARGET_COUNT = 2_400;
const TARGET_BY_DIFFICULTY = Object.freeze({
  easy: 450,
  normal: 1_250,
  hard: 700,
});
const THEME_TARGET_BY_DIFFICULTY = Object.freeze({
  easy: 60,
  normal: 170,
  hard: 110,
});
const SOURCE_WORDBANK_PATH = "data/lexicon/krdict-puzzle-wordbank.json";
const SOURCE_WORDBANK_SHA256 =
  "sha256:8602e7462c3ce216ba34de9d4f9139a040e4afea30e3d08f9f6c81197299a946";
const THEME_FILTER_PATH = "data/lexicon/puzzle-word-filter.json";
const THEME_FILTER_SHA256 =
  "sha256:b794f1f306a6bf428c2f956c522edeccbca9df305114cbcd08cf5a155b7ccd10";

const REVIEW_RISK_TERMS = Object.freeze([
  "강간",
  "고문",
  "도박",
  "마약",
  "매춘",
  "살인",
  "성관계",
  "성기",
  "시체",
  "자살",
  "폭행",
  "학대",
  "혐오",
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function stableRank(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareUtf16Strings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCandidates(left, right, salt) {
  const leftManual = left.clueSource === "manual" ? 0 : 1;
  const rightManual = right.clueSource === "manual" ? 0 : 1;
  if (leftManual !== rightManual) return leftManual - rightManual;
  const leftLengthDistance = Math.abs(left.clue.length - 24);
  const rightLengthDistance = Math.abs(right.clue.length - 24);
  if (leftLengthDistance !== rightLengthDistance) {
    return leftLengthDistance - rightLengthDistance;
  }
  return compareUtf16Strings(
    stableRank(`${salt}:${left.sourceEntryId}:${left.answer}`),
    stableRank(`${salt}:${right.sourceEntryId}:${right.answer}`),
  );
}

function normalizeCandidate(word, categories) {
  const answer = String(word.answer ?? "")
    .normalize("NFC")
    .trim();
  const definition = String(word.definition ?? "")
    .normalize("NFC")
    .trim();
  const clue = String(word.clue ?? definition)
    .normalize("NFC")
    .trim();
  const sourceEntryId = String(word.sourceId ?? "").trim();
  const difficulty = ["easy", "normal", "hard"].includes(word.difficulty)
    ? word.difficulty
    : "normal";
  const domainTags = assignThemeTags(
    { ...word, answer, clue, definition },
    categories,
  ).filter((tag) => REVIEW_THEME_IDS.includes(tag));
  const riskFlags = REVIEW_RISK_TERMS.filter(
    (term) =>
      answer.includes(term) || clue.includes(term) || definition.includes(term),
  ).map((term) => `sensitive-term:${term}`);
  if (/[A-Za-z0-9<>]/.test(clue)) riskFlags.push("mixed-script-or-markup");
  if (clue.length < 5) riskFlags.push("clue-too-short");
  if (clue.length > 54) riskFlags.push("clue-too-long");
  if (
    !clue.includes(answer) &&
    (isSelfReferentialClue(answer, clue) ||
      isSelfReferentialClue(answer, definition))
  ) {
    riskFlags.push("normalized-answer-leakage");
  }

  return {
    answer,
    clue,
    clueSource: word.needsManualClue === false ? "manual" : "krdict-definition",
    clueKind: clue === definition ? "verbatim-source-definition" : "adapted",
    definition,
    definitionChecksum: sha256(
      JSON.stringify({
        contentLocale: CONTENT_LOCALE,
        sourceEntryId,
        answer,
        definition,
      }),
    ),
    difficulty,
    domainTags,
    level: String(word.level ?? "없음"),
    sourceEntryId,
    riskFlags,
  };
}

function isMechanicallyEligible(candidate) {
  return (
    candidate.answer.length >= 2 &&
    candidate.answer.length <= 5 &&
    candidate.sourceEntryId !== "" &&
    candidate.definition !== "" &&
    candidate.clue !== "" &&
    !candidate.riskFlags.some((flag) => flag.startsWith("sensitive-term:")) &&
    !candidate.clue.includes(candidate.answer) &&
    !candidate.definition.includes(candidate.answer)
  );
}

function addCandidates(selected, candidates, limit, salt) {
  for (const candidate of [...candidates].sort((left, right) =>
    compareCandidates(left, right, salt),
  )) {
    if (selected.size >= limit) break;
    selected.set(candidate.sourceEntryId, candidate);
  }
}

function selectCandidates(candidates) {
  const selected = new Map();

  for (const themeId of REVIEW_THEME_IDS) {
    for (const difficulty of ["easy", "normal", "hard"]) {
      const target = THEME_TARGET_BY_DIFFICULTY[difficulty];
      const pool = candidates.filter(
        (candidate) =>
          candidate.difficulty === difficulty &&
          candidate.domainTags.includes(themeId),
      );
      const before = selected.size;
      addCandidates(
        selected,
        pool,
        before + target,
        `theme:${themeId}:${difficulty}`,
      );
    }
  }

  for (const difficulty of ["easy", "normal", "hard"]) {
    const target = TARGET_BY_DIFFICULTY[difficulty];
    const alreadySelected = [...selected.values()].filter(
      (candidate) => candidate.difficulty === difficulty,
    ).length;
    addCandidates(
      selected,
      candidates.filter((candidate) => candidate.difficulty === difficulty),
      selected.size + Math.max(0, target - alreadySelected),
      `difficulty:${difficulty}`,
    );
  }

  addCandidates(selected, candidates, TARGET_COUNT, "catalog-fill");
  return [...selected.values()]
    .slice(0, TARGET_COUNT)
    .sort((left, right) => compareUtf16Strings(left.answer, right.answer));
}

function summarize(candidates) {
  const difficulty = { easy: 0, normal: 0, hard: 0 };
  const themes = Object.fromEntries(REVIEW_THEME_IDS.map((id) => [id, 0]));
  let manual = 0;
  let riskFlagged = 0;
  for (const candidate of candidates) {
    difficulty[candidate.difficulty] += 1;
    if (candidate.clueSource === "manual") manual += 1;
    if (candidate.riskFlags.length > 0) riskFlagged += 1;
    for (const tag of candidate.domainTags) themes[tag] += 1;
  }
  return { difficulty, manual, riskFlagged, themes, total: candidates.length };
}

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const wordbankText = await readFile(
    path.join(repositoryRoot, SOURCE_WORDBANK_PATH),
    "utf8",
  );
  const filterText = await readFile(
    path.join(repositoryRoot, THEME_FILTER_PATH),
    "utf8",
  );
  if (sha256(wordbankText) !== SOURCE_WORDBANK_SHA256) {
    throw new Error("curated KRDIC wordbank does not match the pinned input");
  }
  if (sha256(filterText) !== THEME_FILTER_SHA256) {
    throw new Error("theme filter does not match the pinned input");
  }
  const wordbank = JSON.parse(wordbankText);
  const filter = JSON.parse(filterText);
  const categories = filter.themeCategories ?? [];
  const normalized = wordbank.words
    .filter((word) => word.allowForPuzzle !== false)
    .map((word) => normalizeCandidate(word, categories))
    .filter(isMechanicallyEligible);
  const candidates = selectCandidates(normalized);
  if (candidates.length !== TARGET_COUNT) {
    throw new Error(
      `Expected ${TARGET_COUNT} review candidates, received ${candidates.length}`,
    );
  }

  const output = {
    schemaVersion: "game-content-review-candidates/1",
    contentLocale: CONTENT_LOCALE,
    reviewedAtTarget: REVIEWED_AT,
    sourceDataset: {
      datasetId: "nikl-krdict-text-2019-cc-by-sa-2.0-kr",
      sourceName: "국립국어원 한국어기초사전 XML",
      sourceUrl: "https://krdict.korean.go.kr/kor/openApi/openApiRegister",
      sourceMirror: "spellcheck-ko/korean-dict-nikl-krdict",
      sourceMirrorCommit: KRDIC_SOURCE_COMMIT,
      curatedInput: {
        wordbankPath: SOURCE_WORDBANK_PATH,
        wordbankSha256: SOURCE_WORDBANK_SHA256,
        themeFilterPath: THEME_FILTER_PATH,
        themeFilterSha256: THEME_FILTER_SHA256,
      },
      licenseId: "CC-BY-SA-2.0-KR",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
      sourceXmlBlobs: KRDIC_SOURCE_ARTIFACTS.map(
        ({ file, gitBlobSha1, rawSha256, bytes }) => ({
          file,
          gitBlobSha1,
          rawSha256,
          bytes,
        }),
      ),
    },
    policy: {
      targetCount: TARGET_COUNT,
      themeIds: REVIEW_THEME_IDS,
      requiredChecks: [
        "answer-and-definition-source-id-match",
        "no-answer-leakage",
        "age-appropriate-language",
        "single-clue-sense-is-understandable",
        "source-and-license-resolve",
      ],
      riskTerms: REVIEW_RISK_TERMS,
    },
    summary: summarize(candidates),
    candidates,
  };
  const outputPath = path.join(
    repositoryRoot,
    "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output.summary, null, 2));
  console.log(`wrote ${path.relative(repositoryRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
