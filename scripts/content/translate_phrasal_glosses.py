import itertools
import json
import os
import platform
import re
import tempfile
from importlib.metadata import PackageNotFoundError, version as distribution_version
from pathlib import Path
from typing import TypedDict, cast

import torch
import torch.nn.functional as functional
from huggingface_hub import snapshot_download
from transformers import AutoModel, AutoModelForSeq2SeqLM, AutoTokenizer


ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / ".content-cache" / "phrasal-translation-input.json"
OUTPUT = ROOT / ".content-cache" / "phrasal-gloss-candidates.json"
REQUIREMENTS = ROOT / "scripts" / "content" / "requirements-content.txt"
ALIGNMENT_THRESHOLD = 0.09
MINIMUM_EXAMPLE_SIMILARITY = 0.05
MINIMUM_PAIR_SIMILARITY = 0.05
EXPECTED_PYTHON_SERIES = "3.12"
PREPARED_INPUT_SCHEMA_VERSION = "3.0.0"
PREPARED_CANDIDATE_COUNT = 1_083
PREPARED_TARGET_COUNT = 1_000
PINNED_ALIGNMENT_MODEL = {
    "id": "sentence-transformers/all-MiniLM-L6-v2",
    "revision": "1110a243fdf4706b3f48f1d95db1a4f5529b4d41",
    "license": "Apache-2.0",
}
PINNED_TRANSLATION_MODEL = {
    "id": "seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko",
    "revision": "280cc2c35ec50579e1534c0493fcdcfdf0c5ece3",
    "license": "Apache-2.0",
}
REQUIRED_PHRASAL_PHRASES = ("wake up",)
RUNTIME_DISTRIBUTIONS = (
    "torch",
    "transformers",
    "sentencepiece",
    "huggingface-hub",
    "safetensors",
)


class PreparedCandidate(TypedDict):
    phrase: str
    verbForms: list[str]
    descriptions: list[str]
    examples: list[str]


class AlignmentOverride(TypedDict):
    phrase: str
    englishDescription: str
    examples: list[str]


class SameAsGlossOverride(TypedDict):
    phrase: str
    englishDescription: str
    meaningKo: str


class PreparedInput(TypedDict):
    schemaVersion: str
    alignmentModel: dict[str, str]
    translationModel: dict[str, str]
    targetCount: int
    requiredPhrases: list[str]
    alignmentOverrides: list[AlignmentOverride]
    sameAsGlossOverrides: list[SameAsGlossOverride]
    phrases: list[PreparedCandidate]


def expected_runtime_versions(requirements_path: Path = REQUIREMENTS) -> dict[str, str]:
    pins: dict[str, str] = {}
    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)", line)
        if match is None:
            raise RuntimeError(f"Content runtime dependency is not exactly pinned: {line}")
        package_name = match.group(1).lower().replace("_", "-")
        pins[package_name] = match.group(2)

    missing = [name for name in RUNTIME_DISTRIBUTIONS if name not in pins]
    if missing:
        raise RuntimeError(
            f"Content runtime requirements are missing pins for: {', '.join(missing)}"
        )
    return {
        "python": EXPECTED_PYTHON_SERIES,
        **{name: pins[name] for name in RUNTIME_DISTRIBUTIONS},
    }


def installed_runtime_versions() -> dict[str, str]:
    versions = {
        "python": platform.python_version(),
        "torch": str(torch.__version__),
    }
    for package_name in RUNTIME_DISTRIBUTIONS:
        if package_name == "torch":
            continue
        try:
            versions[package_name] = distribution_version(package_name)
        except PackageNotFoundError as error:
            raise RuntimeError(
                f"Required content runtime distribution is not installed: {package_name}"
            ) from error
    return versions


def validate_runtime_versions(
    actual: dict[str, str],
    expected: dict[str, str],
) -> None:
    mismatches: list[str] = []
    for name, expected_version in expected.items():
        actual_version = actual.get(name)
        if actual_version is None:
            mismatches.append(f"{name} is missing (expected {expected_version})")
            continue
        comparable = actual_version
        if name == "python":
            comparable = ".".join(actual_version.split(".")[:2])
        elif name == "torch":
            comparable = actual_version.split("+", 1)[0]
        if comparable != expected_version:
            mismatches.append(
                f"{name} is {actual_version} (expected {expected_version})"
            )
    if mismatches:
        raise RuntimeError(f"Content runtime version mismatch: {'; '.join(mismatches)}")


