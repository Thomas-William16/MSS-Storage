import pathlib,json,wave,subprocess,sys,datetime,math,copy,os
root=pathlib.Path(os.environ.get('WALKTHROUGH_BUILD','/workspace/walkthrough-build'));out=pathlib.Path('docs/walkthroughs').resolve()
key=sys.argv[1];folder=root/key;timeline=json.load(open(folder/'timeline.json'))
assert all(scene['verified'] for scene in timeline['scenes'])
video=timeline['rawVideo']
if timeline.get('fast'):
 raw_duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',video]))
 source_offset=max(0,timeline['scenes'][-1]['endMs']/1000-raw_duration)
 edited=[];cursor=0;parts=[]
 for index,original in enumerate(timeline['scenes']):
  source_start=max(0,original['startMs']/1000-source_offset)
  source_end=max(source_start+.2,original['endMs']/1000-source_offset-.15)
  actual=source_end-source_start
  desired=math.ceil(max(actual,original['audioDuration']+1.6)*20)/20
  clip=folder/f'edited-{index:02}.mp4'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(source_start),'-i',video,'-an','-vf',f'trim=duration={actual},setpts=PTS-STARTPTS,fps=20,tpad=stop_mode=clone:stop_duration={max(0,desired-actual)}','-t',str(desired),'-r','20','-c:v','libx264','-preset','fast','-crf','20','-threads','2','-pix_fmt','yuv420p',str(clip)],check=True)
  scene=copy.deepcopy(original);scene['startMs']=cursor*1000;cursor+=desired;scene['endMs']=cursor*1000;edited.append(scene);parts.append(f"file '{clip}'\n")
 listing=folder/'edited-list.txt';listing.write_text(''.join(parts))
 joined=folder/'edited.mp4'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(joined)],check=True)
 video=str(joined);timeline['scenes']=edited
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',video]))
duration=float(probe['format']['duration']);rate=22050
samples=bytearray(int((duration+2)*rate)*2)
for scene in timeline['scenes']:
 with wave.open(scene['audio'],'rb') as audio:
  assert audio.getframerate()==rate and audio.getnchannels()==1
  pcm=audio.readframes(audio.getnframes())
 offset=int(scene['startMs']/1000*rate)*2
 samples[offset:offset+len(pcm)]=pcm
with wave.open(str(folder/'narration.wav'),'wb') as audio:
 audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(rate);audio.writeframes(samples)
def ass_time(ms):
 sec=ms/1000;h=int(sec//3600);m=int(sec%3600//60);s=sec%60
 return f'{h}:{m:02}:{s:05.2f}'
def vtt_time(ms):
 total=round(ms);h=total//3600000;m=total%3600000//60000;s=total%60000//1000;frac=total%1000
 return f'{h:02}:{m:02}:{s:02}.{frac:03}'
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 840
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Arabic,Noto Sans Arabic,42,&H00F2E8E0,&H00F2E8E0,&H00482B39,&H00482B39,1,0,0,0,100,100,0,0,1,1,0,2,32,32,59,1
Style: Cue,DejaVu Sans,18,&H0085A7C7,&H0085A7C7,&H00482B39,&H00482B39,0,0,0,0,100,100,0,0,1,1,0,2,32,32,20,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
lines=[header];vtt=['WEBVTT\n\n'];chapters=[]
for scene in timeline['scenes']:
 begin,end=ass_time(scene['startMs']),ass_time(scene['endMs'])
 title=f"{timeline['title']} — {scene['title']}".replace('\n',' ')
 cue=scene['cue']+'  ·  بيانات تجريبية / صوت آلي'
 lines.append(f'Dialogue: 0,{begin},{end},Arabic,,0,0,0,,{title}\n')
 lines.append(f'Dialogue: 0,{begin},{end},Cue,,0,0,0,,{cue}\n')
 vtt.extend([f"{vtt_time(scene['startMs'])} --> {vtt_time(scene['endMs'])}\n{scene['speech']}\n\n"])
 chapters.append({'at':vtt_time(scene['startMs']).split('.')[0],'title':scene['title'],'cue':scene['cue']})
ass=folder/'captions.ass';ass.write_text(''.join(lines),encoding='utf-8')
(out/f'{key}.ar.vtt').write_text(''.join(vtt),encoding='utf-8')
with open(out/f'{key}.chapters.json','w') as f:json.dump(chapters,f,ensure_ascii=False,indent=2)
metadata=folder/'chapters.ffmeta';meta=[';FFMETADATA1\n',f'title=Scout Storage - {timeline["title"]}\n','comment=Arabic synthesized narration; real application with isolated demonstration data\n']
for i,scene in enumerate(timeline['scenes']):
 meta+=['[CHAPTER]\n','TIMEBASE=1/1000\n',f'START={int(scene["startMs"])}\n',f'END={int(scene["endMs"])}\n',f'title={scene["title"]}\n']
metadata.write_text(''.join(meta),encoding='utf-8')
command=['ffmpeg','-hide_banner','-loglevel','warning','-y','-i',video,'-i',str(folder/'narration.wav'),'-f','ffmetadata','-i',str(metadata),'-map','0:v','-map','1:a','-map_metadata','2','-map_chapters','2','-vf',f'pad=1280:840:0:0:color=0x392b48,subtitles={ass}','-r','20','-c:v','libx264','-preset','fast','-crf','24','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-t',str(duration),'-movflags','+faststart',str(out/f'{key}.ar.mp4')]
subprocess.run(command,check=True)
result=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-show_chapters','-of','json',str(out/f'{key}.ar.mp4')]))
assert any(stream['codec_type']=='video' and stream['codec_name']=='h264' for stream in result['streams'])
assert any(stream['codec_type']=='audio' and stream['codec_name']=='aac' for stream in result['streams'])
assert len(result['chapters'])==len(timeline['scenes'])
assert float(result['format']['duration'])>timeline['scenes'][-1]['startMs']/1000+timeline['scenes'][-1]['audioDuration']-.5
(out/f'{key}.verification.json').write_text(json.dumps({'role':timeline['role'],'language':'Arabic','narration':'computer-generated eSpeak NG Arabic','durationSeconds':float(result['format']['duration']),'bytes':int(result['format']['size']),'verifiedScenes':len(timeline['scenes']),'assertions':timeline['assertions'],'videoCodec':'H.264','audioCodec':'AAC','isolatedDatabase':True},ensure_ascii=False,indent=2))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(min(duration-1,timeline['scenes'][2]['startMs']/1000+5)),'-i',str(out/f'{key}.ar.mp4'),'-frames:v','1',str(folder/'preview.png')],check=True)
print(key,'ENCODED',round(duration),'seconds',round(int(result['format']['size'])/1024/1024,2),'MB')
