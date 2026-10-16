"""Prepare the authorized SAB verified archive without exposing its password.

The author-published archive passphrase is read in memory from the pinned README;
it is never a command-line argument or receipt field. No benchmark program runs.
The resulting protected reference material must never be mounted into NYX.
"""
import argparse
import json
import re
import runpy
import zipfile
import hashlib
import stat
import subprocess
import zlib
from pathlib import Path


def prepare(root, native_extractor=None):
    util = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))
    source = next((root / "prepared-sources").glob("OSU-NLP-Group--ScienceAgentBench-*"))
    readme = next(source.rglob("README.md")).read_text(encoding="utf-8")
    tick = chr(96)
    match = re.search("password " + tick + "([^" + tick + "]+)" + tick, readme)
    if not match:
        raise ValueError("published_archive_passphrase_not_located")
    password = match.group(1).encode()
    archive = root / "scienceagent-assets" / "benchmark_verified.zip"
    with zipfile.ZipFile(archive) as zipped:
        count = len(zipped.infolist())
        expanded = sum(item.file_size for item in zipped.infolist())
    destination = root / "scienceagent-assets" / "extracted"
    if native_extractor:
        # Speed up legacy ZipCrypto using the official portable 7-Zip binary.
        # The passphrase goes through stdin, never argv, logs, or a shell.
        with zipfile.ZipFile(archive) as zipped:
            items = zipped.infolist()
        if expanded > 16 * 1024**3:
            raise ValueError("archive_expansion_limit")
        expected_paths = set()
        for item in items:
            path = util["target_path"](destination, item.filename.rstrip("/"))
            if str(path).casefold() in expected_paths or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError("unsafe_native_extraction_member")
            expected_paths.add(str(path).casefold())
        # Only this task's validated archive targets may be overwritten. Existing
        # partial extraction files are reconstructible from the preserved ZIP.
        if destination.exists():
            for path in destination.rglob("*"):
                if path.is_symlink() or path.is_junction() or str(path).casefold() not in expected_paths:
                    raise ValueError("unexpected_existing_extraction_target")
        result = subprocess.run([str(native_extractor), "x", str(archive), "-o" + str(destination),
                                 "-y", "-aoa"], input=password.decode() + "\n",
                                capture_output=True, text=True, timeout=300)
        if result.returncode:
            raise ValueError("native_archive_extraction_failed")
        files = []
        for item in items:
            if item.is_dir():
                continue
            path = util["target_path"](destination, item.filename)
            sha, crc = hashlib.sha256(), 0
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    sha.update(chunk)
                    crc = zlib.crc32(chunk, crc)
            if path.stat().st_size != item.file_size or crc != item.CRC:
                raise ValueError("native_extraction_independent_integrity_failure")
            files.append({"path": item.filename, "bytes": item.file_size, "sha256": sha.hexdigest()})
    else:
        files = util["extract_zip"](archive, destination, max_bytes=16 * 1024**3, password=password)
    util["save"](root / "scienceagent-assets" / "protected-extraction-manifest.json", files)
    import pyarrow.parquet as pq
    population = next((root / "public-datasets" / "osunlp--ScienceAgentBench").rglob("verified-00000-of-00001.parquet"))
    rows = pq.read_table(population).to_pylist()
    base = root / "scienceagent-assets" / "extracted" / "benchmark"
    missing = {"gold_program_name": 0, "eval_script_name": 0}
    for row in rows:
        for key, folder in [("gold_program_name", "gold_programs"), ("eval_script_name", "eval_programs")]:
            name = row[key]
            if not (base / folder / name).is_file():
                missing[key] += 1
    report = {"identity": "SCIENCEAGENTBENCH-VERIFIED-ARCHIVE-PREPARATION-001",
              "archive": util["record"](archive, root), "archiveEntries": count,
              "expandedBytes": expanded, "crcAndDecryptionVerifiedFiles": len(files),
              "verifiedSplitRows": len(rows), "missingReferences": missing,
              "passphrasePrinted": False, "benchmarkProgramsExecuted": False,
              "protectedFilesRedistributed": False,
              "executionRuntime": "REQUIRES_APPROVED_LINUX_DOCKER_ENVIRONMENT"}
    util["save"](root / "scienceagent-assets" / "verified-preparation-receipt.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--native-extractor", type=Path)
    args = parser.parse_args()
    prepare(args.root, args.native_extractor)
