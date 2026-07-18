import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

import { assignThemeTags } from "../packages/crossword-core/src/themeTags.ts";
import {
  KRDIC_SOURCE_ARTIFACTS,
  verifyKrdictSourceArtifact,
} from "./krdict-source-lock.mjs";

const PINNED_ARTIFACT_BY_URL = new Map(
  KRDIC_SOURCE_ARTIFACTS.map((artifact) => [artifact.rawUrl, artifact]),
);

const DEFAULT_OPTIONS = {
  limit: 25000,
  filterPath: "data/lexicon/puzzle-word-filter.json",
  maxClueLength: 54,
  maxLength: 5,
  minLength: 2,
  out: "data/lexicon/krdict-puzzle-wordbank.json",
  sources: KRDIC_SOURCE_ARTIFACTS.map((artifact) => artifact.rawUrl),
};

const LICENSE = {
  name: "Creative Commons Attribution-ShareAlike 2.0 Korea",
  spdx: "CC-BY-SA-2.0-KR",
  url: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
};

const LEVEL_RANK = {
  초급: 0,
  중급: 1,
  고급: 2,
  없음: 3,
};

function compareUtf16Strings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    const numberValue = Number(rawValue);

    if (key === "source" && rawValue) options.sources = rawValue.split(",");
    if (key === "filter" && rawValue) options.filterPath = rawValue;
    if (key === "out" && rawValue) options.out = rawValue;
    if (key === "limit" && Number.isFinite(numberValue))
      options.limit = numberValue;
    if (key === "minLength" && Number.isFinite(numberValue))
      options.minLength = numberValue;
    if (key === "maxLength" && Number.isFinite(numberValue))
      options.maxLength = numberValue;
    if (key === "maxClueLength" && Number.isFinite(numberValue)) {
      options.maxClueLength = numberValue;
    }
  }

  return options;
}