def verified_runtime_versions() -> dict[str, str]:
    expected = expected_runtime_versions()
    actual = installed_runtime_versions()
    validate_runtime_versions(actual, expected)
    return actual


def local_alignment_model(model_info: dict[str, str]) -> str:
    destination = ROOT / ".content-cache" / "models" / "all-MiniLM-L6-v2"
    return snapshot_download(
        model_info["id"],
        revision=model_info["revision"],
        local_dir=destination,
        allow_patterns=[
            "config.json",
            "model.safetensors",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "vocab.txt",
        ],
    )


def local_translation_model(model_info: dict[str, str]) -> str:
    destination = ROOT / ".content-cache" / "models" / "ke-t5-en-to-ko"
    return snapshot_download(
        model_info["id"],
        revision=model_info["revision"],
        local_dir=destination,
        allow_patterns=[
            "config.json",
            "generation_config.json",
            "model.safetensors",
            "special_tokens_map.json",
            "spiece.model",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    )


def contains_phrasal_form(
    sentence: str,
    phrase: str,
    verb_forms: list[str],
) -> bool:
    words = phrase.strip().split()
    if len(words) != 2 or any(re.fullmatch(r"[a-z]+", word, re.I) is None for word in words):
        return False
    _, particle_word = words
    verb_pattern = "(?:" + "|".join(re.escape(form) for form in verb_forms) + ")"
    particle = re.escape(particle_word)
    object_word = r"[A-Za-z]+(?:['’~-][A-Za-z]+)*"
    contiguous = rf"{verb_pattern}\s+{particle}"
    separable = rf"{verb_pattern}(?:\s+{object_word}){{1,3}}\s+{particle}"
    return re.search(
        rf"(?<![A-Za-z])(?:{contiguous}|{separable})(?![A-Za-z])",
        sentence,
        re.I,
    ) is not None


def _validated_string_list(
    value: object,
    field: str,
    minimum: int,
) -> list[str]:
    if not isinstance(value, list) or len(value) < minimum:
        raise RuntimeError(f"Prepared {field} must contain at least {minimum} strings")
    if not all(isinstance(item, str) and item == item.strip() and item for item in value):
        raise RuntimeError(f"Prepared {field} must contain non-empty trimmed strings")
    if len(set(value)) != len(value):
        raise RuntimeError(f"Prepared {field} must be unique")
    return cast(list[str], value)


def validate_prepared_input(value: object) -> PreparedInput:
    if not isinstance(value, dict):
        raise RuntimeError("Prepared phrasal input must be an object")
    expected_fields = {
        "schemaVersion",
        "alignmentModel",
        "translationModel",
        "targetCount",
        "requiredPhrases",
        "alignmentOverrides",
        "sameAsGlossOverrides",
        "phrases",
    }
    if set(value) != expected_fields:
        raise RuntimeError("Prepared phrasal input has invalid root fields")
    if value.get("schemaVersion") != PREPARED_INPUT_SCHEMA_VERSION:
        raise RuntimeError(
            f"Prepared schemaVersion must be {PREPARED_INPUT_SCHEMA_VERSION}"
        )
    if value.get("alignmentModel") != PINNED_ALIGNMENT_MODEL:
        raise RuntimeError("Prepared input does not use the pinned alignment model")
    if value.get("translationModel") != PINNED_TRANSLATION_MODEL:
        raise RuntimeError("Prepared input does not use the pinned translation model")
    if type(value.get("targetCount")) is not int or value["targetCount"] != PREPARED_TARGET_COUNT:
        raise RuntimeError(f"Prepared targetCount must be {PREPARED_TARGET_COUNT}")

    raw_required = value.get("requiredPhrases")
    if not isinstance(raw_required, list) or not all(
        isinstance(phrase, str) for phrase in raw_required
    ):
        raise RuntimeError("Prepared requiredPhrases must be a list of strings")
    if any(re.fullmatch(r"[a-z]+ [a-z]+", phrase) is None for phrase in raw_required):
        raise RuntimeError("Prepared requiredPhrases must contain two lowercase words")
    if len(set(raw_required)) != len(raw_required):
        raise RuntimeError("Prepared requiredPhrases must be unique")
    if raw_required != list(REQUIRED_PHRASAL_PHRASES):
        raise RuntimeError("Prepared input does not use the pinned required phrases")

    raw_candidates = value.get("phrases")
    if not isinstance(raw_candidates, list) or len(raw_candidates) != PREPARED_CANDIDATE_COUNT:
        raise RuntimeError(
            f"Prepared phrases must contain exactly {PREPARED_CANDIDATE_COUNT} candidates"
        )
    candidates: list[PreparedCandidate] = []
    seen_phrases: set[str] = set()
    for index, raw_candidate in enumerate(raw_candidates):
        if not isinstance(raw_candidate, dict) or set(raw_candidate) != {
            "phrase",
            "verbForms",
            "descriptions",
            "examples",
        }:
            raise RuntimeError(f"Prepared candidate {index} has invalid fields")
        phrase = raw_candidate.get("phrase")
        if not isinstance(phrase, str) or re.fullmatch(r"[a-z]+ [a-z]+", phrase) is None:
            raise RuntimeError(f"Prepared candidate {index} has an invalid phrase")
        if phrase in seen_phrases:
            raise RuntimeError(f"Prepared candidate phrase is duplicated: {phrase}")
        verb_forms = _validated_string_list(
            raw_candidate.get("verbForms"),
            f"candidate {index} verbForms",
            1,
        )
        base_verb = phrase.split()[0]
        if (
            base_verb not in verb_forms
            or len(verb_forms) > 12
            or any(re.fullmatch(r"[a-z]+", form) is None for form in verb_forms)
        ):
            raise RuntimeError(f"Prepared candidate {index} has invalid verb forms")
        descriptions = _validated_string_list(
            raw_candidate.get("descriptions"),
            f"candidate {index} descriptions",
            1,
        )
        examples = _validated_string_list(
            raw_candidate.get("examples"),
            f"candidate {index} examples",
            2,
        )
        if not any(
            contains_phrasal_form(example, phrase, verb_forms)
            for example in examples
        ):
            raise RuntimeError(
                f"Prepared candidate {index} has no example containing its base phrase"
            )
        seen_phrases.add(phrase)
        candidates.append(
            {
                "phrase": phrase,
                "verbForms": verb_forms,
                "descriptions": descriptions,
                "examples": examples,
            }
        )

    missing_required = [
        phrase for phrase in raw_required if phrase not in seen_phrases
    ]
    if missing_required:
        raise RuntimeError(
            "Prepared required phrases are missing from candidates: "
            f"{', '.join(missing_required)}"
        )
    if PREPARED_TARGET_COUNT > len(candidates):
        raise RuntimeError("Prepared targetCount exceeds the candidate count")

    candidates_by_phrase = {candidate["phrase"]: candidate for candidate in candidates}
    raw_overrides = value.get("alignmentOverrides")
    if not isinstance(raw_overrides, list):
        raise RuntimeError("Prepared alignmentOverrides must be a list")
    alignment_overrides: list[AlignmentOverride] = []
    seen_overrides: set[str] = set()
    for index, raw_override in enumerate(raw_overrides):
        if not isinstance(raw_override, dict) or set(raw_override) != {
            "phrase",
            "englishDescription",
            "examples",
        }:
            raise RuntimeError(f"Prepared alignment override {index} has invalid fields")
        phrase = raw_override.get("phrase")
        description = raw_override.get("englishDescription")
        examples = raw_override.get("examples")
        if not isinstance(phrase, str) or re.fullmatch(r"[a-z]+ [a-z]+", phrase) is None:
            raise RuntimeError(f"Prepared alignment override {index} has an invalid phrase")
        if phrase in seen_overrides:
            raise RuntimeError(f"Prepared alignment override is duplicated: {phrase}")
        if not isinstance(description, str) or not description or description != description.strip():
            raise RuntimeError(f"Prepared alignment override {index} has an invalid description")
        if not isinstance(examples, list) or len(examples) != 2 or not all(
            isinstance(example, str) and example and example == example.strip()
            for example in examples
        ) or examples[0] == examples[1]:
            raise RuntimeError(f"Prepared alignment override {index} must have two examples")
        candidate = candidates_by_phrase.get(phrase)
        if candidate is None:
            raise RuntimeError(f"Prepared alignment override phrase is missing: {phrase}")
        if description not in candidate["descriptions"] or not all(
            example in candidate["examples"] for example in examples
        ):
            raise RuntimeError(f"Prepared alignment override is stale: {phrase}")
        seen_overrides.add(phrase)
        alignment_overrides.append(
            {
                "phrase": phrase,
                "englishDescription": description,
                "examples": cast(list[str], examples),
            }
        )

    raw_gloss_overrides = value.get("sameAsGlossOverrides")
    if not isinstance(raw_gloss_overrides, list):
        raise RuntimeError("Prepared sameAsGlossOverrides must be a list")
    same_as_gloss_overrides: list[SameAsGlossOverride] = []
    seen_gloss_overrides: set[str] = set()
    for index, raw_override in enumerate(raw_gloss_overrides):
        if not isinstance(raw_override, dict) or set(raw_override) != {
            "phrase",
            "englishDescription",
            "meaningKo",
        }:
            raise RuntimeError(f"Prepared same-as gloss override {index} has invalid fields")
        phrase = raw_override.get("phrase")
        description = raw_override.get("englishDescription")
        meaning = raw_override.get("meaningKo")
        if not isinstance(phrase, str) or re.fullmatch(r"[a-z]+ [a-z]+", phrase) is None:
            raise RuntimeError(f"Prepared same-as gloss override {index} has an invalid phrase")
        if phrase in seen_gloss_overrides:
            raise RuntimeError(f"Prepared same-as gloss override is duplicated: {phrase}")
        if (
            not isinstance(description, str)
            or re.fullmatch(r"same as .+", description) is None
        ):
            raise RuntimeError(
                f"Prepared same-as gloss override {index} has an invalid description"
            )
        if (
            not isinstance(meaning, str)
            or meaning != meaning.strip()
            or not any("가" <= char <= "힣" for char in meaning)
        ):
            raise RuntimeError(
                f"Prepared same-as gloss override {index} has an invalid Korean meaning"
            )
        candidate = candidates_by_phrase.get(phrase)
        if candidate is None or description not in candidate["descriptions"]:
            raise RuntimeError(f"Prepared same-as gloss override is stale: {phrase}")
        seen_gloss_overrides.add(phrase)
        same_as_gloss_overrides.append(
            {
                "phrase": phrase,
                "englishDescription": description,
                "meaningKo": meaning,
            }
        )

    return {
        "schemaVersion": PREPARED_INPUT_SCHEMA_VERSION,
        "alignmentModel": dict(PINNED_ALIGNMENT_MODEL),
        "translationModel": dict(PINNED_TRANSLATION_MODEL),
        "targetCount": PREPARED_TARGET_COUNT,
        "requiredPhrases": list(REQUIRED_PHRASAL_PHRASES),
        "alignmentOverrides": alignment_overrides,
        "sameAsGlossOverrides": same_as_gloss_overrides,
        "phrases": candidates,
    }


def embed_texts(texts: list[str], model_info: dict[str, str]) -> dict[str, torch.Tensor]:
    model_path = local_alignment_model(model_info)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModel.from_pretrained(model_path, use_safetensors=True)
    model.eval()
    vectors: dict[str, torch.Tensor] = {}
    batch_size = 128
    with torch.no_grad():
        for offset in range(0, len(texts), batch_size):
            batch = texts[offset : offset + batch_size]
            encoded = tokenizer(
                batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=128,
            )
            hidden = model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).expand(hidden.size()).float()
            pooled = (hidden * mask).sum(1) / torch.clamp(mask.sum(1), min=1e-9)
            pooled = functional.normalize(pooled, p=2, dim=1).cpu()
            vectors.update(zip(batch, pooled, strict=True))
            print(f"Embedded {min(offset + batch_size, len(texts))}/{len(texts)}", flush=True)
    return vectors


