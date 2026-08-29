#!/usr/bin/env python3
"""Deduplicate camera conditions and rename cases to NN_mNNN[_cNNN]."""

from __future__ import annotations

import csv
import hashlib
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEMOS_ROOT = ROOT / "video" / "demos"
CAMERAS_ROOT = ROOT / "video" / "cameras"
REPORT = ROOT / "data" / "camera-migration.csv"
KINDS = {
    "text": {".txt"},
    "trajectory": {".jpg", ".jpeg", ".png", ".webp", ".avif"},
    "reference": {".mp4", ".webm"},
}


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def camera_file(case: Path, kind: str) -> Path | None:
    matches = sorted(
        (path for path in case.iterdir() if path.is_file() and path.stem.casefold() == "camera" and path.suffix.casefold() in KINDS[kind]),
        key=natural_key,
    )
    return matches[0] if matches else None


def clean_name(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")
    return value[:48].strip("_") or "motion"


def motion_name(kind: str, members: list[tuple[Path, Path]]) -> str:
    representative = members[0][1]
    if kind == "text":
        text = representative.read_text(encoding="utf-8").strip()
        return clean_name(text)
    labels = []
    for case, _ in members:
        title = case / "title.txt"
        if title.exists():
            value = title.read_text(encoding="utf-8").strip()
            if value and not value.casefold().startswith("slide "):
                labels.append(value)
    return clean_name(labels[0]) if labels else f"{kind}_motion"


def display_number(case: Path) -> str:
    match = re.match(r"^(\d+)", case.name)
    if not match:
        raise RuntimeError(f"Case folder needs a leading display number: {case}")
    return match.group(1).zfill(2)


def content_reference(case: Path) -> str | None:
    match = re.search(r"(?:^|[_-])(c\d+)$", case.name, flags=re.IGNORECASE)
    return match.group(1).casefold() if match else None


def main() -> None:
    planned = []
    for kind in KINDS:
        cases = sorted((path for path in DEMOS_ROOT.glob(f"{kind}/*/*") if path.is_dir()), key=natural_key)
        files = [(case, camera_file(case, kind)) for case in cases]
        files = [(case, path) for case, path in files if path]
        grouped: dict[str, list[tuple[Path, Path]]] = defaultdict(list)
        for case, path in files:
            grouped[digest(path)].append((case, path))
        ordered_groups = sorted(grouped.items(), key=lambda item: natural_key(item[1][0][0]))
        for index, (checksum, members) in enumerate(ordered_groups, start=1):
            reference = f"m{index:03d}"
            representative = members[0][1]
            label = motion_name(kind, members)
            common_dir = CAMERAS_ROOT / kind
            common_dir.mkdir(parents=True, exist_ok=True)
            common = common_dir / f"{reference}_{label}{representative.suffix.casefold()}"
            if common.exists() and digest(common) != checksum:
                raise RuntimeError(f"Refusing to overwrite mismatched shared camera: {common}")
            if not common.exists():
                shutil.copy2(representative, common)
            if digest(common) != checksum:
                raise RuntimeError(f"Shared camera verification failed: {common}")
            for case, local in members:
                number = display_number(case)
                content_ref = content_reference(case)
                new_name = f"{number}_{reference}" + (f"_{content_ref}" if content_ref else "")
                target = case.with_name(new_name)
                if target != case and target.exists():
                    raise RuntimeError(f"Folder rename collision: {target}")
                planned.append((kind, reference, checksum, label, case, target, local, common, content_ref or ""))

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for kind, reference, checksum, label, case, target, local, common, content_ref in planned:
        local.unlink()
        if target != case:
            case.rename(target)
        rows.append({
            "camera_type": kind,
            "camera_ref": reference,
            "camera_name": label,
            "content_ref": content_ref,
            "sha256": checksum,
            "old_case_folder": case.relative_to(ROOT).as_posix(),
            "new_case_folder": target.relative_to(ROOT).as_posix(),
            "shared_camera": common.relative_to(ROOT).as_posix(),
        })
    fields = ["camera_type", "camera_ref", "camera_name", "content_ref", "sha256", "old_case_folder", "new_case_folder", "shared_camera"]
    with REPORT.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)
    print(f"Migrated {len(rows)} case references into {sum(1 for _ in CAMERAS_ROOT.glob('*/*'))} shared cameras")
    print(REPORT.relative_to(ROOT))


if __name__ == "__main__":
    main()
