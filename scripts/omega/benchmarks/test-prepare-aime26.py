"""Preparation detector tests only; never load the real benchmark population."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("aime_prepare", Path(__file__).with_name("prepare-text-benchmarks.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class AimePreparationTests(unittest.TestCase):
    def rows(self):
        return [(index, f"Artificial development record {index}", 17) for index in range(1, 31)]

    def test_complete_population_and_order(self):
        result = prepare.aime_2026_tasks(self.rows())
        self.assertEqual(len(result), 30)
        self.assertEqual([row["taskId"] for row in result], [f"AIME-2026-{i}" for i in range(1, 31)])
        self.assertTrue(all(set(row) == {"family", "taskId", "question", "answer"} for row in result))

    def test_no_truncated_or_expanded_population(self):
        for rows in [self.rows()[:-1], self.rows() + [(31, "Artificial", 17)]]:
            with self.subTest(count=len(rows)), self.assertRaises(ValueError):
                prepare.aime_2026_tasks(rows)

    def test_invalid_index_or_order(self):
        for replacement in [(1, "Artificial", 17), (True, "Artificial", 17), ("2", "Artificial", 17)]:
            rows = self.rows()
            rows[1] = replacement
            with self.subTest(kind=type(replacement[0]).__name__), self.assertRaises(ValueError):
                prepare.aime_2026_tasks(rows)
        with self.assertRaises(ValueError):
            prepare.aime_2026_tasks(list(reversed(self.rows())))

    def test_invalid_row_values(self):
        for replacement in [(1, "", 17), (1, " ", 17), (1, None, 17), (1, "Artificial", True),
                            (1, "Artificial", "17"), (1, "Artificial", -1), (1, "Artificial", 1000), (1,)]:
            rows = self.rows()
            rows[0] = replacement
            with self.subTest(kind=type(replacement[-1]).__name__), self.assertRaises(ValueError):
                prepare.aime_2026_tasks(rows)

    def test_reference_integer_boundaries(self):
        rows = self.rows()
        rows[0] = (1, "Artificial zero boundary", 0)
        rows[1] = (2, "Artificial upper boundary", 999)
        result = prepare.aime_2026_tasks(rows)
        self.assertEqual(result[0]["answer"], "0")
        self.assertEqual(result[1]["answer"], "999")


if __name__ == "__main__":
    unittest.main()
