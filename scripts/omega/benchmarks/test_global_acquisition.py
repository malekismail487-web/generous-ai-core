"""Development-only acquisition safety checks; contains no benchmark problems."""
import io
import runpy
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path

UTIL = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))


class AcquisitionTests(unittest.TestCase):
    def response(self, chunks, headers, status=200):
        class Response:
            status_code = status
            def iter_content(self, _size):
                yield from chunks
        result = Response()
        result.headers = headers
        return result

    def test_plain_transport_length_mismatch_not_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            response = self.response([b"ab"], {"Content-Length": "3"})
            with patch("requests.get", return_value=response), self.assertRaisesRegex(ValueError, "download_length_mismatch"):
                UTIL["download_url"]("https://example.org/asset", target)
            self.assertFalse(target.exists())

    def test_http_decoded_length_distinguished_from_wire_length(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            response = self.response([b"decoded"], {"Content-Length": "3", "Content-Encoding": "gzip"})
            with patch("requests.get", return_value=response):
                result = UTIL["download_url"]("https://example.org/asset", target)
            self.assertEqual(result["bytes"], 7)
            self.assertEqual(result["transportEncoding"], "gzip")

    def test_resume_range_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            target.with_name("asset.bin.partial").write_bytes(b"abc")
            response = self.response([b"def"], {"Content-Length": "3", "Content-Range": "bytes 3-5/6"}, 206)
            with patch("requests.get", return_value=response):
                result = UTIL["download_url"]("https://example.org/asset", target)
            self.assertEqual(target.read_bytes(), b"abcdef")
            self.assertEqual(result["bytes"], 6)

    def test_bad_resume_and_digest_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            target.with_name("asset.bin.partial").write_bytes(b"abc")
            response = self.response([b"def"], {"Content-Range": "bytes 0-2/6"}, 206)
            with patch("requests.get", return_value=response), self.assertRaisesRegex(ValueError, "download_resume_range_mismatch"):
                UTIL["download_url"]("https://example.org/asset", target)
            self.assertFalse(target.exists())

    def test_paths_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            for bad in ["../escape", "/absolute", "C:/drive", "a\\b", "a/../../b",
                        "NUL.txt", "aux", "COM1/file", "a.", "a ", "a:x", "a?b"]:
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    UTIL["target_path"](Path(directory), bad)

    def test_incomplete_range_not_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            partial = target.with_name("asset.bin.partial")
            partial.write_bytes(b"abc")
            response = self.response([b"def"], {"Content-Length": "3", "Content-Range": "bytes 3-5/9"}, 206)
            with patch("requests.get", return_value=response), self.assertRaisesRegex(ValueError, "download_incomplete_range"):
                UTIL["download_url"]("https://example.org/asset", target)
            self.assertFalse(target.exists())
            self.assertEqual(partial.read_bytes(), b"abc")

    def test_short_range_without_content_length_not_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            target.with_name("asset.bin.partial").write_bytes(b"abc")
            response = self.response([b"de"], {"Content-Range": "bytes 3-5/6"}, 206)
            with patch("requests.get", return_value=response), self.assertRaisesRegex(ValueError, "download_range_length_mismatch"):
                UTIL["download_url"]("https://example.org/asset", target)
            self.assertFalse(target.exists())

    def test_digest_mismatch_not_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "asset.bin"
            response = self.response([b"abc"], {"Content-Length": "3"})
            with patch("requests.get", return_value=response), self.assertRaisesRegex(ValueError, "download_sha256_mismatch"):
                UTIL["download_url"]("https://example.org/asset", target, expected_sha256="0" * 64)
            self.assertFalse(target.exists())
            self.assertEqual(target.with_name("asset.bin.partial").read_bytes(), b"abc")

    def test_safe_nested_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(UTIL["target_path"](root, "data/dev.jsonl"), root / "data" / "dev.jsonl")

    def make_zip(self, root, entries):
        archive = root / "fixture.zip"
        with zipfile.ZipFile(archive, "w") as output:
            for name, data in entries:
                output.writestr(name, data)
        return archive

    def test_extract_and_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.make_zip(root, [("data/", b""), ("data/input.txt", b"development")])
            first = UTIL["extract_zip"](archive, root / "output")
            self.assertEqual(first, UTIL["extract_zip"](archive, root / "output"))
            self.assertEqual(len(first), 1)
            self.assertEqual(first[0]["bytes"], 11)

    def test_existing_mismatch_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.make_zip(root, [("input.txt", b"good")])
            dest = root / "output"
            dest.mkdir()
            (dest / "input.txt").write_bytes(b"user")
            with self.assertRaisesRegex(ValueError, "existing_extraction_mismatch"):
                UTIL["extract_zip"](archive, dest)
            self.assertEqual((dest / "input.txt").read_bytes(), b"user")

    def test_zip_traversal_duplicate_and_size(self):
        for entries, limit in [([("../escape", b"bad")], 100),
                               ([("A", b"one"), ("a", b"two")], 100),
                               ([("large", b"0123456789")], 5)]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = self.make_zip(root, entries)
                with self.assertRaises(ValueError):
                    UTIL["extract_zip"](archive, root / "output", max_bytes=limit)
                self.assertFalse((root / "escape").exists())

    def test_zip_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "link.zip"
            with zipfile.ZipFile(archive, "w") as output:
                item = zipfile.ZipInfo("link")
                item.create_system = 3
                item.external_attr = 0o120777 << 16
                output.writestr(item, "../../escape")
            with self.assertRaisesRegex(ValueError, "archive_symlink_rejected"):
                UTIL["extract_zip"](archive, root / "output")

    def test_internal_alias_materialized_without_host_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "link.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("repo/README.md", b"development")
                item = zipfile.ZipInfo("repo/docs/README.md")
                item.create_system = 3
                item.external_attr = 0o120777 << 16
                output.writestr(item, "../README.md")
            rows = UTIL["extract_zip"](archive, root / "output", materialize_internal_aliases=True)
            self.assertEqual((root / "output/repo/docs/README.md").read_bytes(), b"development")
            self.assertFalse((root / "output/repo/docs/README.md").is_symlink())
            self.assertEqual(rows[1]["materializedInternalAliasOf"], "repo/README.md")

    def test_materialized_alias_cannot_escape_or_cycle(self):
        for target in ("../../escape", "../link"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / "link.zip"
                with zipfile.ZipFile(archive, "w") as output:
                    item = zipfile.ZipInfo("repo/link")
                    item.create_system = 3
                    item.external_attr = 0o120777 << 16
                    output.writestr(item, target)
                with self.assertRaises(ValueError):
                    UTIL["extract_zip"](archive, root / "output", materialize_internal_aliases=True)


if __name__ == "__main__":
    unittest.main()
