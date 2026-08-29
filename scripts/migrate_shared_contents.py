#!/usr/bin/env python3
"""Deduplicate case-local content assets into video/contents and add _cNNN references."""

from __future__ import annotations

import csv
import hashlib
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEMOS_ROOT = ROOT / "video" / "demos"
CONTENTS_ROOT = ROOT / "video" / "contents"
REPORT = ROOT / "data" / "content-migration.csv"
KINDS = {
    "text": {".txt"},
    "image": {".jpg", ".jpeg", ".png", ".webp", ".avif"},
    "video": {".mp4", ".webm"},
}


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def content_file(case: Path, kind: str) -> Path | None:
    matches = sorted(
        (path for path in case.iterdir() if path.is_file() and path.stem.casefold() == "content" and path.suffix.casefold() in KINDS[kind]),
        key=natural_key,
    )
    return matches[0] if matches else None


def main() -> None:
    planned = []
    for kind in KINDS:
        cases = sorted((path for path in DEMOS_ROOT.glob(f"*/{kind}/*") if path.is_dir()), key=natural_key)
        files = [(case, content_file(case, kind)) for case in cases]
        files = [(case, path) for case, path in files if path]
        grouped: dict[str, list[tuple[Path, Path]]] = defaultdict(list)
        for case, path in files:
            grouped[digest(path)].append((case, path))
        ordered_groups = sorted(grouped.items(), key=lambda item: natural_key(item[1][0][0]))
        for index, (checksum, members) in enumerate(ordered_groups, start=1):
            reference = f"c{index:03d}"
            representative = members[0][1]
            common_dir = CONTENTS_ROOT / kind
            common_dir.mkdir(parents=True, exist_ok=True)
            common = common_dir / f"{reference}{representative.suffix.casefold()}"
            if common.exists() and digest(common) != checksum:
                raise RuntimeError(f"Refusing to overwrite mismatched shared content: {common}")
            if not common.exists():
                shutil.copy2(representative, common)
            if digest(common) != checksum:
                raise RuntimeError(f"Shared content verification failed: {common}")
            for case, local in members:
                if re.search(r"(?:^|[_-])c\d+$", case.name, flags=re.IGNORECASE):
                    target = case
                else:
                    target = case.with_name(f"{case.name}_{reference}")
                if target != case and target.exists():
                    raise RuntimeError(f"Folder rename collision: {target}")
                planned.append((kind, reference, checksum, case, target, local, common))

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for kind, reference, checksum, case, target, local, common in planned:
        local.unlink()
        if target != case:
            case.rename(target)
        rows.append({
            "content_type": kind,
            "content_ref": reference,
            "sha256": checksum,
            "old_case_folder": case.relative_to(ROOT).as_posix(),
            "new_case_folder": target.relative_to(ROOT).as_posix(),
            "shared_content": common.relative_to(ROOT).as_posix(),
        })
    with REPORT.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]) if rows else ["content_type", "content_ref", "sha256", "old_case_folder", "new_case_folder", "shared_content"])
        writer.writeheader(); writer.writerows(rows)
    print(f"Migrated {len(rows)} case references into {sum(1 for _ in CONTENTS_ROOT.glob('*/*'))} shared contents")
    print(REPORT.relative_to(ROOT))


if __name__ == "__main__":
    main()
