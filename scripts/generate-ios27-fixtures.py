"""Synthetic numbered SDR/HDR fixtures; no third-party media or Python packages."""
from pathlib import Path
import subprocess, tempfile, math, struct
out = Path('tests/fixtures/ios27'); out.mkdir(exist_ok=True)
glyphs = ['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001010010010','111101111101111','111101111001111']
def encode(nits, mode):
    if mode == 'pq':
        y = (nits / 10000) ** (2610/16384)
        return ((3424/4096 + 2413/128*y)/(1+2392/128*y))**(2523/32)
    if mode == 'hlg':
        # Scene-linear neutral ramp; 1.0 is the reference scene peak.
        x = nits / 1000
        a = .17883277; b = 1-4*a; c = .5-a*math.log(4*a)
        return math.sqrt(3*x) if x <= 1/12 else a*math.log(12*x-b)+c
    x = nits / 100
    return 4.5*x if x < .018 else 1.099*x**.45-.099
with tempfile.TemporaryDirectory() as folder:
    for mode in ['sdr','hlg','pq']:
        raw = Path(folder)/f'{mode}.rgb'
        with raw.open('wb') as f:
            for frame in range(60):
                for y in range(90):
                    for x in range(160):
                        peak = 100 if mode == 'sdr' else 1000
                        nits = peak * (x//20)/7
                        for index, digit in enumerate(f'{frame:02}'):
                            gx, gy = (x-5-index*20)//5, (y-5)//5
                            if 0 <= gx < 3 and 0 <= gy < 5:
                                nits = peak if glyphs[int(digit)][gy*3+gx]=='1' else 0
                        value = round(65535*encode(nits,mode))
                        f.write(struct.pack('<HHH',value,value,value))
        for name in (['sdr-bframes','sdr-hevc','vfr'] if mode=='sdr' else [mode]):
            hevc = name not in ['sdr-bframes','vfr']
            cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb48le','-video_size','160x90','-framerate','30','-i',str(raw),'-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=2']
            filters = 'scale=out_color_matrix='+('bt709' if mode=='sdr' else 'bt2020')
            if name=='vfr': filters+=",select='if(lt(t,1),1,not(mod(n,2)))'"
            filters += ',setparams=color_primaries='+('bt709' if mode=='sdr' else 'bt2020')+':color_trc='+{'sdr':'bt709','hlg':'arib-std-b67','pq':'smpte2084'}[mode]+':colorspace='+('bt709' if mode=='sdr' else 'bt2020nc')
            cmd+=['-movflags','+write_colr','-vf',filters,'-c:v','libx265' if hevc else 'libx264','-pix_fmt','yuv420p10le' if mode!='sdr' else 'yuv420p','-bf','3','-g','30','-c:a','aac','-color_primaries','bt709' if mode=='sdr' else 'bt2020','-color_trc',{'sdr':'bt709','hlg':'arib-std-b67','pq':'smpte2084'}[mode],'-colorspace','bt709' if mode=='sdr' else 'bt2020nc']
            if hevc: cmd+=['-tag:v','hvc1','-x265-params','log-level=error:pools=1']
            if name=='vfr': cmd+=['-fps_mode','vfr']
            subprocess.run(cmd+[str(out/(name+'.mp4'))],check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/'sdr-bframes.mp4'),'-c','copy','-metadata:s:v:0','rotate=90',str(out/'portrait.mp4')],check=True)
# Fail regeneration if the encoder/muxer discarded color tags.
import json
for name in ['sdr-bframes','sdr-hevc','vfr','portrait','hlg','pq']:
    info = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=color_transfer,color_primaries,nb_frames,has_b_frames','-of','json',str(out/(name+'.mp4'))]))['streams'][0]
    assert info['color_primaries'] == ('bt2020' if name in ['hlg','pq'] else 'bt709'), info
    assert info['color_transfer'] == {'hlg':'arib-std-b67','pq':'smpte2084'}.get(name,'bt709'), info
    assert int(info['nb_frames']) == (45 if name=='vfr' else 60), info
    assert info['has_b_frames'] > 0, info