def ranked_alignments(
    item: dict[str, object],
    vectors: dict[str, torch.Tensor],
    allow_below_example_threshold: bool = False,
    allow_below_pair_threshold: bool = False,
) -> list[tuple[float, int, int, int, float, float, float]]:
    phrase = str(item["phrase"])
    descriptions = [str(value) for value in item["descriptions"]]
    examples = [str(value) for value in item["examples"]]
    ranked: list[tuple[float, int, int, int, float, float, float]] = []
    for description_index, description in enumerate(descriptions):
        description_vector = vectors[description]
        for left_index, right_index in itertools.combinations(range(len(examples)), 2):
            left = examples[left_index]
            right = examples[right_index]
            left_vector = vectors[left]
            right_vector = vectors[right]
            left_similarity = float(torch.dot(description_vector, left_vector))
            right_similarity = float(torch.dot(description_vector, right_vector))
            if (
                not allow_below_example_threshold
                and min(left_similarity, right_similarity) < MINIMUM_EXAMPLE_SIMILARITY
            ):
                continue
            pair_similarity = float(torch.dot(left_vector, right_vector))
            if (
                not allow_below_pair_threshold
                and pair_similarity < MINIMUM_PAIR_SIMILARITY
            ):
                continue
            description_similarity = (left_similarity + right_similarity) / 2
            score = (
                0.20 * description_similarity
                + 0.65 * pair_similarity
                + 0.15 * min(left_similarity, right_similarity)
            )
            ranked.append(
                (
                    score,
                    description_index,
                    left_index,
                    right_index,
                    left_similarity,
                    right_similarity,
                    pair_similarity,
                )
            )
    return sorted(ranked, key=lambda value: (-value[0], value[1], value[2], value[3]))


