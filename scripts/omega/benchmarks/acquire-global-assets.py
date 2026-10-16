"""Acquisition-only utilities. Never imports benchmark code or invokes a model.

Files and receipts live outside Git and the NYX task namespace. Hugging Face
requests are anonymous unless the operator explicitly configures a later run.
The default deliberately does not inspect arbitrary credential stores.
"""
import argparse
import hashlib
import json
import os
import re
import stat
import sys
import time
import zipfile
from pathlib import Path, PurePosixPath


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def target_path(root, name):
    parts = PurePosixPath(name).parts
    if not parts or "\\" in name or PurePosixPath(name).is_absolute():
        raise ValueError("unsafe_asset_path")
    if any(p in (".", "..") or re.search(r'[<>:"|?*\x00-\x1f]', p)
           or p.endswith((" ", "."))
           or re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)", p, re.I)
           for p in parts):
        raise ValueError("unsafe_asset_path")
    root = Path(root).absolute()
    result = root.joinpath(*parts)
    if not result.is_relative_to(root):
        raise ValueError("asset_outside_cache")
    current = result
    while current != root.parent:
        if current.exists() and (current.is_symlink() or os.path.isjunction(current)):
            raise ValueError("asset_reparse_target")
        current = current.parent
    return result


def record(path, root):
    return {"path": str(path.relative_to(root)).replace("\\", "/"),
            "bytes": path.stat().st_size, "sha256": digest(path)}


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Generated acquisition receipts contain metadata only, not examples/answers.
    with path.open("w", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2)


def hydrate_git_blobs_from_archive(repository, source):
    """Avoid thousands of promisor downloads when exact source bytes exist.

    Only fills the Git object store with content matching the existing HEAD
    tree. Never changes HEAD, refs, index, worktree files, or author history.
    """
    import subprocess
    tree = subprocess.run(["git", "-C", str(repository), "ls-tree", "-rz", "HEAD"],
                          capture_output=True, check=True, timeout=60).stdout
    paths, expected, skipped = [], [], 0
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        sha = metadata.split()[2].decode()
        path = target_path(source, name.decode())
        if not path.is_file():
            skipped += 1
            continue
        data = path.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != sha:
            skipped += 1
            continue
        paths.append(str(path).replace("\\", "/"))
        expected.append(sha)
    result = subprocess.run(["git", "-C", str(repository), "hash-object", "--no-filters", "-w", "--stdin-paths"],
                            input="\n".join('"' + p + '"' for p in paths) + "\n",
                            text=True, encoding="utf-8", capture_output=True, timeout=180)
    if result.returncode:
        return {"state": "GIT_OBJECT_HYDRATION_FAILED", "exitCode": result.returncode,
                "pathLengthFailure": "long" in result.stderr.lower(),
                "incompatibleArguments": "cannot use" in result.stderr.lower(),
                "objectsWrittenBeforeFailure": len(result.stdout.splitlines())}
    if result.stdout.splitlines() != expected:
        raise ValueError("source_cache_git_blob_mismatch")
    return {"gitBlobsRestoredFromExistingSourceArchive": len(paths),
            "nonmatchingOrAbsentArchiveEntries": skipped, "networkBytesRequiredForTheseBlobs": 0,
            "authorCommitAltered": False}


