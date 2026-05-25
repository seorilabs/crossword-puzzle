import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

const SOURCE_BASE =
  "https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl-krdict/master";
const SOURCE_FILES = [
  "5000.xml",
  "10000.xml",
  "15000.xml",
  "20000.xml",
  "25000.xml",
  "30000.xml",
  "35000.xml",
  "40000.xml",
  "45000.xml",
  "50000.xml",
  "51947.xml",
];

const DEFAULT_OPTIONS = {
  limit: 25000,
  maxClueLength: 54,
  maxLength: 5,
  minLength: 2,
  out: "data/lexicon/krdict-puzzle-wordbank.json",
  sources: SOURCE_FILES.map((file) => `${SOURCE_BASE}/${file}`),
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

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    const numberValue = Number(rawValue);

    if (key === "source" && rawValue) options.sources = rawValue.split(",");
    if (key === "out" && rawValue) options.out = rawValue;
    if (key === "limit" && Number.isFinite(numberValue)) options.limit = numberValue;
    if (key === "minLength" && Number.isFinite(numberValue)) options.minLength = numberValue;
    if (key === "maxLength" && Number.isFinite(numberValue)) options.maxLength = numberValue;
    if (key === "maxClueLength" && Number.isFinite(numberValue)) {
      options.maxClueLength = numberValue;
    }
  }

  return options;
}

async function readSource(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return fetchText(source);
  }

  return readFile(path.resolve(source), "utf8");
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode != null &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          fetchText(response.headers.location).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
          response.resume();
          return;
        }

        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
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
      const candidate = {
        answer,
        clue,
        length: [...answer].length,
        level,
        pos,
        sourceId: String(entry.val ?? ""),
      };
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

      return left.answer.localeCompare(right.answer, "ko-KR");
    })
    .slice(0, options.limit);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const xmlDocuments = await Promise.all(options.sources.map((source) => readSource(source)));
  const words = parseEntries(xmlDocuments, options);
  const output = {
    metadata: {
      sourceName: "국립국어원 한국어기초사전 XML",
      sourceUrl: "https://github.com/spellcheck-ko/korean-dict-nikl-krdict",
      sourceUrls: options.sources,
      sourceMirror: "spellcheck-ko/korean-dict-nikl-krdict",
      license: LICENSE,
      generatedAt: new Date().toISOString(),
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

  console.log(`Wrote ${words.length} words to ${outPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
