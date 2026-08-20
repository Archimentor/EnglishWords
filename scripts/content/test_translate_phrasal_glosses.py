import json
import platform
import tempfile
import unittest
from importlib.metadata import version as distribution_version
from pathlib import Path
from unittest.mock import patch

from scripts.content import translate_phrasal_glosses as subject


def alpha_suffix(value: int) -> str:
    letters: list[str] = []
    current = value
    while True:
        letters.append(chr(ord("a") + current % 26))
        current = current // 26 - 1
        if current < 0:
            return "".join(reversed(letters))


def valid_prepared_input() -> dict[str, object]:
    candidates: list[dict[str, object]] = [
        {
            "phrase": "wake up",
            "verbForms": ["wake", "wakes", "woke", "waking", "woken"],
            "descriptions": ["to stop sleeping"],
            "examples": ["Please wake up before class.", "I wake up early every day."],
        }
    ]
    for index in range(subject.PREPARED_CANDIDATE_COUNT - 1):
        phrase = f"verb{alpha_suffix(index)} up"
        candidates.append(
            {
                "phrase": phrase,
                "verbForms": [f"verb{alpha_suffix(index)}"],
                "descriptions": [f"to perform {phrase}"],
                "examples": [
                    f"Please {phrase} before class.",
                    f"They {phrase} together after lunch.",
                ],
            }
        )
    return {
        "schemaVersion": subject.PREPARED_INPUT_SCHEMA_VERSION,
        "alignmentModel": dict(subject.PINNED_ALIGNMENT_MODEL),
        "translationModel": dict(subject.PINNED_TRANSLATION_MODEL),
        "targetCount": subject.PREPARED_TARGET_COUNT,
        "requiredPhrases": list(subject.REQUIRED_PHRASAL_PHRASES),
        "alignmentOverrides": [],
        "sameAsGlossOverrides": [],
        "phrases": candidates,
    }


class RuntimeVersionProvenanceTest(unittest.TestCase):
    def test_default_output_is_cache_only_and_cannot_replace_release_registry(self) -> None:
        self.assertEqual(
            subject.OUTPUT,
            subject.ROOT / ".content-cache" / "phrasal-gloss-candidates.json",
        )

    def test_requirements_define_every_recorded_runtime_package(self) -> None:
        self.assertEqual(
            subject.expected_runtime_versions(),
            {
                "python": "3.12",
                "torch": "2.4.1",
                "transformers": "4.44.2",
                "sentencepiece": "0.2.1",
                "huggingface-hub": "0.24.7",
                "safetensors": "0.4.5",
            },
        )

    def test_records_the_installed_runtime_after_validating_pins(self) -> None:
        actual = subject.verified_runtime_versions()

        self.assertEqual(actual["python"], platform.python_version())
        self.assertEqual(actual["torch"], str(subject.torch.__version__))
        for package_name in subject.RUNTIME_DISTRIBUTIONS:
            if package_name != "torch":
                self.assertEqual(actual[package_name], distribution_version(package_name))

    def test_rejects_a_runtime_that_does_not_match_the_expected_versions(self) -> None:
        expected = subject.expected_runtime_versions()
        actual = {
            "python": "3.12.10",
            "torch": "2.4.1+cpu",
            "transformers": "0.0.0",
            "sentencepiece": "0.2.1",
            "huggingface-hub": "0.24.7",
            "safetensors": "0.4.5",
        }

        with self.assertRaisesRegex(RuntimeError, "transformers is 0.0.0"):
            subject.validate_runtime_versions(actual, expected)


