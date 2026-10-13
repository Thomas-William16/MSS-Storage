import ctypes, json, wave, pathlib, argparse, importlib.util
parser=argparse.ArgumentParser()
parser.add_argument('--build',default='/workspace/walkthrough-build')
parser.add_argument('--scripts',default='docs/walkthroughs/scripts.ar.json')
args=parser.parse_args()
build=pathlib.Path(args.build).resolve();(build/'audio').mkdir(parents=True,exist_ok=True)
root=str(pathlib.Path(importlib.util.find_spec('piper').origin).parent)
lib=ctypes.CDLL(root+'/espeakbridge.so')
lib.espeak_Initialize.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_char_p,ctypes.c_int]
rate=lib.espeak_Initialize(2,0,root.encode(),0)
lib.espeak_SetVoiceByName.argtypes=[ctypes.c_char_p]
assert lib.espeak_SetVoiceByName(b'ar')==0
lib.espeak_SetParameter(1,150,0)
lib.espeak_SetParameter(2,85,0)
chunks=[]
CB=ctypes.CFUNCTYPE(ctypes.c_int,ctypes.POINTER(ctypes.c_short),ctypes.c_int,ctypes.c_void_p)
@CB
def callback(ptr,n,events):
 if ptr and n:chunks.append(ctypes.string_at(ptr,n*2))
 return 0
lib.espeak_SetSynthCallback(callback)
lib.espeak_Synth.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_uint,ctypes.c_int,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_void_p]
scripts=json.load(open(args.scripts))
for role,info in scripts.items():
 total=0
 for scene in info['scenes']:
  chunks.clear();text=scene['speech'].encode();buf=ctypes.create_string_buffer(text)
  assert lib.espeak_Synth(buf,len(text)+1,0,1,0,1|0x1000,None,None)==0
  lib.espeak_Synchronize()
  data=b''.join(chunks)
  path=build/'audio'/f"{role}-{scene['id']}.wav"
  with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(data)
  scene['audio']=str(path);scene['audioDuration']=len(data)/(rate*2);total+=scene['audioDuration']+1
 print(role, 'spoken seconds',round(total))
json.dump(scripts,open(build/'scripts.json','w'),ensure_ascii=False,indent=2)
lib.espeak_Terminate()
