#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isSelfReferentialClue } from "../packages/crossword-core/src/clueCuration.ts";

const CONTENT_LOCALE = "ko-KR";
const EXPECTED_CANDIDATE_COUNT = 2_400;
const MIN_APPROVED_COUNT = 1_100;
const EDITORIAL_CHECK_SET_ID = "ko-kr-launch-editorial-checks-v1";
const DECISION_FILE_NAMES = Object.freeze([
  "editorial-decisions-0000-0799.json",
  "editorial-decisions-0800-1599.json",
  "editorial-decisions-1600-2399.json",
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNonEmptyString(value, field) {
  requireCondition(
    typeof value === "string" && value.trim() !== "",
    `${field} must be a non-empty string`,
  );
  return value.trim();
}

function summarize(words, rejectedCount, rewrittenCount) {
  const difficulty = { easy: 0, normal: 0, hard: 0 };
  const themes = {};
  for (const word of words) {
    difficulty[word.difficulty] += 1;
    for (const themeId of word.domainTags) {
      themes[themeId] = (themes[themeId] ?? 0) + 1;
    }
  }
  return {
    approved: words.length,
    rejected: rejectedCount,
    rewritten: rewrittenCount,
    difficulty,
    themes,
  };
}

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const reviewsDirectory = path.join(
    repositoryRoot,
    "data/game-content/v1/ko-KR/reviews",
  );
  const candidatesPath = path.join(
    reviewsDirectory,
    "editorial-candidates.json",
  );
  const candidateText = await readFile(candidatesPath, "utf8");
  const candidateFileSha256 = sha256(candidateText);
  const candidateDocument = JSON.parse(candidateText);
  const candidates = candidateDocument.candidates;
  requireCondition(
    candidateDocument.contentLocale === CONTENT_LOCALE,
    "candidate contentLocale must be ko-KR",
  );
  requireCondition(
    Array.isArray(candidates) && candidates.length === EXPECTED_CANDIDATE_COUNT,
    `candidate count must be exactly ${EXPECTED_CANDIDATE_COUNT}`,
  );

  const coverage = [];
  const decisionBySourceEntryId = new Map();
  for (const fileName of DECISION_FILE_NAMES) {
    const decisionText = await readFile(
      path.join(reviewsDirectory, fileName),
      "utf8",
    );
    const decisionDocument = JSON.parse(decisionText);
    requireCondition(
      decisionDocument.schemaVersion === "game-content-editorial-decisions/1",
      `${fileName} schemaVersion is invalid`,
    );
    requireCondition(
      decisionDocument.contentLocale === CONTENT_LOCALE,
      `${fileName} contentLocale must be ko-KR`,
    );
    requireCondition(
      decisionDocument.candidateFileSha256 === candidateFileSha256,
      `${fileName} candidate checksum does not match`,
    );
    requireCondition(
      decisionDocument.checkSetId === EDITORIAL_CHECK_SET_ID,
      `${fileName} checkSetId is invalid`,
    );
    const reviewerId = requireNonEmptyString(
      decisionDocument.reviewerId,
      `${fileName}.reviewerId`,
    );
    const reviewedAt = requireNonEmptyString(
      decisionDocument.reviewedAt,
      `${fileName}.reviewedAt`,
    );
    requireCondition(
      !Number.isNaN(Date.parse(reviewedAt)),
      `${fileName}.reviewedAt must be an ISO timestamp`,
    );
    const startIndex = decisionDocument.coverage?.startIndex;
    const endIndexInclusive = decisionDocument.coverage?.endIndexInclusive;
    requireCondition(
      Number.isInteger(startIndex) && Number.isInteger(endIndexInclusive),
      `${fileName} coverage indexes must be integers`,
    );
    coverage.push({
      reviewerId,
      reviewedAt,
      startIndex,
      endIndexInclusive,
      decisionFile: `data/game-content/v1/ko-KR/reviews/${fileName}`,
      decisionFileSha256: sha256(decisionText),
    });

    requireCondition(
      Array.isArray(decisionDocument.decisions) &&
        decisionDocument.decisions.length ===
          endIndexInclusive - startIndex + 1,
      `${fileName}.decisions must explicitly cover every candidate in range`,
    );
    for (const [
      offset,
      decisionEntry,
    ] of decisionDocument.decisions.entries()) {
      const expectedCandidateIndex = startIndex + offset;
      requireCondition(
        decisionEntry.candidateIndex === expectedCandidateIndex,
        `${fileName} decision index ${offset} must target candidate ${expectedCandidateIndex}`,
      );
      const sourceEntryId = requireNonEmptyString(
        decisionEntry.sourceEntryId,
        `${fileName}.decisions.sourceEntryId`,
      );
      requireCondition(
        !decisionBySourceEntryId.has(sourceEntryId),
        `duplicate editorial decision for sourceEntryId=${sourceEntryId}`,
      );
      const candidateIndex = expectedCandidateIndex;
      requireCondition(
        candidateIndex >= startIndex && candidateIndex <= endIndexInclusive,
        `${fileName} decision sourceEntryId=${sourceEntryId} is outside its coverage`,
      );
      const candidate = candidates[candidateIndex];
      requireCondition(
        candidate.sourceEntryId === sourceEntryId &&
          candidate.answer === decisionEntry.answer &&
          candidate.definitionChecksum === decisionEntry.definitionChecksum,
        `${fileName} answer mismatch for sourceEntryId=${sourceEntryId}`,
      );
      requireCondition(
        ["approve", "reject", "rewrite"].includes(decisionEntry.decision),
        `${fileName} decision must be approve, reject or rewrite`,
      );
      requireCondition(
        decisionEntry.checkSetId === EDITORIAL_CHECK_SET_ID,
        `${fileName} decision checkSetId is invalid`,
      );
      requireCondition(
        Array.isArray(decisionEntry.reasonCodes) &&
          decisionEntry.reasonCodes.length > 0 &&
          decisionEntry.reasonCodes.every(
            (reason) => typeof reason === "string" && reason.trim() !== "",
          ),
        `${fileName} decision reasonCodes are required`,
      );
      if (decisionEntry.decision === "rewrite") {
        const clue = requireNonEmptyString(
          decisionEntry.clue,
          `${fileName} rewrite clue`,
        );
        requireCondition(
          clue.length >= 5 && clue.length <= 54,
          `${fileName} rewrite clue length is invalid for ${candidate.answer}`,
        );
        requireCondition(
          !isSelfReferentialClue(candidate.answer, clue),
          `${fileName} rewrite clue contains its answer: ${candidate.answer}`,
        );
      }
      if (decisionEntry.decision !== "reject") {
        const shortExplanation = requireNonEmptyString(
          decisionEntry.shortExplanation,
          `${fileName} shortExplanation`,
        );
        requireCondition(
          shortExplanation.length >= 2 && shortExplanation.length <= 80,
          `${fileName} shortExplanation length is invalid for ${candidate.answer}`,
        );
        requireCondition(
          !isSelfReferentialClue(candidate.answer, shortExplanation),
          `${fileName} shortExplanation contains its answer: ${candidate.answer}`,
        );
        requireNonEmptyString(
          decisionEntry.explanationReasonCode,
          `${fileName} explanationReasonCode`,
        );
      }
      requireCondition(
        candidate.riskFlags.length === 0 ||
          decisionEntry.decision === "rewrite" ||
          decisionEntry.decision === "reject",
        `${fileName} risk-flagged candidate must be rewritten or rejected: ${candidate.answer}`,
      );
      decisionBySourceEntryId.set(sourceEntryId, {
        ...decisionEntry,
        reviewerId,
        reviewedAt,
      });
    }
  }

  coverage.sort((left, right) => left.startIndex - right.startIndex);
  requireCondition(
    coverage.length === 3 &&
      coverage[0].startIndex === 0 &&
      coverage[2].endIndexInclusive === EXPECTED_CANDIDATE_COUNT - 1 &&
      coverage.every(
        (item, index) =>
          index === 0 ||
          item.startIndex === coverage[index - 1].endIndexInclusive + 1,
      ),
    "editorial coverage must be contiguous from candidate 0 through 2399",
  );

  let rejectedCount = 0;
  let rewrittenCount = 0;
  const words = [];
  const ledger = [];
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const reviewCoverage = coverage.find(
      (item) =>
        candidateIndex >= item.startIndex &&
        candidateIndex <= item.endIndexInclusive,
    );
    requireCondition(
      reviewCoverage != null,
      `candidate ${candidateIndex} is not reviewed`,
    );
    const editorialDecision = decisionBySourceEntryId.get(
      candidate.sourceEntryId,
    );
    requireCondition(
      editorialDecision != null,
      `candidate ${candidateIndex} has no explicit editorial decision`,
    );
    const decision = editorialDecision.decision;
    ledger.push({
      candidateIndex,
      sourceEntryId: candidate.sourceEntryId,
      answer: candidate.answer,
      decision,
      reasonCodes: editorialDecision.reasonCodes,
      checkSetId: EDITORIAL_CHECK_SET_ID,
      definitionChecksum: candidate.definitionChecksum,
      reviewerId: reviewCoverage.reviewerId,
      reviewedAt: reviewCoverage.reviewedAt,
      ...(decision === "rewrite"
        ? { rewrittenClue: editorialDecision.clue }
        : {}),
      ...(decision !== "reject"
        ? {
            shortExplanation: editorialDecision.shortExplanation,
            explanationReasonCode: editorialDecision.explanationReasonCode,
          }
        : {}),
    });
    if (decision === "reject") {
      rejectedCount += 1;
      continue;
    }
    if (decision === "rewrite") rewrittenCount += 1;
    const clue =
      decision === "rewrite" ? editorialDecision.clue : candidate.clue;
    words.push({
      answer: candidate.answer,
      answerCells: [...candidate.answer],
      definition: candidate.definition,
      definitionChecksum: candidate.definitionChecksum,
      length: [...candidate.answer].length,
      level: candidate.level,
      pos: "명사",
      sourceId: candidate.sourceEntryId,
      sourceEntryId: candidate.sourceEntryId,
      sourceUrl: candidateDocument.sourceDataset.sourceUrl,
      licenseId: candidateDocument.sourceDataset.licenseId,
      allowForPuzzle: true,
      clue,
      clueSource:
        decision === "rewrite" || candidate.clueKind === "adapted"
          ? "editorial-reviewed-adaptation"
          : "krdict-definition-reviewed",
      shortExplanation: editorialDecision.shortExplanation,
      source: candidateDocument.sourceDataset.sourceName,
      difficulty: candidate.difficulty,
      needsManualClue: false,
      themeTags:
        candidate.domainTags.length > 0 ? candidate.domainTags : ["general"],
      domainTags:
        candidate.domainTags.length > 0 ? candidate.domainTags : ["general"],
      reviewDecision: decision,
      reviewLedgerIndex: candidateIndex,
    });
  }

  requireCondition(
    words.length >= MIN_APPROVED_COUNT,
    `approved pool must contain at least ${MIN_APPROVED_COUNT} words`,
  );
  const summary = summarize(words, rejectedCount, rewrittenCount);
  const metadata = {
    schemaVersion: "launch-wordbank/1",
    contentLocale: CONTENT_LOCALE,
    sourceDataset: candidateDocument.sourceDataset,
    sourceCandidateFile:
      "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
    sourceCandidateFileSha256: candidateFileSha256,
    editorialCheckSetId: EDITORIAL_CHECK_SET_ID,
    reviewCoverage: coverage,
    summary,
  };
  const wordbank = { metadata, words };
  const wordbankText = `${JSON.stringify(wordbank, null, 2)}\n`;
  const ledgerDocument = {
    schemaVersion: "game-content-editorial-ledger/1",
    contentLocale: CONTENT_LOCALE,
    editorialCheckSetId: EDITORIAL_CHECK_SET_ID,
    candidateFileSha256,
    wordbankFileSha256: sha256(wordbankText),
    coverage,
    summary,
    decisions: ledger,
  };
  const outputDirectory = path.join(
    repositoryRoot,
    "data/game-content/v1/ko-KR",
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "reviewed-launch-wordbank.json"),
    wordbankText,
  );
  await writeFile(
    path.join(reviewsDirectory, "editorial-ledger.json"),
    `${JSON.stringify(ledgerDocument, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      { ...summary, wordbankFileSha256: sha256(wordbankText) },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