class PreparedInputContractTest(unittest.TestCase):
    def test_accepts_the_complete_prepared_input_contract(self) -> None:
        payload = valid_prepared_input()

        validated = subject.validate_prepared_input(payload)

        self.assertEqual(validated, payload)

    def test_rejects_wrong_schema_models_and_target_count(self) -> None:
        cases = {
            "schemaVersion": ("schemaVersion", "1.0.0", "schemaVersion"),
            "alignment model": (
                "alignmentModel",
                {**subject.PINNED_ALIGNMENT_MODEL, "revision": "tampered"},
                "pinned alignment model",
            ),
            "translation model": (
                "translationModel",
                {**subject.PINNED_TRANSLATION_MODEL, "revision": "tampered"},
                "pinned translation model",
            ),
            "targetCount": ("targetCount", 999, "targetCount"),
        }
        for name, (field, value, message) in cases.items():
            with self.subTest(name=name):
                payload = valid_prepared_input()
                payload[field] = value
                with self.assertRaisesRegex(RuntimeError, message):
                    subject.validate_prepared_input(payload)

    def test_rejects_invalid_candidate_count_shape_and_uniqueness(self) -> None:
        too_few = valid_prepared_input()
        phrases = too_few["phrases"]
        assert isinstance(phrases, list)
        phrases.pop()
        with self.assertRaisesRegex(RuntimeError, "exactly 1083 candidates"):
            subject.validate_prepared_input(too_few)

        invalid_shape = valid_prepared_input()
        phrases = invalid_shape["phrases"]
        assert isinstance(phrases, list) and isinstance(phrases[0], dict)
        phrases[0]["examples"] = ["Please wake up before class."]
        with self.assertRaisesRegex(RuntimeError, "at least 2 strings"):
            subject.validate_prepared_input(invalid_shape)

        duplicate = valid_prepared_input()
        phrases = duplicate["phrases"]
        assert isinstance(phrases, list) and isinstance(phrases[1], dict)
        phrases[1]["phrase"] = "wake up"
        with self.assertRaisesRegex(RuntimeError, "duplicated: wake up"):
            subject.validate_prepared_input(duplicate)

    def test_rejects_invalid_unpinned_or_missing_required_phrases(self) -> None:
        invalid = valid_prepared_input()
        invalid["requiredPhrases"] = ["Wake up"]
        with self.assertRaisesRegex(RuntimeError, "two lowercase words"):
            subject.validate_prepared_input(invalid)

        unpinned = valid_prepared_input()
        unpinned["requiredPhrases"] = []
        with self.assertRaisesRegex(RuntimeError, "pinned required phrases"):
            subject.validate_prepared_input(unpinned)

        missing = valid_prepared_input()
        phrases = missing["phrases"]
        assert isinstance(phrases, list) and isinstance(phrases[0], dict)
        phrases[0] = {
            "phrase": "replacement up",
            "verbForms": ["replacement"],
            "descriptions": ["to replace something"],
            "examples": [
                "Please replacement up before class.",
                "They replacement up together after lunch.",
            ],
        }
        with self.assertRaisesRegex(RuntimeError, "missing from candidates: wake up"):
            subject.validate_prepared_input(missing)

    def test_validates_alignment_overrides_against_exact_candidate_strings(self) -> None:
        payload = valid_prepared_input()
        payload["alignmentOverrides"] = [
            {
                "phrase": "wake up",
                "englishDescription": "to stop sleeping",
                "examples": [
                    "Please wake up before class.",
                    "I wake up early every day.",
                ],
            }
        ]
        self.assertEqual(
            subject.validate_prepared_input(payload)["alignmentOverrides"],
            payload["alignmentOverrides"],
        )

        payload["alignmentOverrides"][0]["englishDescription"] = "a stale sense"
        with self.assertRaisesRegex(RuntimeError, "override is stale: wake up"):
            subject.validate_prepared_input(payload)

    def test_validates_same_as_gloss_overrides_against_exact_candidate_strings(self) -> None:
        payload = valid_prepared_input()
        phrases = payload["phrases"]
        assert isinstance(phrases, list) and isinstance(phrases[0], dict)
        phrases[0]["descriptions"] = ["same as wake"]
        payload["sameAsGlossOverrides"] = [
            {
                "phrase": "wake up",
                "englishDescription": "same as wake",
                "meaningKo": "잠에서 깨다",
            }
        ]

        self.assertEqual(
            subject.validate_prepared_input(payload)["sameAsGlossOverrides"],
            payload["sameAsGlossOverrides"],
        )

        payload["sameAsGlossOverrides"][0]["meaningKo"] = "wake"
        with self.assertRaisesRegex(RuntimeError, "invalid Korean meaning"):
            subject.validate_prepared_input(payload)

    def test_invalid_input_preserves_the_existing_manifest_and_skips_models(self) -> None:
        payload = valid_prepared_input()
        payload["targetCount"] = 999

        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "manifest.json"
            input_path.write_text(json.dumps(payload), encoding="utf-8")
            output_path.write_text("existing valid manifest", encoding="utf-8")

            with (
                patch.object(subject, "INPUT", input_path),
                patch.object(subject, "OUTPUT", output_path),
                patch.object(subject, "embed_texts") as embed,
                patch.object(subject, "translate_descriptions") as translate,
            ):
                with self.assertRaisesRegex(RuntimeError, "targetCount"):
                    subject.main()

            embed.assert_not_called()
            translate.assert_not_called()
            self.assertEqual(
                output_path.read_text(encoding="utf-8"),
                "existing valid manifest",
            )