def select_aligned_phrases(
    phrases: list[dict[str, object]],
    vectors: dict[str, torch.Tensor],
    target_count: int,
    required_phrases: list[str],
    alignment_overrides: list[AlignmentOverride],
) -> list[dict[str, object]]:
    if len(set(required_phrases)) != len(required_phrases):
        raise RuntimeError("Required phrasal phrases must be unique")
    phrases_by_name = {str(item["phrase"]): item for item in phrases}
    missing_required = [phrase for phrase in required_phrases if phrase not in phrases_by_name]
    if missing_required:
        raise RuntimeError(
            f"Required phrasal phrases are missing from prepared input: {', '.join(missing_required)}"
        )
    overrides_by_name = {item["phrase"]: item for item in alignment_overrides}
    reserved_names = [
        *required_phrases,
        *(phrase for phrase in overrides_by_name if phrase not in required_phrases),
    ]
    required_set = set(reserved_names)
    ordered_phrases = [phrases_by_name[phrase] for phrase in reserved_names]
    ordered_phrases.extend(
        item for item in phrases if str(item["phrase"]) not in required_set
    )
    selected: list[dict[str, object]] = []
    used_examples: set[str] = set()
    for item in ordered_phrases:
        phrase = str(item["phrase"])
        descriptions = [str(value) for value in item["descriptions"]]
        examples = [str(value) for value in item["examples"]]
        override = overrides_by_name.get(phrase)
        ranked = ranked_alignments(
            item,
            vectors,
            allow_below_example_threshold=override is not None,
            allow_below_pair_threshold=override is not None,
        )
        if override is not None:
            description_index = descriptions.index(override["englishDescription"])
            override_indexes = [examples.index(example) for example in override["examples"]]
            chosen_alignment = next(
                (
                    alignment
                    for alignment in ranked
                    if alignment[1] == description_index
                    and {alignment[2], alignment[3]} == set(override_indexes)
                ),
                None,
            )
            if chosen_alignment is None:
                raise RuntimeError(f"Pinned alignment override is unavailable: {phrase}")
            candidate_alignments = [chosen_alignment]
        else:
            candidate_alignments = ranked

        for (
            score,
            description_index,
            left_index,
            right_index,
            left_similarity,
            right_similarity,
            pair_similarity,
        ) in candidate_alignments:
            if override is None and score < ALIGNMENT_THRESHOLD:
                break
            chosen_examples = [examples[left_index], examples[right_index]] if override is None else [
                *override["examples"],
            ]
            similarity_by_example = {
                examples[left_index]: left_similarity,
                examples[right_index]: right_similarity,
            }
            if any(example in used_examples for example in chosen_examples):
                continue
            used_examples.update(chosen_examples)
            selected.append(
                {
                    "phrase": phrase,
                    "englishDescription": descriptions[description_index],
                    "examples": chosen_examples,
                    "alignmentScore": round(score, 6),
                    "exampleSimilarityScores": [
                        round(similarity_by_example[example], 6)
                        for example in chosen_examples
                    ],
                    "pairSimilarityScore": round(pair_similarity, 6),
                    "alignmentStatus": "machine-semantic-match",
                    "selectionMethod": (
                        "pinned-source-sense-override"
                        if override is not None
                        else "machine-semantic-ranking"
                    ),
                }
            )
            break
        if len(selected) == target_count:
            break
    if len(selected) != target_count:
        raise RuntimeError(
            f"Expected {target_count} aligned phrases; found {len(selected)} "
            f"at threshold {ALIGNMENT_THRESHOLD}"
        )
    selected_phrases = {str(item["phrase"]) for item in selected}
    omitted_required = [phrase for phrase in required_phrases if phrase not in selected_phrases]
    if omitted_required:
        raise RuntimeError(
            "Required phrasal phrases did not pass semantic alignment and unique-example "
            f"constraints: {', '.join(omitted_required)}"
        )
    omitted_overrides = [phrase for phrase in overrides_by_name if phrase not in selected_phrases]
    if omitted_overrides:
        raise RuntimeError(
            "Pinned alignment overrides were not selected: "
            f"{', '.join(omitted_overrides)}"
        )
    return selected


