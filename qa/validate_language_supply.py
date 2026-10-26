"""Independent structural audit of generated daily language packs.

This reads finished artifacts rather than importing the product generator's
validator. Passing this audit does not establish editorial ease of the clues.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from datetime import date
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text())


def audit_puzzle(puzzle):
    errors = []
    language = puzzle.get('language', 'ko')
    lower, upper = (18, 22) if language == 'ko' else (12, 18)
    entries = puzzle['entries']
    grid = puzzle['grid']
    if puzzle['gridSize'] != 8 or len(grid) != 8 or any(len(row) != 8 for row in grid):
        return ['grid-size'], {}
    if not lower <= len(entries) <= upper:
        errors.append('word-count')
    if len({entry['answer'] for entry in entries}) != len(entries):
        errors.append('duplicate-answer')
    cells = defaultdict(list)
    runs = set()
    for index, entry in enumerate(entries):
        answer = entry['answer']
        if not entry.get('clue', '').strip() or not entry.get('clueSource') or entry.get('needsManualClue'):
            errors.append('clue')
        if language == 'en' and (not answer.isascii() or not answer.isalpha() or not answer.isupper()):
            errors.append('english-alphabet')
        if language == 'en' and 'wordnet' in entry.get('clueSource', '').lower() and not entry.get('senseKey'):
            errors.append('english-sense')
        if entry['direction'] not in ['across', 'down']:
            errors.append('direction')
            continue
        runs.add((entry['row'], entry['col'], entry['direction'], answer))
        for offset, letter in enumerate(answer):
            row = entry['row'] + (offset if entry['direction'] == 'down' else 0)
            col = entry['col'] + (offset if entry['direction'] == 'across' else 0)
            if not (0 <= row < 8 and 0 <= col < 8) or grid[row][col] != letter:
                errors.append('answer-grid')
                continue
            if any(entries[other]['direction'] == entry['direction'] for other in cells[row, col]):
                errors.append('overlapping-same-direction')
            cells[row, col].append(index)
    actual_runs = set()
    for direction in ['across', 'down']:
        for line in range(8):
            offset = 0
            while offset < 8:
                row, col = (line, offset) if direction == 'across' else (offset, line)
                if not grid[row][col]:
                    offset += 1
                    continue
                start = offset
                word = ''
                while offset < 8:
                    row, col = (line, offset) if direction == 'across' else (offset, line)
                    if not grid[row][col]:
                        break
                    word += grid[row][col]
                    offset += 1
                if len(word) >= 2:
                    row, col = (line, start) if direction == 'across' else (start, line)
                    actual_runs.add((row, col, direction, word))
    if actual_runs != runs:
        errors.append('entry-run-mismatch')
    filled = {(row, col) for row in range(8) for col in range(8) if grid[row][col]}
    if filled != set(cells):
        errors.append('uncovered-grid-cell')
    graph = [set() for _ in entries]
    cross_cells = set()
    entry_crosses = defaultdict(int)
    for cell, indexes in cells.items():
        if len(indexes) > 1:
            cross_cells.add(cell)
            for index in indexes:
                entry_crosses[index] += 1
                graph[index].update(other for other in indexes if other != index)
    visited = set()
    stack = [0] if entries else []
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        stack.extend(graph[current] - visited)
    if len(visited) != len(entries):
        errors.append('disconnected')
    cross_ratio = len(cross_cells) / len(filled) if filled else 0
    multi_cross_ratio = sum(entry_crosses[index] >= 2 for index in range(len(entries))) / len(entries) if entries else 0
    if cross_ratio < .55:
        errors.append('cross-ratio')
    if multi_cross_ratio < .65:
        errors.append('multi-cross-ratio')
    metrics = puzzle.get('metrics', {})
    exact_metrics = {'wordCount': len(entries), 'filledCells': len(filled), 'crossCells': len(cross_cells),
                     'multiCrossEntries': sum(entry_crosses[index] >= 2 for index in range(len(entries)))}
    for name, actual in exact_metrics.items():
        if metrics.get(name) != actual:
            errors.append('metric:' + name)
    if abs(metrics.get('crossRatio', -1) - cross_ratio) > .00051:
        errors.append('metric:crossRatio')
    return sorted(set(errors)), {'wordCount': len(entries), 'crossRatio': cross_ratio,
                                 'multiCrossRatio': multi_cross_ratio}


def audit_pack(directory, language, expected_days):
    directory = Path(directory)
    manifest_path = directory / 'manifest.json'
    manifest = read(manifest_path)
    results = []
    history = []
    dates = defaultdict(list)
    for item in sorted(manifest['puzzles'], key=lambda row: (row['date'], row['dailySequence'])):
        source = directory / Path(item['path']).name
        puzzle = read(source)
        errors, metrics = audit_puzzle(puzzle)
        if puzzle.get('language') != language or item.get('language') != language:
            errors.append('language')
        if puzzle['puzzleId'] != item['puzzleId'] or puzzle['date'] != item['date']:
            errors.append('manifest-identity')
        day = date.fromisoformat(puzzle['date'])
        sequence = puzzle.get('dailySequence')
        if sequence != item.get('dailySequence') or sequence not in range(1, 6):
            errors.append('daily-sequence')
        for previous in history:
            delta = (day - date.fromisoformat(previous['date'])).days
            if 0 <= delta <= 14:
                repeated = {entry['answer'] for entry in puzzle['entries']} & {entry['answer'] for entry in previous['entries']}
                if repeated:
                    errors.append('14-day-repeat:' + ','.join(sorted(repeated)))
        dates[puzzle['date']].append(sequence)
        history.append(puzzle)
        results.append({'puzzleId': puzzle['puzzleId'], 'date': puzzle['date'], 'dailySequence': sequence,
                        'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'errors': sorted(set(errors)), **metrics})
    pack_errors = []
    if len(dates) != expected_days:
        pack_errors.append('day-count')
    if len(results) != expected_days * 5:
        pack_errors.append('puzzle-count')
    for day, sequences in dates.items():
        if sorted(sequences) != [1, 2, 3, 4, 5]:
            pack_errors.append('incomplete-day:' + day)
    return {'language': language, 'days': len(dates), 'puzzles': len(results),
            'errors': pack_errors, 'results': results,
            'pass': not pack_errors and all(not result['errors'] for result in results)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packs', required=True)
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    reports = [audit_pack(Path(args.packs) / language, language, args.days) for language in ['ko', 'en']]
    result = {'pass': all(report['pass'] for report in reports), 'languages': reports,
              'editorialEase': 'not-established-by-structural-audit'}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'pass': result['pass'], 'languages': [{key: report[key] for key in ['language', 'days', 'puzzles', 'pass', 'errors']} for report in reports]}))
    raise SystemExit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()
