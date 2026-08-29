# OmniCamera project page

Official project page for **OmniCamera: A Unified Framework for Multi-task Video Generation with Arbitrary Camera Control**.

## Preview locally

Run:

```sh
./start.sh
```

Then open <http://127.0.0.1:8080>.

The page has no external runtime dependencies. Styles, scripts, and videos are served locally; the paper link points to arXiv.

## Main files

- `index.html` — page content and metadata
- `styles.css` — responsive visual system
- `app.js` — 3×3 condition switching, gallery loading, playback, and citation copy
- `video/demos/` — published cases containing camera condition, content condition, and result
- `video/contents/` — shared Content conditions used by the published cases
- `video/cameras/` — shared Camera conditions used by the published cases
- `data/video-manifest.json` — generated automatically from the complete demo folders
- `scripts/build_video_manifest.py` — scans video folders whenever the site starts
- `figures/` — figures extracted from the paper
- `assets/` — social preview image

## Publication assets

This repository contains the optimized publication copy. Generated result videos retain their original quality; only condition-preview videos are optimized for web playback. The full-resolution working copy is maintained separately.
