"""Synthetic adapter tests; never import benchmark questions or reference answers."""
import importlib.util
from pathlib import Path
import random
import unittest

spec = importlib.util.spec_from_file_location("text_preparer", Path(__file__).with_name("prepare-text-benchmarks.py"))
preparer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparer)


class GpqaProjectionTest(unittest.TestCase):
    def row(self):
        return {"Question": "Synthetic objective", "Correct Answer": "correct choice",
                "Incorrect Answer 1": "wrong one", "Incorrect Answer 2": "wrong two",
                "Incorrect Answer 3": "wrong three", "Explanation": "MUST_NOT_BE_MODEL_INPUT",
                "Validator metadata": "PRIVATE_METADATA"}

    def test_label_follows_author_baseline_choice_order(self):
        row = self.row()
        choices = [row[key] for key in ("Incorrect Answer 1", "Incorrect Answer 2", "Incorrect Answer 3", "Correct Answer")]
        random.Random(0).shuffle(choices)
        task = preparer.gpqa_tasks([row])[0]
        self.assertEqual(task["answer"], "ABCD"[choices.index(row["Correct Answer"])])
        for letter, choice in zip("ABCD", choices):
            self.assertIn(f"{letter}. {choice}", task["question"])

    def test_only_question_and_unlabeled_choices_reach_cognition(self):
        task = preparer.gpqa_tasks([self.row()])[0]
        self.assertEqual(set(task), {"family", "taskId", "question", "answer"})
        self.assertNotIn("MUST_NOT_BE_MODEL_INPUT", task["question"])
        self.assertNotIn("PRIVATE_METADATA", task["question"])
        self.assertNotIn("Correct Answer", task["question"])

    def test_deterministic_population_and_external_rng_independence(self):
        rows = [self.row() for _ in range(198)]
        first = preparer.gpqa_tasks(rows)
        random.seed(999)
        random.random()
        self.assertEqual(first, preparer.gpqa_tasks(rows))
        self.assertEqual(len({task["taskId"] for task in first}), 198)

    def test_official_repeated_distractors_are_preserved(self):
        row = self.row()
        row["Incorrect Answer 2"] = row["Incorrect Answer 1"]
        self.assertEqual(preparer.gpqa_tasks([row])[0]["question"].count("wrong one"), 2)

    def test_missing_or_malformed_input_fails_instead_of_guessing(self):
        for value in [None, "", "  ", 5]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "gpqa_row_invalid"):
                preparer.gpqa_tasks([{**self.row(), "Question": value}])


if __name__ == "__main__":
    unittest.main()