def extract_zip(archive, destination, max_bytes=4 * 1024**3, materialize_internal_aliases=False, password=None,
                retain_in_archive=()):
    destination = Path(destination).absolute()
    files = []
    reader = zipfile.ZipFile
    with reader(archive) as probe:
        if any(i.compress_type == 99 for i in probe.infolist()):
            import pyzipper
            reader = pyzipper.AESZipFile
    with reader(archive) as zipped:
        items = zipped.infolist()
        by_name = {i.filename: i for i in items}

        def resolve_item(item, visited=None):
            visited = set() if visited is None else visited
            if item.filename in visited:
                raise ValueError("archive_alias_cycle")
            visited.add(item.filename)
            if not stat.S_ISLNK(item.external_attr >> 16):
                return item
            if not materialize_internal_aliases:
                raise ValueError("archive_symlink_rejected")
            link = zipped.read(item, pwd=password).decode("utf-8")
            if link.startswith("/") or "\\" in link or ":" in link:
                raise ValueError("archive_alias_escape")
            parts = list(PurePosixPath(item.filename).parent.parts)
            for part in link.split("/"):
                if part == "..":
                    if len(parts) <= 1:
                        raise ValueError("archive_alias_escape")
                    parts.pop()
                elif part not in ("", "."):
                    parts.append(part)
            name = "/".join(parts)
            target_path(destination, name)
            if name not in by_name or by_name[name].is_dir():
                raise ValueError("archive_alias_target_missing")
            return resolve_item(by_name[name], visited)
        if sum(i.file_size for i in items) > max_bytes:
            raise ValueError("archive_expansion_limit")
        seen = set()
        for item in items:
            path = target_path(destination, item.filename.rstrip("/"))
            key = str(path).casefold()
            if key in seen:
                raise ValueError("archive_duplicate_path")
            seen.add(key)
            if item.filename in retain_in_archive:
                continue
            mode = item.external_attr >> 16
            resolve_item(item)
        for item in items:
            path = target_path(destination, item.filename.rstrip("/"))
            if item.filename in retain_in_archive:
                files.append({"path": item.filename, "state": "RETAINED_IN_VERIFIED_ARCHIVE_NOT_MATERIALIZED"})
                continue
            if item.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            original = item
            item = resolve_item(item)
            # Reading through ZipFile verifies CRC, even when reusing a file.
            h = hashlib.sha256()
            if path.exists():
                with zipped.open(item, pwd=password) as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        h.update(chunk)
                if path.stat().st_size != item.file_size or digest(path) != h.hexdigest():
                    raise ValueError("existing_extraction_mismatch")
            else:
                with zipped.open(item, pwd=password) as source, path.open("xb") as output:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        output.write(chunk)
                        h.update(chunk)
            data = {"path": str(path.relative_to(destination)).replace("\\", "/"),
                    "bytes": item.file_size, "sha256": h.hexdigest()}
            if original != item:
                data["materializedInternalAliasOf"] = item.filename
                data["hostSymlinkCreated"] = False
            files.append(data)
    return files


