"""Rebuild the deterministic 8x8 board shapes. Does not publish puzzle content.

Usage: python3 scripts/build-daily-board-templates.py OUTPUT.json
Policy floors are read from crossword-core. Each accepted mask covers every cell,
forms one connected crossword, and preserves the approved crossing thresholds.
"""
import argparse
import collections
import itertools
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
policies = json.loads(subprocess.check_output([
    'node', '--experimental-strip-types', '--input-type=module', '-e',
    "import {languagePolicy} from './packages/crossword-core/src/dailyLanguage.ts'; console.log(JSON.stringify({ko:languagePolicy('ko'),en:languagePolicy('en')}))",
], cwd=ROOT, text=True))


def valid(grid, language):
    slots, cells = [], collections.defaultdict(list)
    for dr, dc in [(0, 1), (1, 0)]:
        for y in range(8):
            for x in range(8):
                if not grid[y][x] or (y-dr >= 0 and x-dc >= 0 and grid[y-dr][x-dc]):
                    continue
                positions, row, col = [], y, x
                while row < 8 and col < 8 and grid[row][col]:
                    positions.append((row, col))
                    row, col = row+dr, col+dc
                if language == 'en' and len(positions) == 2:
                    return False
                if language == 'ko' and len(positions) > 4:
                    return False
                if len(positions) < (3 if language == 'en' else 2):
                    continue
                index = len(slots)
                slots.append(positions)
                for position in positions:
                    cells[position].append(index)
    policy = policies[language]
    if not policy['words'][0] <= len(slots) <= policy['words'][1]:
        return False
    if language == 'en' and sum(len(slot) == 3 for slot in slots) > 2:
        return False
    if language == 'ko' and (sum(len(slot) == 4 for slot in slots) > 1 or sum(len(slot) == 2 for slot in slots) > 16):
        return False
    if len(cells) != sum(map(sum, grid)):
        return False
    cross = {pos for pos, ids in cells.items() if len(ids) == 2}
    if not policy['minCrossRatio'] <= len(cross)/len(cells) <= .8:
        return False
    if sum(sum(pos in cross for pos in slot) >= 2 for slot in slots)/len(slots) < policy['minMultiCrossRatio']:
        return False
    seen, todo = {0}, [0]
    while todo:
        for pos in slots[todo.pop()]:
            for index in cells[pos]:
                if index not in seen:
                    seen.add(index)
                    todo.append(index)
    return len(seen) == len(slots)


def mask_of(grid):
    return tuple(''.join('.' if cell else '#' for cell in row) for row in grid)


# A connected original English seed, expanded through deterministic local changes.
seed = ['########', '...#.#.#', '.#.....#', '...#....', '.#.....#', '.#...#.#', '###.####', '##.....#']
base = [[cell == '.' for cell in row] for row in seed]
english = []
for count in [2, 3]:
    for bits in itertools.combinations(range(64), count):
        grid = [row[:] for row in base]
        for bit in bits:
            grid[bit//8][bit % 8] = not grid[bit//8][bit % 8]
        if valid(grid, 'en'):
            english.append({'language': 'en', 'mask': list(mask_of(grid))})
known = {tuple(row['mask']) for row in english}
rng = random.Random(20261026)
for _ in range(300000):
    grid = [[cell == '.' for cell in row] for row in rng.choice(english)['mask']]
    for bit in rng.sample(range(64), rng.choice([1, 2, 3, 4])):
        grid[bit//8][bit % 8] = not grid[bit//8][bit % 8]
    mask = mask_of(grid)
    if mask in known or not valid(grid, 'en'):
        continue
    known.add(mask)
    english.append({'language': 'en', 'mask': list(mask)})
    if len(english) >= 3000:
        break
assert len(english) == 3000

# Induced paths give Korean short words enough intersections without adjacent runs.
rng = random.Random(20261026)
korean = {}
directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]
for _ in range(200000):
    start = (rng.randrange(8), rng.randrange(8))
    path, visited, last, run = [start], {start}, None, 0
    for step in range(40):
        y, x = path[-1]
        moves = []
        for dy, dx in directions:
            pos = (y+dy, x+dx)
            if not (0 <= pos[0] < 8 and 0 <= pos[1] < 8) or pos in visited:
                continue
            if any((pos[0]+a, pos[1]+b) in visited and (pos[0]+a, pos[1]+b) != (y, x) for a, b in directions):
                continue
            if (dy, dx) == last and run >= 2:
                continue
            moves.append((dy, dx, pos))
        if not moves:
            break
        dy, dx, pos = rng.choice(moves)
        run = run+1 if (dy, dx) == last else 1
        last = (dy, dx)
        path.append(pos)
        visited.add(pos)
        if step >= 19:
            grid = [[(yy, xx) in visited for xx in range(8)] for yy in range(8)]
            if valid(grid, 'ko'):
                mask = mask_of(grid)
                korean[mask] = {'language': 'ko', 'mask': list(mask)}
    if len(korean) >= 100:
        break
assert len(korean) == 102
args.output.write_text(json.dumps(list(korean.values())+english, indent=2)+'\n')
print(json.dumps({'ko': len(korean), 'en': len(english), 'output': str(args.output)}))
