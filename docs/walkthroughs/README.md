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

All 42 recorded workflow scenes were verified using disposable databases. The English versions reuse those recordings with translated narration and titles. The narrator is synthesized with eSpeak NG, not a human voice. Source narration is in `scripts.en.json` and `scripts.ar.json`; verification files record codecs, duration and scene counts. SHA256 checksums are in `sha256.json`.

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