def download_url(url, path, max_bytes=12 * 1024**3, expected_sha256=None):
    """Retrieve a reviewed public asset; never log redirects or error bodies."""
    import requests
    from urllib.parse import urlsplit
    if urlsplit(url).scheme != "https" or urlsplit(url).username or urlsplit(url).password:
        raise ValueError("https_public_asset_required")
    path = Path(path)
    target_path(path.parent, path.name)
    if path.exists():
        sha = digest(path)
        if expected_sha256 and sha != expected_sha256:
            raise ValueError("existing_download_digest_mismatch")
        return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha,
                "state": "EXISTING_REHASHED", "source": url}
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = target_path(path.parent, path.name + ".partial")
    if partial.exists() and not partial.is_file():
        raise ValueError("partial_not_regular_file")
    start = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "NYX-benchmark-acquisition/1", "Accept-Encoding": "identity"}
    if start:
        headers["Range"] = f"bytes={start}-"
    response = requests.get(url, headers=headers, timeout=(30, 180), stream=True)
    if response.status_code not in (200, 206):
        return {"source": url, "state": f"HTTP_{response.status_code}"}
    range_end = None
    if response.status_code == 206:
        content_range = response.headers.get("Content-Range", "")
        matched = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
        if not matched or int(matched[1]) != start:
            raise ValueError("download_resume_range_mismatch")
        range_end, total = int(matched[2]), int(matched[3])
        if range_end < start or range_end + 1 != total:
            raise ValueError("download_incomplete_range")
        if total > max_bytes:
            raise ValueError("download_byte_limit")
        if response.headers.get("Content-Encoding", "identity") != "identity":
            raise ValueError("encoded_transfer_resume_unsupported")
        mode = "ab"
    else:
        start = 0
        mode = "wb"  # Only the explicitly named incomplete download is replaced.
    content_type = response.headers.get("Content-Type", "")
    if path.suffix.lower() in (".zip", ".h5", ".gz", ".zst") and "text/html" in content_type:
        return {"source": url, "state": "HTML_INSTEAD_OF_ASSET"}
    size = start
    if int(response.headers.get("Content-Length", "0")) + start > max_bytes:
        return {"source": url, "state": "DECLARED_RESOURCE_LIMIT"}
    with partial.open(mode) as output:
        for chunk in response.iter_content(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                raise ValueError("download_byte_limit")
            output.write(chunk)
    length = response.headers.get("Content-Length")
    transport_encoding = response.headers.get("Content-Encoding", "identity")
    if length is not None and transport_encoding == "identity" and size != start + int(length):
        raise ValueError("download_length_mismatch")
    if range_end is not None and size != range_end + 1:
        raise ValueError("download_range_length_mismatch")
    sha = digest(partial)
    if expected_sha256 and sha != expected_sha256:
        raise ValueError("download_sha256_mismatch")
    partial.rename(path)
    return {"path": str(path), "bytes": size, "sha256": sha,
            "state": "DOWNLOADED", "source": url,
            "lastModified": response.headers.get("Last-Modified"), "contentType": content_type,
            "transportEncoding": transport_encoding}


def hf_acquire(root, datasets, max_file_bytes, max_total_bytes, receipt_name="global-acquisition-2026-10-16.json",
               authorized_session=False, expected_revisions=None):
    from huggingface_hub import HfApi, hf_hub_download, get_token
    # An explicit operator-authorized invocation may reuse the supported login.
    # Anonymous/default runs never acquire a credential or accept gate terms.
    token = get_token() if authorized_session else False
    if authorized_session and not token:
        raise ValueError("authorized_hf_session_not_configured")
    api = HfApi(token=token)
    receipt = {"schemaVersion": 1, "identity": "NYX-GLOBAL-ASSET-ACQUISITION-001",
               "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "credentialsUsed": bool(authorized_session), "credentialValuesRecorded": False,
               "conditionsAcceptedByDownloader": False, "modelCalls": 0,
               "downloadedCodeExecuted": False, "sources": []}
    total = 0
    for dataset in datasets:
        entry = {"dataset": dataset, "files": [], "deferred": []}
        receipt["sources"].append(entry)
        try:
            expected_revision = (expected_revisions or {}).get(dataset)
            info = api.dataset_info(dataset, files_metadata=True, revision=expected_revision)
            if expected_revision and info.sha != expected_revision:
                raise ValueError("dataset_revision_mismatch")
            entry.update(revision=info.sha, gated=info.gated,
                         license=(info.card_data.to_dict() if info.card_data else {}).get("license"))
            if info.gated and not authorized_session:
                entry["state"] = "NEEDS_AUTHORIZATION"
                # A public card is useful, but no gate is accepted here.
                names = {"README.md", ".gitattributes"}
            else:
                names = {f.rfilename for f in info.siblings}
            base = root / "public-datasets" / dataset.replace("/", "--") / info.sha
            for item in info.siblings:
                if item.rfilename not in names:
                    continue
                size = item.size or 0
                if size > max_file_bytes or total + size > max_total_bytes:
                    entry["deferred"].append({"path": item.rfilename, "bytes": size,
                                              "reason": "DECLARED_RESOURCE_LIMIT"})
                    continue
                target = target_path(base, item.rfilename)
                expected = item.lfs.sha256 if item.lfs else None
                if target.exists():
                    if target.stat().st_size != size or expected and digest(target) != expected:
                        raise ValueError("existing_asset_mismatch")
                    state = "EXISTING_REHASHED"
                else:
                    hf_hub_download(dataset, item.rfilename, repo_type="dataset",
                                    revision=info.sha, local_dir=str(base), token=token)
                    state = "DOWNLOADED"
                    total += target.stat().st_size
                data = record(target, root)
                if expected and data["sha256"] != expected:
                    raise ValueError("author_sha256_mismatch")
                data.update(state=state, authorSha256Verified=bool(expected))
                entry["files"].append(data)
            entry.setdefault("state", "PARTIAL" if entry["deferred"] else
                             "AUTHORIZED_FILES_ACQUIRED" if info.gated else "PUBLIC_FILES_ACQUIRED")
        except Exception as error:
            # Do not emit exception messages: transport errors may include signed URLs.
            entry["state"] = "NEEDS_AUTHORIZATION" if entry.get("gated") or type(error).__name__ == "GatedRepoError" else "ACQUISITION_FAILED"
            entry["errorClass"] = type(error).__name__
        finally:
            save(target_path(root, receipt_name), receipt)
            print(json.dumps({"dataset": dataset, "state": entry["state"],
                              "files": len(entry["files"]), "deferred": len(entry["deferred"])}), flush=True)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--dataset", action="append", default=[])
    parser.add_argument("--max-file-gib", type=int, default=12)
    parser.add_argument("--max-total-gib", type=int, default=40)
    parser.add_argument("--receipt-name", default="global-acquisition-2026-10-16.json")
    parser.add_argument("--authorized-session", action="store_true",
                        help="Reuse an operator-authorized HF login; never accepts dataset conditions.")
    parser.add_argument("--extract-archive", type=Path)
    parser.add_argument("--extract-directory", type=Path)
    args = parser.parse_args()
    if not args.root.is_absolute() or not args.root.is_dir() or args.root.is_symlink():
        raise ValueError("absolute_existing_cache_required")
    if args.extract_archive:
        if not args.extract_directory or not args.extract_directory.absolute().is_relative_to(args.root):
            raise ValueError("extraction_must_remain_in_cache")
        records = extract_zip(args.extract_archive, args.extract_directory)
        save(args.extract_directory / "acquisition-extracted-files.json", records)
        print(json.dumps({"files": len(records), "bytes": sum(r["bytes"] for r in records)}))
    elif args.dataset:
        hf_acquire(args.root, args.dataset, args.max_file_gib * 1024**3, args.max_total_gib * 1024**3,
                   args.receipt_name, authorized_session=args.authorized_session)
