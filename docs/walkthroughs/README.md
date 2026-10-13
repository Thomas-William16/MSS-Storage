# Standalone role walkthroughs

Download these English MP4 files and upload them directly to your social media account. Each video shows the real application with isolated demonstration data and computer-generated English narration. Chapter titles appear in the video; optional complete speech captions are available as matching `.en.vtt` files.

| Role           | Video                          | Contents                                                                                                                |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Administrator  | [admin.en.mp4](admin.en.mp4)   | Inventory, photos, stock, categories, users, requests, borrowing carts, returns, maintenance, reports and audit history |
| Storage Keeper | [keeper.en.mp4](keeper.en.mp4) | Daily inventory operations, requests, issuing, returns, damage, repairs and reports                                     |
| Scout          | [scout.en.mp4](scout.en.mp4)   | Browsing equipment, submitting and tracking requests, borrowing history and damage reporting                            |

On GitHub, open a video and select **Download raw file**. Alternatively, open the MP4 in `docs/walkthroughs` from your local checkout. These videos are standalone files; the website has no walkthrough page or media endpoint.

Arabic recordings remain available as [admin.ar.mp4](admin.ar.mp4), [keeper.ar.mp4](keeper.ar.mp4) and [scout.ar.mp4](scout.ar.mp4).

The recordings cover the current three roles, without Leader or Locations. Select all returns does not mark items lost. Approval is separate from issuing. CSV export covers the current page. Scouts hand items back to staff, who record returns.

## Production and verification

All 42 recorded workflow scenes were verified using disposable databases. The English versions reuse those recordings with translated narration and titles. English narration uses the neural Piper voice described below; Arabic narration uses eSpeak NG. Both are AI-generated voices. Source narration is in `scripts.en.json` and `scripts.ar.json`; verification files record codecs, duration and scene counts. SHA256 checksums are in `sha256.json`.

Optional production tooling requires FFmpeg, Chromium, Playwright, MongoDB test binaries and the Python packages in `scripts/walkthrough-requirements.txt`. These are not new application runtime dependencies. Keep recording databases separate from real inventory.

To generate English speech:

```sh
python scripts/walkthrough_speech.py --language en-us --scripts docs/walkthroughs/scripts.en.json --build /workspace/walkthrough-build-en
```

The recorder consumes the generated script timings. To encode an English timeline with verified scenes and English audio paths:

```sh
WALKTHROUGH_BUILD=/workspace/walkthrough-build-en WALKTHROUGH_LANGUAGE=en python scripts/encode_walkthrough.py admin
```

Repeat for keeper and scout. English timelines can reuse the corresponding verified raw recordings, retaining scene IDs and timings and replacing titles, speech, audio paths and audio durations. Fast recordings are padded with real frozen frames to accommodate narration.

## Clearer English narration

The English videos now use Piper’s LibriTTS high-quality neural voice with sentence pauses, slightly slower pacing, spelled-out QR/CSV pronunciation, and normalized audio. This remains AI-generated narration rather than a human recording.

Voice source: [rhasspy/piper v0.0.2](https://github.com/rhasspy/piper/releases/tag/v0.0.2), `voice-en-us-libritts-high.tar.gz`, speaker index 0. LibriTTS is based on public-domain LibriVox readings; the [LibriTTS dataset](https://www.openslr.org/60/) by Heiga Zen and collaborators is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The generated narration has been processed for pace and volume. Attribution is retained here for reuse.

Voice model SHA256: `9127a559e11603f10b366d1a20ac7426826081dbc521de4c2420c57728d73f0f`.

Reproduction uses the existing optional Piper environment:

```sh
python scripts/walkthrough_neural_speech.py --model /path/to/en-us-libritts-high.onnx
WALKTHROUGH_BUILD=/workspace/walkthrough-build-natural WALKTHROUGH_LANGUAGE=en WALKTHROUGH_NARRATOR='AI-generated Piper LibriTTS high voice' python scripts/encode_walkthrough.py admin
```

Provide a verified English timeline in the chosen build directory for each role before encoding. Repeat encoding for keeper and scout. No voice model or new runtime dependency is added to the website.

## Shorter pauses and subtle background music

The current English MP4s preserve the approved neural voice while shortening longer silent gaps to approximately 140 ms and leaving a brief transition between scenes. All visual actions remain in the footage, with scene timing adjusted to the shorter narration. Chapter timestamps and full captions match the revised timing.

A soft original instrumental bed of major-seventh pads and sparse bell-like notes plays very quietly underneath the voice, fades in/out and ducks further during speech. It contains no vocals or external samples. The measured music and voice levels and time reductions are recorded in each English verification file.

Optional reproduction: `python scripts/polish_walkthroughs.py admin --source /path/to/original-admin.mp4` (repeat for keeper and scout) uses the approved source MP4s, creates retained copies outside the repository, and produces the updated standalone videos. It requires FFmpeg and NumPy in the optional narration environment.

Use the original approved English MP4s from commit `f657e9015f00afe2a575966ea29c5a11cc3ff697` as source files when reproducing from a fresh checkout. The helper rejects an already-mixed source unless an original file is supplied, to avoid adding music twice.
