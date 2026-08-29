#!/usr/bin/env python3
"""Build complete camera-condition + content-condition + result demo records."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
DEMOS_ROOT = ROOT / "video" / "demos"
CONTENTS_ROOT = ROOT / "video" / "contents"
CAMERAS_ROOT = ROOT / "video" / "cameras"
DATA_ROOT = ROOT / "data"
VIDEO_EXTENSIONS = {".mp4", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}

CAMERAS = {"text": "text", "trajectory": "trajectory", "reference": "reference"}
CONTENTS = {"text": "t2v", "image": "i2v", "video": "v2v"}


def load_motion_groups() -> dict[str, dict[str, dict[str, str]]]:
    path = DATA_ROOT / "camera-motion-groups.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


MOTION_GROUPS = load_motion_groups()


def load_content_labels() -> dict[str, dict[str, str]]:
    path = DATA_ROOT / "content-labels.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


CONTENT_LABELS = load_content_labels()


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def condition_folder(parent: Path, condition: str) -> Path:
    """Accept folders such as image(check过) while keeping image as the mode key."""
    exact = parent / condition
    matches = [
        path for path in parent.iterdir()
        if path.is_dir() and re.match(rf"^{re.escape(condition)}(?:\W|_|$)", path.name, flags=re.IGNORECASE)
    ] if parent.exists() else []
    if not matches:
        return exact

    def result_count(folder: Path) -> int:
        return sum(
            1 for case in folder.iterdir()
            if case.is_dir() and find_asset(case, "result", VIDEO_EXTENSIONS)
        )

    return max(matches, key=lambda folder: (result_count(folder), folder == exact))


def browser_path(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    version = path.stat().st_mtime_ns
    encoded = quote(relative, safe="/()[]@!$&'*,;=:+")
    return f"{encoded}?v={version}"


def find_asset(folder: Path, stem: str, extensions: set[str]) -> Path | None:
    matches = [
        path for path in folder.iterdir()
        if path.is_file() and path.stem.casefold() == stem and path.suffix.casefold() in extensions
    ]
    return sorted(matches, key=natural_key)[0] if matches else None


def read_text(folder: Path, stem: str) -> str | None:
    path = find_asset(folder, stem, {".txt"})
    if not path:
        return None
    text = path.read_text(encoding="utf-8").strip()
    return text[:2000] or None


def media(path: Path | None, kind: str) -> dict[str, str] | None:
    return {"kind": kind, "src": browser_path(path)} if path else None


def folder_label(folder: Path) -> str:
    label = re.sub(r"^\d+[\s._-]*", "", folder.name)
    label = re.sub(r"[_-]c\d+$", "", label, flags=re.IGNORECASE)
    label = re.sub(r"[_-]+", " ", label).strip()
    return re.sub(r"\s+", " ", label) or "Untitled demo"


def camera_reference(folder: Path) -> str | None:
    match = re.search(r"(?:^|[_-])(m\d+)(?:[_-]|$)", folder.name, flags=re.IGNORECASE)
    return match.group(1).casefold() if match else None


def indexed_asset(folder: Path, reference: str, extensions: set[str]) -> Path | None:
    if not folder.exists():
        return None
    matches = [
        path for path in folder.iterdir()
        if path.is_file()
        and re.match(rf"^{re.escape(reference)}(?:[_-]|$)", path.stem, flags=re.IGNORECASE)
        and path.suffix.casefold() in extensions
    ]
    return sorted(matches, key=natural_key)[0] if matches else None


def shared_camera(folder: Path, camera: str) -> Path | None:
    reference = camera_reference(folder)
    if not reference:
        return None
    extensions = {".txt"} if camera == "text" else (IMAGE_EXTENSIONS if camera == "trajectory" else VIDEO_EXTENSIONS)
    return indexed_asset(CAMERAS_ROOT / camera, reference, extensions)


def camera_condition(folder: Path, camera: str) -> dict[str, str] | None:
    if camera == "text":
        local_text = read_text(folder, "camera")
        shared = shared_camera(folder, camera)
        text = local_text or (shared.read_text(encoding="utf-8").strip()[:2000] if shared else None)
        return {"kind": "text", "text": text} if text else None
    if camera == "trajectory":
        return media(find_asset(folder, "camera", IMAGE_EXTENSIONS) or shared_camera(folder, camera), "image")
    return media(find_asset(folder, "camera", VIDEO_EXTENSIONS) or shared_camera(folder, camera), "video")


def content_reference(folder: Path) -> str | None:
    match = re.search(r"(?:^|[_-])(c\d+)$", folder.name, flags=re.IGNORECASE)
    return match.group(1).casefold() if match else None


def shared_content(folder: Path, content: str) -> Path | None:
    reference = content_reference(folder)
    if not reference:
        return None
    extensions = {".txt"} if content == "text" else (IMAGE_EXTENSIONS if content == "image" else VIDEO_EXTENSIONS)
    return find_asset(CONTENTS_ROOT / content, reference, extensions)


def content_condition(folder: Path, content: str) -> dict[str, str] | None:
    if content == "text":
        local_text = read_text(folder, "content")
        shared = shared_content(folder, content)
        text = local_text or (shared.read_text(encoding="utf-8").strip()[:2000] if shared else None)
        return {"kind": "text", "text": text} if text else None
    if content == "image":
        return media(find_asset(folder, "content", IMAGE_EXTENSIONS) or shared_content(folder, content), "image")
    return media(find_asset(folder, "content", VIDEO_EXTENSIONS) or shared_content(folder, content), "video")


def scan_mode(folder: Path, camera: str, content: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for case_folder in sorted((path for path in folder.iterdir() if path.is_dir()), key=natural_key):
        result = find_asset(case_folder, "result", VIDEO_EXTENSIONS)
        if not result:
            continue
        title = read_text(case_folder, "title") or folder_label(case_folder)
        item: dict[str, object] = {
            "id": case_folder.name,
            "label": title,
            "output": {"kind": "video", "src": browser_path(result)},
        }
        reference = content_reference(case_folder)
        if reference:
            item["contentRef"] = reference
            content_label = CONTENT_LABELS.get(content, {}).get(reference)
            if content_label:
                item["contentLabel"] = content_label
        motion_reference = camera_reference(case_folder)
        if motion_reference:
            item["cameraRef"] = motion_reference
            motion = MOTION_GROUPS.get(camera, {}).get(motion_reference)
            if motion:
                item["cameraMotion"] = motion
        camera_data = camera_condition(case_folder, camera)
        content_data = content_condition(case_folder, content)
        if camera_data:
            item["camera"] = camera_data
            if camera_data["kind"] == "text":
                item["command"] = camera_data["text"]
        if content_data:
            item["content"] = content_data
        description = read_text(case_folder, "description")
        if description:
            item["description"] = description
        items.append(item)
    return items


def main() -> None:
    manifest: dict[str, dict[str, list[dict[str, object]]]] = {"modes": {}}
    for camera_folder, camera_key in CAMERAS.items():
        (CAMERAS_ROOT / camera_folder).mkdir(parents=True, exist_ok=True)
        for content_folder, content_key in CONTENTS.items():
            (CONTENTS_ROOT / content_folder).mkdir(parents=True, exist_ok=True)
            camera_root = DEMOS_ROOT / camera_folder
            camera_root.mkdir(parents=True, exist_ok=True)
            folder = condition_folder(camera_root, content_folder)
            folder.mkdir(parents=True, exist_ok=True)
            manifest["modes"][f"{camera_key}-{content_key}"] = scan_mode(folder, camera_folder, content_folder)

    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    output = DATA_ROOT / "video-manifest.json"
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(items) for items in manifest["modes"].values())
    print(f"Indexed {total} complete demos in {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