class SemanticAlignmentTest(unittest.TestCase):
    def test_requires_each_example_to_match_the_selected_description(self) -> None:
        item = {
            "phrase": "wake up",
            "descriptions": ["to stop sleeping"],
            "examples": ["Please wake up now.", "I wake up before school."],
        }
        vectors = {
            "to stop sleeping": subject.torch.tensor([1.0, 0.0]),
            "Please wake up now.": subject.torch.tensor([1.0, 0.0]),
            "I wake up before school.": subject.torch.tensor([0.0, 1.0]),
        }

        self.assertEqual(subject.ranked_alignments(item, vectors), [])

        vectors["I wake up before school."] = subject.torch.tensor([0.1, 0.994987])
        ranked = subject.ranked_alignments(item, vectors)
        self.assertEqual(len(ranked), 1)
        self.assertGreaterEqual(ranked[0][4], subject.MINIMUM_EXAMPLE_SIMILARITY)
        self.assertGreaterEqual(ranked[0][5], subject.MINIMUM_EXAMPLE_SIMILARITY)
        self.assertGreaterEqual(ranked[0][6], subject.MINIMUM_PAIR_SIMILARITY)

    def test_exact_pinned_source_sense_bypasses_model_score_floors_only_for_override(self) -> None:
        item = {
            "phrase": "wake up",
            "descriptions": ["to stop sleeping"],
            "examples": ["Please wake up now.", "I wake up before school."],
        }
        vectors = {
            "to stop sleeping": subject.torch.tensor([1.0, 0.0]),
            "Please wake up now.": subject.torch.tensor([0.0, 1.0]),
            "I wake up before school.": subject.torch.tensor([0.0, -1.0]),
        }
        override = {
            "phrase": "wake up",
            "englishDescription": "to stop sleeping",
            "examples": ["Please wake up now.", "I wake up before school."],
        }

        self.assertEqual(subject.ranked_alignments(item, vectors), [])
        selected = subject.select_aligned_phrases(
            [item],
            vectors,
            1,
            ["wake up"],
            [override],
        )

        self.assertEqual(selected[0]["selectionMethod"], "pinned-source-sense-override")
        self.assertLess(selected[0]["alignmentScore"], subject.ALIGNMENT_THRESHOLD)
        self.assertLess(selected[0]["pairSimilarityScore"], subject.MINIMUM_PAIR_SIMILARITY)

    def test_cross_reference_translation_requires_an_exact_assisted_gloss(self) -> None:
        selected: list[dict[str, object]] = [
            {
                "phrase": "wake up",
                "englishDescription": "same as wake",
            }
        ]
        with self.assertRaisesRegex(RuntimeError, "lacks an exact"):
            subject.translate_descriptions(selected, subject.PINNED_TRANSLATION_MODEL, [])

        subject.translate_descriptions(
            selected,
            subject.PINNED_TRANSLATION_MODEL,
            [
                {
                    "phrase": "wake up",
                    "englishDescription": "same as wake",
                    "meaningKo": "잠에서 깨다",
                }
            ],
        )
        self.assertEqual(selected[0]["meaningKo"], "잠에서 깨다")
        self.assertEqual(
            selected[0]["translationStatus"],
            "machine-assisted-gloss-override",
        )


if __name__ == "__main__":
    unittest.main()