def translate_descriptions(
    selected: list[dict[str, object]],
    model_info: dict[str, str],
    same_as_gloss_overrides: list[SameAsGlossOverride],
) -> None:
    overrides = {
        (override["phrase"], override["englishDescription"]): override["meaningKo"]
        for override in same_as_gloss_overrides
    }
    pending: list[dict[str, object]] = []
    missing_cross_references: list[str] = []
    for item in selected:
        key = (str(item["phrase"]), str(item["englishDescription"]))
        meaning = overrides.get(key)
        if meaning is not None:
            item["meaningKo"] = meaning
            item["translationStatus"] = "machine-assisted-gloss-override"
        else:
            if str(item["englishDescription"]).startswith("same as "):
                missing_cross_references.append(str(item["phrase"]))
            else:
                pending.append(item)
    if missing_cross_references:
        raise RuntimeError(
            "Selected cross-reference gloss lacks an exact machine-assisted Korean "
            f"override: {', '.join(missing_cross_references)}"
        )
    if not pending:
        return

    model_path = local_translation_model(model_info)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_path, use_safetensors=True)
    model.eval()
    batch_size = 64
    for offset in range(0, len(pending), batch_size):
        batch = pending[offset : offset + batch_size]
        encoded = tokenizer(
            [str(item["englishDescription"]) for item in batch],
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=160,
        )
        with torch.no_grad():
            generated = model.generate(**encoded, max_new_tokens=64, num_beams=1)
        translations = tokenizer.batch_decode(generated, skip_special_tokens=True)
        for item, translation in zip(batch, translations, strict=True):
            meaning = " ".join(translation.split()).strip(" .")
            if not any("가" <= char <= "힣" for char in meaning):
                raise RuntimeError(f"Translation lacks Hangul for {item['phrase']}: {meaning}")
            item["meaningKo"] = meaning
            item["translationStatus"] = "machine-translated"
        print(f"Translated {min(offset + batch_size, len(pending))}/{len(pending)}", flush=True)


