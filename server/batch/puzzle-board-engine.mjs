import { generateBoards } from "../../scripts/crossword-generator-prototype.mjs";

function requireFunction(value, field) {
  if (typeof value !== "function") {
    throw new TypeError(`${field} must be a function`);
  }
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
}

function selectAcceptedCandidate(candidates, compareAcceptedCandidates) {
  return candidates.reduce((selected, candidate) => {
    if (selected == null) return candidate;
    if (compareAcceptedCandidates == null) return selected;
    return compareAcceptedCandidates(candidate, selected) < 0
      ? candidate
      : selected;
  }, null);
}

function acceptedResult(candidate, attempts) {
  return {
    accepted: true,
    attempts,
    board: candidate.board,
    quality: candidate.quality,
    selectedCandidateIndex: candidate.candidateIndex,
    selectedRetryIndex: candidate.retryIndex,
    selectedSeed: candidate.seed,
  };
}

/**
 * 기존 2시간 배치와 출시 snapshot builder가 공유하는 순수 보드 생성 반복부다.
 * slot/route, wordbank 검수, DTO 직렬화와 파일 발행은 각 caller가 소유한다.
 */
export function generateBoardWithRetries({
  acceptedLookaheadRetries = 0,
  buildGeneratorOptions,
  compareAcceptedCandidates,
  evaluateCandidate,
  generateCandidates = generateBoards,
  onRetryComplete,
  retries,
  searchOptionsForRetry,
  seedForRetry,
  summarizeCandidate,
}) {
  requirePositiveInteger(retries, "retries");
  requireNonNegativeInteger(
    acceptedLookaheadRetries,
    "acceptedLookaheadRetries",
  );
  requireFunction(buildGeneratorOptions, "buildGeneratorOptions");
  requireFunction(evaluateCandidate, "evaluateCandidate");
  requireFunction(generateCandidates, "generateCandidates");
  requireFunction(searchOptionsForRetry, "searchOptionsForRetry");
  requireFunction(seedForRetry, "seedForRetry");
  requireFunction(summarizeCandidate, "summarizeCandidate");
  if (onRetryComplete != null) {
    requireFunction(onRetryComplete, "onRetryComplete");
  }
  if (compareAcceptedCandidates != null) {
    requireFunction(compareAcceptedCandidates, "compareAcceptedCandidates");
  }

  const attempts = [];
  const acceptedCandidates = [];
  let firstAcceptedRetryIndex = null;
  for (let retryIndex = 0; retryIndex < retries; retryIndex += 1) {
    const seed = seedForRetry(retryIndex);
    const searchOptions = searchOptionsForRetry(retryIndex);
    const retryStartedAt = Date.now();
    const boards = generateCandidates(
      buildGeneratorOptions({ retryIndex, searchOptions, seed }),
    );
    const candidates = boards.map((board, candidateIndex) => {
      const quality = evaluateCandidate(board);
      return {
        board,
        candidateIndex,
        quality,
        report: summarizeCandidate(board, quality, candidateIndex),
      };
    });
    const acceptedCandidateIndex = candidates.findIndex(
      (candidate) => candidate.quality.pass,
    );
    const attempt = {
      retryIndex,
      seed,
      searchOptions,
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => candidate.report),
    };
    attempts.push(attempt);
    onRetryComplete?.({
      acceptedCandidateIndex,
      attempt,
      elapsedMilliseconds: Date.now() - retryStartedAt,
    });

    if (acceptedCandidateIndex !== -1) {
      firstAcceptedRetryIndex ??= retryIndex;
      acceptedCandidates.push(
        ...candidates
          .filter((candidate) => candidate.quality.pass)
          .map((candidate) => ({ ...candidate, retryIndex, seed })),
      );
    }

    if (
      firstAcceptedRetryIndex != null &&
      retryIndex - firstAcceptedRetryIndex >= acceptedLookaheadRetries
    ) {
      return acceptedResult(
        selectAcceptedCandidate(acceptedCandidates, compareAcceptedCandidates),
        attempts,
      );
    }
  }

  if (acceptedCandidates.length > 0) {
    return acceptedResult(
      selectAcceptedCandidate(acceptedCandidates, compareAcceptedCandidates),
      attempts,
    );
  }

  return { accepted: false, attempts };
}
