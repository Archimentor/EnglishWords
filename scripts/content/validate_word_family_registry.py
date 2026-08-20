"""Validate static word-family evidence against the pinned WordNet 3.0 archive.

The release registry remains checked-in TypeScript. This validator performs no
stemming and never rewrites it: it verifies every recorded sense-key pair is an
actual lexical `+` (derivationally-related-form) pointer in the SHA-256-pinned
Princeton WordNet 3.0 snapshot, then checks component closure and ownership.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / 'src' / 'domain' / 'content' / 'wordFamilySourceRegistry.ts'
SOURCES_PATH = ROOT / 'scripts' / 'content' / 'sources.ts'
CACHE_PATH = ROOT / '.content-cache' / 'wordnet-3.0.zip'
DATA_FILES = {
    'n': 'wordnet/data.noun',
    'v': 'wordnet/data.verb',
    'a': 'wordnet/data.adj',
    'r': 'wordnet/data.adv',
}
SENSE_TYPE_POS = {'1': 'n', '2': 'v', '3': 'a', '4': 'r', '5': 'a'}


@dataclass(frozen=True)
class SenseCoordinate:
    part_of_speech: str
    offset: str
    word_number: int


def source_digest() -> str:
    source = SOURCES_PATH.read_text(encoding='utf-8')
    match = re.search(
        r"id: 'wordnet-3\.0',[\s\S]*?sha256: '([a-f0-9]{64})'",
        source,
    )
    if not match:
        raise RuntimeError('wordnet-3.0 pinned source metadata is missing')
    return match.group(1)


def registry_rows() -> list[list[object]]:
    rows: list[list[object]] = []
    in_rows = False
    for raw_line in REGISTRY_PATH.read_text(encoding='utf-8').splitlines():
        if raw_line.startswith('export const SOURCE_VERIFIED_WORD_FAMILY_ROWS = ['):
            in_rows = True
            continue
        if in_rows and raw_line.startswith('] as const satisfies'):
            break
        if not in_rows:
            continue
        line = raw_line.strip()
        if not line.startswith('["'):
            continue
        rows.append(json.loads(line.removesuffix(',')))
    if not rows:
        raise RuntimeError('source-verified registry rows are missing')
    return rows


def parse_wordnet() -> tuple[
    dict[str, SenseCoordinate],
    set[tuple[SenseCoordinate, SenseCoordinate]],
]:
    expected_digest = source_digest()
    if not CACHE_PATH.is_file():
        raise RuntimeError(f'missing pinned WordNet cache: {CACHE_PATH}')
    actual_digest = hashlib.sha256(CACHE_PATH.read_bytes()).hexdigest()
    if actual_digest != expected_digest:
        raise RuntimeError(
            f'wordnet-3.0 SHA-256 mismatch: expected {expected_digest}, got {actual_digest}'
        )

    with zipfile.ZipFile(CACHE_PATH) as archive:
        index_rows: dict[str, tuple[str, str]] = {}
        for line in archive.read('wordnet/index.sense').decode('utf-8').splitlines():
            fields = line.split()
            if len(fields) >= 2:
                sense_key, offset = fields[:2]
                sense_type = sense_key.split('%', 1)[1].split(':', 1)[0]
                part_of_speech = SENSE_TYPE_POS.get(sense_type)
                if part_of_speech:
                    index_rows[sense_key] = (part_of_speech, offset)

        synset_words: dict[tuple[str, str], list[tuple[str, str]]] = {}
        raw_pointers: list[tuple[str, str, int, str, str, int]] = []
        for file_part_of_speech, member_name in DATA_FILES.items():
            for line in archive.read(member_name).decode('utf-8').splitlines():
                if not re.match(r'^\d{8}\s', line):
                    continue
                fields = line.split('|', 1)[0].split()
                offset = fields[0]
                word_count = int(fields[3], 16)
                cursor = 4
                words: list[tuple[str, str]] = []
                for _index in range(word_count):
                    word = re.sub(r'\((?:a|ip|p)\)$', '', fields[cursor].lower())
                    words.append((word, fields[cursor + 1].lower()))
                    cursor += 2
                synset_words[(file_part_of_speech, offset)] = words
                pointer_count = int(fields[cursor])
                cursor += 1
                for _index in range(pointer_count):
                    symbol, target_offset, target_pos, source_target = fields[cursor:cursor + 4]
                    cursor += 4
                    if symbol != '+':
                        continue
                    packed = int(source_target, 16)
                    raw_pointers.append((
                        file_part_of_speech,
                        offset,
                        packed >> 8,
                        'a' if target_pos == 's' else target_pos,
                        target_offset,
                        packed & 0xFF,
                    ))

    sense_coordinates: dict[str, SenseCoordinate] = {}
    for sense_key, (part_of_speech, offset) in index_rows.items():
        lemma, fields = sense_key.split('%', 1)
        # A sense key stores lex_id as a two-digit decimal integer, while the
        # data files store the same value as a single hexadecimal token.
        lex_id = int(fields.split(':')[2], 10)
        words = synset_words.get((part_of_speech, offset), [])
        for index, (word, word_lex_id) in enumerate(words, start=1):
            if word == lemma.lower() and int(word_lex_id, 16) == lex_id:
                sense_coordinates[sense_key] = SenseCoordinate(part_of_speech, offset, index)
                break

    pointers = {
        (
            SenseCoordinate(source_pos, source_offset, source_word),
            SenseCoordinate(target_pos, target_offset, target_word),
        )
        for source_pos, source_offset, source_word,
        target_pos, target_offset, target_word in raw_pointers
        if source_word > 0 and target_word > 0
    }
    return sense_coordinates, pointers


def validate() -> dict[str, int]:
    rows = registry_rows()
    coordinates, pointers = parse_wordnet()
    owners: dict[str, str] = {}
    evidence_count = 0

    for raw_head, raw_members, raw_evidence in rows:
        head = str(raw_head)
        members = [str(member) for member in raw_members]
        evidence = [[str(key) for key in pair] for pair in raw_evidence]
        member_set = set(members)
        if len(member_set) != len(members) or head not in member_set:
            raise RuntimeError(f'{head}: invalid member set')
        for member in members:
            previous_owner = owners.setdefault(member, head)
            if previous_owner != head:
                raise RuntimeError(f'{member}: overlapping families {previous_owner}/{head}')

        graph = {member: set() for member in members}
        for left_key, right_key in evidence:
            left_lemma = left_key.split('%', 1)[0].replace('_', '-').lower()
            right_lemma = right_key.split('%', 1)[0].replace('_', '-').lower()
            if left_lemma not in member_set or right_lemma not in member_set:
                raise RuntimeError(f'{head}: evidence leaves component: {left_key}/{right_key}')
            left = coordinates.get(left_key)
            right = coordinates.get(right_key)
            if not left or not right:
                raise RuntimeError(f'{head}: unknown sense key: {left_key}/{right_key}')
            if (left, right) not in pointers and (right, left) not in pointers:
                raise RuntimeError(f'{head}: no WordNet derivational pointer: {left_key}/{right_key}')
            graph[left_lemma].add(right_lemma)
            graph[right_lemma].add(left_lemma)
            evidence_count += 1

        reached = {head}
        pending = [head]
        while pending:
            for neighbor in graph[pending.pop()]:
                if neighbor not in reached:
                    reached.add(neighbor)
                    pending.append(neighbor)
        if reached != member_set:
            raise RuntimeError(f'{head}: evidence graph is not component-connected')

    return {
        'families': len(rows),
        'members': len(owners),
        'evidence': evidence_count,
    }


if __name__ == '__main__':
    try:
        print(json.dumps(validate(), sort_keys=True))
    except Exception as error:  # fail closed with one actionable line for npm scripts
        print(f'word-family registry validation failed: {error}', file=sys.stderr)
        raise SystemExit(1) from error
