"""tts.py <dir>: synthesize <dir>/scenes.json with the Andrew neural voice → <dir>/audio/<id>.wav, durations written back."""
import json, os, subprocess, sys
d = sys.argv[1]; os.makedirs(f"{d}/audio", exist_ok=True)
sc = json.load(open(f"{d}/scenes.json"))
for s in sc:
    mp3, wav = f"{d}/audio/{s['id']}.mp3", f"{d}/audio/{s['id']}.wav"
    subprocess.run(["/tmp/kokoro-venv/bin/edge-tts", "--voice", "en-US-AndrewMultilingualNeural", "--rate", "+4%", "--text", s["text"], "--write-media", mp3], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "2", wav], check=True)
    s["duration"] = round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout), 3)
json.dump(sc, open(f"{d}/scenes.json", "w"), indent=1)
print(d, round(sum(s["duration"] for s in sc), 1))