def write_json_atomically(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main() -> None:
    payload = validate_prepared_input(json.loads(INPUT.read_text(encoding="utf-8")))
    runtime_versions = verified_runtime_versions()
    phrases = payload["phrases"]
    required_phrases = payload["requiredPhrases"]
    unique_texts = sorted(
        {
            str(text)
            for item in phrases
            for field in ("descriptions", "examples")
            for text in item[field]
        }
    )
    vectors = embed_texts(unique_texts, payload["alignmentModel"])
    selected = select_aligned_phrases(
        phrases,
        vectors,
        payload["targetCount"],
        required_phrases,
        payload["alignmentOverrides"],
    )
    translate_descriptions(
        selected,
        payload["translationModel"],
        payload["sameAsGlossOverrides"],
    )

    applied_gloss_overrides = sum(
        item.get("translationStatus") == "machine-assisted-gloss-override"
        for item in selected
    )

    output = {
        "schemaVersion": "4.0.0",
        "model": payload["translationModel"],
        "alignmentModel": payload["alignmentModel"],
        "generator": {
            **runtime_versions,
            "alignment": "mean-pooled-cosine-pair-v4",
            "alignmentThreshold": str(ALIGNMENT_THRESHOLD),
            "minimumExampleSimilarity": str(MINIMUM_EXAMPLE_SIMILARITY),
            "minimumPairSimilarity": str(MINIMUM_PAIR_SIMILARITY),
            "alignmentOverrides": str(len(payload["alignmentOverrides"])),
            "sameAsGlossOverridesPrepared": str(len(payload["sameAsGlossOverrides"])),
            "sameAsGlossOverridesApplied": str(applied_gloss_overrides),
            "requiredPhrases": ",".join(required_phrases),
            "translationDecoding": "greedy",
        },
        "reviewStatus": "machine-translated-and-assisted-semantically-aligned-draft",
        "glosses": selected,
    }
    write_json_atomically(OUTPUT, output)


if __name__ == "__main__":
    main()
