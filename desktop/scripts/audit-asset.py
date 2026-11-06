"""Inspection only: python -m pip install Pillow; python scripts/audit-asset.py FILE.
No original files are modified. Exit 2 when any composed frame lacks transparency.
"""
import json
import sys
from PIL import Image

with Image.open(sys.argv[1]) as image:
    frames = []
    for i in range(getattr(image, 'n_frames', 1)):
        image.seek(i)
        rgba = image.convert('RGBA')
        alpha = rgba.getchannel('A')
        frames.append({'frame': i, 'duration_ms': image.info.get('duration', 0),
                       'alpha_extrema': alpha.getextrema(), 'bbox': alpha.getbbox(),
                       'has_transparency': alpha.getextrema()[0] < 255})
    report = {'file': sys.argv[1], 'format': image.format, 'size': image.size,
              'frames': frames, 'total_duration_ms': sum(f['duration_ms'] for f in frames),
              'alpha_pass': all(f['has_transparency'] for f in frames),
              'visual_loop_face_glasses_hands': '미검수 · 프레임/반복 재생 육안 확인 필요'}
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(0 if report['alpha_pass'] else 2)
