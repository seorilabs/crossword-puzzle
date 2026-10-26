import { languagePolicy } from "../../packages/crossword-core/src/dailyLanguage.ts";
import { evaluateAnswerVariety } from "../../packages/crossword-core/src/answerVariety.ts";
export function templateSlots(mask) {
  const slots = [];
  for (const direction of ["across", "down"])
    for (let line = 0; line < 8; line++) {
      let start = 0;
      const cell = (i) =>
        mask[direction === "across" ? line : i][
          direction === "across" ? i : line
        ] === ".";
      while (start < 8) {
        while (start < 8 && !cell(start)) start++;
        let end = start;
        while (end < 8 && cell(end)) end++;
        if (end - start >= 2)
          slots.push({
            direction,
            row: direction === "across" ? line : start,
            col: direction === "across" ? start : line,
            length: end - start,
          });
        start = end + 1;
      }
    }
  return slots;
}
export function fillCrosswordTemplate(
  mask,
  words,
  language,
  seed,
  maxNodes = 10000,
) {
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const shuffled = words
    .map((word) => ({ word, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => ({
      ...x.word,
      chars: [...x.word.answer],
      uniqueChars: [...new Set([...x.word.answer])],
      fragments: [...x.word.answer]
        .slice(1)
        .map((_, i) => [...x.word.answer].slice(i, i + 2).join("")),
    }));
  const slots = templateSlots(mask),
    domains = slots.map((slot) =>
      shuffled.filter((word) => word.chars.length === slot.length),
    );
  const cells = new Map(),
    links = slots.map(() => []);
  slots.forEach((slot, i) => {
    for (let j = 0; j < slot.length; j++) {
      const key = `${slot.row + (slot.direction === "down" ? j : 0)},${slot.col + (slot.direction === "across" ? j : 0)}`;
      for (const [a, b] of cells.get(key) ?? []) {
        links[i].push([j, a, b]);
        links[a].push([b, i, j]);
      }
      cells.set(key, [...(cells.get(key) ?? []), [i, j]]);
    }
  });
  let nodes = 0;
  function propagate(ds) {
    let dirty = true;
    while (dirty) {
      dirty = false;
      for (let i = 0; i < ds.length; i++)
        for (const [at, j, pos] of links[i]) {
          const letters = new Set(ds[j].map((word) => word.chars[pos]));
          const next = ds[i].filter((word) => letters.has(word.chars[at]));
          if (!next.length) return null;
          if (next.length !== ds[i].length) {
            ds[i] = next;
            dirty = true;
          }
        }
    }
    return ds;
  }
  function solve(ds) {
    if (++nodes > maxNodes) return null;
    ds = propagate(ds);
    if (!ds) return null;
    const fixed = ds.filter((d) => d.length === 1).map((d) => d[0].answer);
    if (
      new Set(fixed).size !== fixed.length ||
      (languagePolicy(language).hangulVariety &&
        !evaluateAnswerVariety(fixed).pass)
    )
      return null;
    if (languagePolicy(language).hangulVariety && fixed.length) {
      const fragments = new Set(
        fixed.flatMap((answer) =>
          [...answer]
            .slice(1)
            .map((_, i) => [...answer].slice(i, i + 2).join("")),
        ),
      );
      const counts = new Map();
      for (const answer of fixed)
        for (const letter of new Set([...answer]))
          counts.set(letter, (counts.get(letter) ?? 0) + 1);
      const filtered = ds.map((d) =>
        d.length === 1
          ? d
          : d.filter(
              (word) =>
                !word.fragments.some((f) => fragments.has(f)) &&
                !word.uniqueChars.some((c) => (counts.get(c) ?? 0) >= 3),
            ),
      );
      if (filtered.some((d) => !d.length)) return null;
      if (filtered.some((d, i) => d.length !== ds[i].length))
        return solve(filtered);
    }
    let index = -1;
    for (let i = 0; i < ds.length; i++)
      if (ds[i].length > 1 && (index < 0 || ds[i].length < ds[index].length))
        index = i;
    if (index < 0) return ds.map((d) => d[0]);
    for (const word of ds[index]) {
      const next = ds.map((d, i) =>
        i === index ? [word] : d.filter((w) => w.answer !== word.answer),
      );
      if (next.some((d) => !d.length)) continue;
      const result = solve(next);
      if (result) return result;
    }
    return null;
  }
  const result = solve(domains);
  if (!result) return null;
  const grid = Array.from({ length: 8 }, () => Array(8).fill(""));
  const entries = slots.map((slot, i) => {
    const word = result[i];
    for (let j = 0; j < slot.length; j++)
      grid[slot.row + (slot.direction === "down" ? j : 0)][
        slot.col + (slot.direction === "across" ? j : 0)
      ] = word.chars[j];
    return {
      id: (slot.direction === "across" ? "a" : "d") + (i + 1),
      answer: word.answer,
      clue: word.clue,
      clueSource: word.clueSource ?? "국립국어원 한국어기초사전",
      ...(word.senseKey
        ? { senseKey: word.senseKey, synsetId: word.synsetId }
        : {}),
      ...(word.sourceLemma ? { sourceLemma: word.sourceLemma } : {}),
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      generatedBy: "placed",
    };
  });
  const crossCells = [...cells.values()].filter(
    (items) => items.length > 1,
  ).length;
  const multiCrossEntries = slots.filter(
    (_, i) =>
      [...cells.values()].filter(
        (items) => items.length > 1 && items.some(([id]) => id === i),
      ).length >= 2,
  ).length;
  const occupied = [...cells.keys()].map((key) => key.split(",").map(Number));
  const area =
    (Math.max(...occupied.map((p) => p[0])) -
      Math.min(...occupied.map((p) => p[0])) +
      1) *
    (Math.max(...occupied.map((p) => p[1])) -
      Math.min(...occupied.map((p) => p[1])) +
      1);
  return {
    grid,
    entries,
    metrics: {
      autoRunCount: 0,
      bboxDensity: cells.size / area,
      crossCells,
      crossRatio: crossCells / cells.size,
      filledCells: cells.size,
      multiCrossEntries,
      placedWordCount: entries.length,
      wordCount: entries.length,
    },
  };
}
