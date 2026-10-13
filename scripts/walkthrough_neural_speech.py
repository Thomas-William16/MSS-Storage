"""Generate paced neural narration using a separately downloaded Piper voice."""
import argparse
import json
import pathlib
import re
import wave

import onnxruntime
from piper import PiperConfig, PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--build', default='/workspace/walkthrough-build-natural')
parser.add_argument('--scripts', default='docs/walkthroughs/scripts.en.json')
parser.add_argument('--speaker', type=int, default=0)
args = parser.parse_args()
build = pathlib.Path(args.build).resolve()
(build / 'audio').mkdir(parents=True, exist_ok=True)
options = onnxruntime.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
voice = PiperVoice(
    config=PiperConfig.from_dict(json.loads(pathlib.Path(args.model + '.json').read_text())),
    session=onnxruntime.InferenceSession(args.model, sess_options=options, providers=['CPUExecutionProvider']),
)
config = SynthesisConfig(speaker_id=args.speaker, length_scale=1.08, noise_scale=0.5, noise_w_scale=0.6)
scripts = json.loads(pathlib.Path(args.scripts).read_text())
for key, info in scripts.items():
    for scene in info['scenes']:
        text = scene['speech'].replace('CSV', 'C S V').replace('QR', 'Q R').replace('localhost', 'local host')
        pcm = bytearray()
        for sentence in re.split(r'(?<=[.!?])\s+', text):
            for chunk in voice.synthesize(sentence, config):
                pcm.extend(chunk.audio_int16_bytes)
            pcm.extend(bytes(round(voice.config.sample_rate * 0.3) * 2))
        path = build / 'audio' / f"{key}-{scene['id']}.wav"
        with wave.open(str(path), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(voice.config.sample_rate)
            output.writeframes(pcm)
        scene['audio'] = str(path)
        scene['audioDuration'] = len(pcm) / (voice.config.sample_rate * 2)
        print(key, scene['id'], round(scene['audioDuration'], 1), flush=True)
(build / 'scripts.json').write_text(json.dumps(scripts, indent=2))
