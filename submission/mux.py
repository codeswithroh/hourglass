"""mux.py <dir> <out.mp4>: lay scene audio (audio/<id>.wav) onto walkthrough.webm at timeline offsets."""
import json, subprocess, sys
d, out = sys.argv[1], sys.argv[2]
tl = json.load(open(f"{d}/timeline.json"))
trim = max(0.0, tl["scenes"][0]["start"] - 0.4)  # drop page-load dead time before the first scene
ins = ["-ss", f"{trim:.3f}", "-i", f"{d}/walkthrough.webm"]; filt = []; labels = []
for i, s in enumerate(tl["scenes"], start=1):
    ins += ["-i", f"{d}/audio/{s['id']}.wav"]; ms = int((s["start"] - trim) * 1000)
    filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]"); labels.append(f"[a{i}]")
filt.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,apad[aout]")
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *ins, "-filter_complex", ";".join(filt), "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", f"{d}/{out}"], check=True)
print(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{d}/{out}"], capture_output=True, text=True).stdout.strip())