async function readSource(source) {
  let buffer;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    buffer = await fetchBuffer(source);
  } else {
    buffer = await readFile(path.resolve(source));
  }

  const pinnedArtifact = PINNED_ARTIFACT_BY_URL.get(source);
  if (pinnedArtifact != null) {
    verifyKrdictSourceArtifact(buffer, pinnedArtifact);
    console.log(
      `Verified pinned KRDIC source ${pinnedArtifact.file} (${pinnedArtifact.bytes} bytes)`,
    );
  }
  return buffer.toString("utf8");
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode != null &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          fetchBuffer(new URL(response.headers.location, url).href).then(
            resolve,
            reject,
          );
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
          response.resume();
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getFeat(node, att) {
  return asArray(node?.feat).find((item) => item.att === att)?.val;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClue(value) {
  return normalizeText(value)
    .replace(/\.$/, "")
    .replace(/^[「『](.*)[」』]$/, "$1");
}

function isPuzzleAnswer(answer, options) {
  const length = [...answer].length;

  return (
    length >= options.minLength &&
    length <= options.maxLength &&
    /^[가-힣]+$/u.test(answer)
  );
}

function isPuzzleClue(clue, answer, options) {
  return (
    clue.length > 0 &&
    clue.length <= options.maxClueLength &&
    !clue.includes(answer) &&
    !/[()《》]/u.test(clue)
  );
}

async function loadFilter(filePath) {
  if (filePath == null || filePath === "none") {
    return {};
  }

  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function inferDifficulty(level, length) {
  if (level === "초급" && length <= 3) {
    return "easy";
  }

  if (level === "고급" || (level === "없음" && length >= 4)) {
    return "hard";
  }

  return "normal";
}

function getBlockReason(candidate, filter) {
  if (filter.blockedAnswers?.includes(candidate.answer)) {
    return "blocked-answer";
  }

  if (filter.blockedSourceIds?.includes(candidate.sourceId)) {
    return "blocked-source-id";
  }

  const blockedClueTerm = filter.blockedClueIncludes?.find((term) =>
    candidate.definition.includes(term),
  );
  if (blockedClueTerm != null) {
    return `blocked-clue:${blockedClueTerm}`;
  }

  return null;
}

function applyCuration(candidate, filter) {
  const blockedReason = getBlockReason(candidate, filter);
  const manualClue = filter.cluesByAnswer?.[candidate.answer];

  return {
    ...candidate,
    allowForPuzzle: blockedReason == null,
    blockedReason,
    clue: manualClue ?? candidate.definition,
    clueSource: manualClue == null ? "krdict-definition" : "manual",
    difficulty:
      filter.difficultyByAnswer?.[candidate.answer] ??
      inferDifficulty(candidate.level, candidate.length),
    needsManualClue: manualClue == null,
    // 주제 태그: 명시적 override(themeTagsByAnswer)가 있으면 우선, 없으면 필터의
    // themeCategories 키워드 규칙을 적용한다(#236). 규칙 매칭은 공유 코어에 위임해
    // 후처리 스크립트(build-theme-tags)와 동일한 결과를 보장한다.
    themeTags:
      filter.themeTagsByAnswer?.[candidate.answer] ??
      assignThemeTags(candidate, filter.themeCategories ?? []),
  };
}

function pickClue(entry, answer, options) {
  const senses = asArray(entry.Sense);

  return senses
    .map((sense) => normalizeClue(getFeat(sense, "definition")))
    .filter((clue) => isPuzzleClue(clue, answer, options))
    .sort((left, right) => left.length - right.length)[0];
}

function parseEntries(xmlDocuments, options) {
  const parser = new XMLParser({
    allowBooleanAttributes: true,
    attributeNamePrefix: "",
    ignoreAttributes: false,
    isArray: (name) => ["LexicalEntry", "Sense", "feat"].includes(name),
  });
  const byAnswer = new Map();

  for (const xml of xmlDocuments) {
    const document = parser.parse(xml);
    const entries = asArray(document?.LexicalResource?.Lexicon?.LexicalEntry);

    for (const entry of entries) {
      const pos = normalizeText(getFeat(entry, "partOfSpeech"));
      if (pos !== "명사") continue;

      const answer = normalizeText(getFeat(entry.Lemma, "writtenForm"));
      if (!isPuzzleAnswer(answer, options)) continue;

      const clue = pickClue(entry, answer, options);
      if (clue == null) continue;

      const level = normalizeText(getFeat(entry, "vocabularyLevel")) || "없음";
      const candidate = applyCuration(
        {
          answer,
          definition: clue,
          length: [...answer].length,
          level,
          pos,
          sourceId: String(entry.val ?? ""),
        },
        options.filter,
      );
      const existing = byAnswer.get(answer);

      if (
        existing == null ||
        LEVEL_RANK[candidate.level] < LEVEL_RANK[existing.level] ||
        (LEVEL_RANK[candidate.level] === LEVEL_RANK[existing.level] &&
          candidate.clue.length < existing.clue.length)
      ) {
        byAnswer.set(answer, candidate);
      }
    }
  }

  return [...byAnswer.values()]
    .sort((left, right) => {
      const levelDiff = LEVEL_RANK[left.level] - LEVEL_RANK[right.level];
      if (levelDiff !== 0) return levelDiff;

      const lengthDiff = left.length - right.length;
      if (lengthDiff !== 0) return lengthDiff;

      return compareUtf16Strings(left.answer, right.answer);
    })
    .slice(0, options.limit);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  options.filter = await loadFilter(options.filterPath);
  const xmlDocuments = await Promise.all(
    options.sources.map((source) => readSource(source)),
  );
  const words = parseEntries(xmlDocuments, options);
  const allowedCount = words.filter((word) => word.allowForPuzzle).length;
  const blockedCount = words.length - allowedCount;
  const output = {
    metadata: {
      sourceName: "국립국어원 한국어기초사전 XML",
      sourceUrl: "https://github.com/spellcheck-ko/korean-dict-nikl-krdict",
      sourceUrls: options.sources,
      sourceMirror: "spellcheck-ko/korean-dict-nikl-krdict",
      license: LICENSE,
      generatedAt: new Date().toISOString(),
      curation: {
        allowedCount,
        blockedCount,
        filterPath: options.filterPath,
      },
      filters: {
        partOfSpeech: "명사",
        minLength: options.minLength,
        maxLength: options.maxLength,
        maxClueLength: options.maxClueLength,
        hangulOnly: true,
        clueDoesNotContainAnswer: true,
      },
      notes: [
        "뜻풀이를 퍼즐 힌트로 사용하므로 배포 전 CC BY-SA 2.0 KR 의무를 확인해야 합니다.",
        "발음 음원과 외부 멀티미디어 URL은 포함하지 않았습니다.",
      ],
    },
    words,
  };
  const outPath = path.resolve(options.out);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `Wrote ${words.length} words to ${outPath} (${allowedCount} allowed)`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
