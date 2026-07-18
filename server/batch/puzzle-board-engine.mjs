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

/**
 * 기존 2시간 배치와 출시 snapshot builder가 공유하는 순수 보드 생성 반복부다.
 * slot/route, wordbank 검수, DTO 직렬화와 파일 발행은 각 caller가 소유한다.
 */
export function generateBoardWithRetries({
  buildGeneratorOptions,
  evaluateCandidate,
  generateCandidates = generateBoards,
  onRetryComplete,
  retries,
  searchOptionsForRetry,
  seedForRetry,
  summarizeCandidate,
}) {
  requirePositiveInteger(retries, "retries");
  requireFunction(buildGeneratorOptions, "buildGeneratorOptions");
  requireFunction(evaluateCandidate, "evaluateCandidate");
  requireFunction(generateCandidates, "generateCandidates");
  requireFunction(searchOptionsForRetry, "searchOptionsForRetry");
  requireFunction(seedForRetry, "seedForRetry");
  requireFunction(summarizeCandidate, "summarizeCandidate");
  if (onRetryComplete != null) {
    requireFunction(onRetryComplete, "onRetryComplete");
  }

  const attempts = [];
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
      const accepted = candidates[acceptedCandidateIndex];
      return {
        accepted: true,
        attempts,
        board: accepted.board,
        quality: accepted.quality,
        selectedCandidateIndex: accepted.candidateIndex,
        selectedRetryIndex: retryIndex,
        selectedSeed: seed,
      };
    }
  }

  return { accepted: false, attempts };
}
