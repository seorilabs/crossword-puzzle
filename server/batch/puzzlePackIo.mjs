// 퍼즐팩 배치가 공유하는 IO 헬퍼. Hosting 의 /puzzles/** 는 max-age=300 으로
// 캐시되므로, Job 이 방금 발행한 파일을 같은 실행 흐름에서 다시 읽을 때는
// 캐시를 우회해야 한다. 정책 모듈(packages/crossword-core)은 순수 함수만 두고,
// fetch·파일 접근은 여기에 모은다.
import { readFile } from "node:fs/promises";

import { ANSWER_HISTORY_PATH } from "../../packages/crossword-core/src/answerHistory.ts";

const DEFAULT_FETCH_ATTEMPTS = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

// Hosting CDN 은 query string 까지 캐시 키로 쓰므로, 매 요청에 고유값을 붙이면
// 항상 원본을 읽는다.
export function withCacheBust(url, label = "t") {
  const target = new URL(url);
  target.searchParams.set(label, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  return target;
}

// 캐시를 우회해 JSON 을 읽는다. 404 는 allowNotFound 일 때 null 로 돌려주고,
// 그 밖의 실패는 attempts 만큼 재시도한 뒤 throw 한다(throwOnError=false 면 경고 후
// null). 잘린 응답으로 이력을 덮어쓰는 사고를 막기 위해 기본은 throw 다.
export async function fetchJsonFresh(
  url,
  {
    attempts = DEFAULT_FETCH_ATTEMPTS,
    allowNotFound = true,
    throwOnError = true,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    label = "t",
  } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(withCacheBust(url, label), {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404 && allowNotFound) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(
        `[puzzle-pack-io] fetch attempt ${attempt}/${attempts} failed for ${url}: ${error.message}`,
      );
    }
  }

  if (throwOnError) {
    throw new Error(
      `Could not fetch ${url} after ${attempts} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }

  return null;
}

export async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function resolveAnswerHistoryUrl(baseUrl) {
  return new URL(ANSWER_HISTORY_PATH, baseUrl).toString();
}
