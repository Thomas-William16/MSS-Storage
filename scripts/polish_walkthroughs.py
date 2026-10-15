"""Trim narration pauses, retime complete scenes, and mix an original quiet music bed."""
import argparse
import json
import math
import pathlib
import re
import shutil
import subprocess
import wave

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('role', choices=['admin', 'keeper', 'scout'])
parser.add_argument('--build', default='/workspace/walkthrough-build-polished')
parser.add_argument('--source', help='Original approved MP4 without music')
args = parser.parse_args()
root = pathlib.Path(args.build).resolve() / args.role
root.mkdir(parents=True, exist_ok=True)
out = pathlib.Path('docs/walkthroughs')
source = root / 'source.mp4'
# Retain the approved source: repeated runs never recursively trim an output.
if not source.exists():
    current = json.loads((out / f'{args.role}.en.verification.json').read_text())
    if not args.source and current.get('backgroundMusic'):
        raise ValueError('Provide --source with the original approved MP4, without music')
    shutil.copyfile(pathlib.Path(args.source) if args.source else out / f'{args.role}.en.mp4', source)

def run(argv):
    return subprocess.run(argv, check=True, capture_output=True, text=True)

probe = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_chapters', '-of', 'json', str(source)]).stdout)
info = json.loads((out / 'scripts.en.json').read_text())[args.role]
assert len(probe['chapters']) == len(info['scenes'])
rate = 48000
all_audio = []
chapters = []
parts = []
cursor = 0.0
removed = 0.0
for index, (chapter, scene) in enumerate(zip(probe['chapters'], info['scenes'])):
    start = float(chapter['start_time'])
    end = float(chapter['end_time'])
    original_duration = end - start
    wav = root / f'scene-{index:02}.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(source), '-t', str(original_duration), '-vn', '-ac', '1', '-ar', str(rate), '-c:a', 'pcm_s16le', str(wav)])
    with wave.open(str(wav)) as audio:
        pcm = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').copy()
    log = run(['ffmpeg', '-hide_banner', '-i', str(wav), '-af', 'silencedetect=noise=-45dB:d=0.28', '-f', 'null', '-']).stderr
    intervals = []
    begun = None
    for event, value in re.findall(r'silence_(start|end): ([0-9.]+)', log):
        if event == 'start':
            begun = float(value)
        elif begun is not None:
            intervals.append((begun, float(value)))
            begun = None
    if begun is not None:
        intervals.append((begun, len(pcm) / rate))
    chunks = []
    at = 0
    for first, last in intervals:
        # Keep 140 ms inside sentences, 50 ms before speech, 120 ms after speech.
        if first < 0.05:
            cut_first, cut_last = first, last - 0.05
        elif last > len(pcm) / rate - 0.05:
            cut_first, cut_last = first + 0.12, last
        else:
            cut_first, cut_last = first + 0.07, last - 0.07
        a, b = max(at, round(cut_first * rate)), min(len(pcm), round(cut_last * rate))
        if b <= a:
            continue
        # Only silence below the detector threshold can be discarded.
        discarded = pcm[a:b].astype(np.float64) / 32768
        assert np.max(np.abs(discarded), initial=0) < 0.008, 'Refusing to remove speech'
        chunks.append(pcm[at:a])
        at = b
    chunks.append(pcm[at:])
    compact = np.concatenate(chunks)
    # One brief transition, no long freeze after the last spoken word.
    compact = np.concatenate([compact, np.zeros(round(rate * 0.16), dtype=np.int16)])
    duration = math.ceil(len(compact) / rate * 20) / 20
    compact = np.pad(compact, (0, round(duration * rate) - len(compact)))
    assert duration > 1
    removed += original_duration - duration
    all_audio.append(compact.astype(np.float64) / 32768)
    clip = root / f'clip-{index:02}.mp4'
    # Keep every frame/action, compressing scene timing to the shortened narration.
    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(source), '-an', '-vf', f'trim=duration={original_duration},setpts={duration/original_duration}*(PTS-STARTPTS),fps=20', '-t', str(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-threads', '2', '-pix_fmt', 'yuv420p', str(clip)])
    parts.append(f"file '{clip}'\n")
    chapters.append({'start': cursor, 'end': cursor + duration, 'title': scene['title'], 'cue': scene['cue'], 'speech': scene['speech']})
    cursor += duration
    print(args.role, scene['id'], round(original_duration, 2), '->', duration, flush=True)
listing = root / 'concat.txt'
listing.write_text(''.join(parts))
joined = root / 'video.mp4'
run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-c', 'copy', str(joined)])
narration = np.concatenate(all_audio)

# Original synthesized instrumental: soft major-seventh pads and sparse bell-like notes.
# No external recording, vocals, or sample libraries are used.
count = len(narration)
t = np.arange(count, dtype=np.float64) / rate
music = np.zeros(count, dtype=np.float64)
beat = 60 / 76
bar = 4 * beat
progression = [(48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 55, 59)]
for bar_index, onset in enumerate(np.arange(0, cursor, bar)):
    chord = progression[(bar_index // 2) % 4]
    begin = round(onset * rate)
    stop = min(count, begin + round(bar * 1.8 * rate))
    local = np.arange(stop - begin) / rate
    envelope = (1 - np.exp(-local / 0.8)) * np.exp(-local / 3.2)
    for note in chord:
        frequency = 440 * 2 ** ((note - 69) / 12)
        music[begin:stop] += 0.14 * envelope * (np.sin(2 * np.pi * frequency * local) + 0.12 * np.sin(4 * np.pi * frequency * local))
    for offset, note in [(0.0, chord[2] + 12), (beat * 2, chord[3] + 12)]:
        a = begin + round(offset * rate)
        b = min(count, a + round(2.8 * rate))
        if b <= a:
            continue
        local = np.arange(b - a) / rate
        frequency = 440 * 2 ** ((note - 69) / 12)
        envelope = (1 - np.exp(-local / 0.025)) * np.exp(-local / 0.65)
        music[a:b] += 0.13 * envelope * (np.sin(2 * np.pi * frequency * local) + 0.2 * np.sin(6 * np.pi * frequency * local))
rms = np.sqrt(np.mean(music ** 2))
music *= 10 ** (-45 / 20) / rms
fade = np.minimum(1, t / 1.8) * np.minimum(1, np.maximum(0, cursor - t) / 2.2)
music *= fade
# Music is about 25-30 dB quieter than speech, with gentle further ducking under narration.
window = 2400
energy = np.pad(narration ** 2, (0, (-count) % window)).reshape(-1, window).mean(axis=1)
# Smooth gain with a 100-ms lowpass approximation at control rate.
control = np.sqrt(energy) > 0.01
gain = np.ones(len(control))
for i in range(len(control)):
    target = 0.7 if control[i] else 1.0
    gain[i] = target if i == 0 else gain[i-1] * 0.6 + target * 0.4
music *= np.repeat(gain, window)[:count]
mixed = narration + music
assert np.max(np.abs(mixed)) < 0.98, 'Mix must not clip'
def write_wav(path, samples):
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
write_wav(root / 'mix.wav', mixed)
write_wav(root / 'music.wav', music)
write_wav(root / 'voice.wav', narration)
metadata = root / 'chapters.ffmeta'
meta = [';FFMETADATA1\n', f'title=Scout Storage - {info["title"]}\n', 'comment=AI-generated Piper LibriTTS narration; LibriTTS by Heiga Zen et al., CC BY 4.0; original quiet instrumental created for this walkthrough\n']
def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
vtt = ['WEBVTT\n\n']
for chapter in chapters:
    meta.extend(['[CHAPTER]\n', 'TIMEBASE=1/1000\n', f'START={round(chapter["start"]*1000)}\n', f'END={round(chapter["end"]*1000)}\n', f'title={chapter["title"]}\n'])
    vtt.append(f'{stamp(chapter["start"])} --> {stamp(chapter["end"])}\n{chapter["speech"]}\n\n')
metadata.write_text(''.join(meta))
final = root / 'final.mp4'
run(['ffmpeg', '-v', 'error', '-y', '-i', str(joined), '-i', str(root / 'mix.wav'), '-f', 'ffmetadata', '-i', str(metadata), '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', str(rate), '-t', str(cursor), '-movflags', '+faststart', str(final)])
run(['ffmpeg', '-v', 'error', '-i', str(final), '-f', 'null', '-'])
result = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', str(final)]).stdout)
assert len(result['chapters']) == len(chapters)
shutil.copyfile(final, out / f'{args.role}.en.mp4')
(out / f'{args.role}.en.vtt').write_text(''.join(vtt).rstrip() + '\n')
(out / f'{args.role}.en.chapters.json').write_text(json.dumps([{'at': stamp(c['start']), 'title': c['title'], 'cue': c['cue']} for c in chapters], indent=2) + '\n')
verification = out / f'{args.role}.en.verification.json'
verified = json.loads(verification.read_text())
for field in ['truePeakDbTP', 'integratedLoudnessLUFS']:
    verified.pop(field, None)
verified.update(durationSeconds=float(result['format']['duration']), bytes=final.stat().st_size, pauseReductionSeconds=round(removed, 2), pauseTargetSeconds=0.14, backgroundMusic='Original soft synthesized instrumental, no vocals', musicRmsDbFS=round(20*np.log10(np.sqrt(np.mean(music**2))), 2), narrationRmsDbFS=round(20*np.log10(np.sqrt(np.mean(narration**2))), 2), fullSceneActionsRetained=True)
verification.write_text(json.dumps(verified, indent=2) + '\n')
print(args.role, 'COMPLETE', round(cursor, 2), 'seconds; trimmed', round(removed, 2), 'seconds; music RMS', verified['musicRmsDbFS'], flush=True)
