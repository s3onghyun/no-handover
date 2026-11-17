#!/usr/bin/env bash
# Render a 20 s preview mix of the shipped files, at the game's mix gains, to hear them without
# opening the game: amb.office under everything, the music.briefing sting at 0 s and 지훈's voice
# message from 5.2 s (when the briefing starts it in-game), cut at 20 s with a 1.5 s fade.
# Gains = class gain x cue gain x master volume 70 % (src/audio/manifest.ts CLASS_GAIN):
#   ambience 0.35 x 0.7 x 0.7, music 0.55 x 0.7, voice 1.0 x 0.7.
# (In the game the ambience only starts once the briefing ends; here it runs under it to judge the blend.)
#
#   scripts/audio-preview.sh OUT.wav [AUDIO_DIR]     AUDIO_DIR default: public/audio
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:?usage: audio-preview.sh OUT.wav [AUDIO_DIR]}"
A="${2:-$ROOT/public/audio}"
ffmpeg -hide_banner -nostdin -loglevel error -y \
  -i "$A/music/amb.office.ogg" -i "$A/music/music.briefing.ogg" -i "$A/voice/voice.briefing-jihun.ogg" \
  -filter_complex "
    [0:a]aresample=48000,volume=0.1715,afade=t=in:st=0:d=0.5[amb];
    [1:a]aresample=48000,volume=0.385[sting];
    [2:a]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=0.7,adelay=5200|5200[voice];
    [amb][sting][voice]amix=inputs=3:normalize=0:duration=first,atrim=0:20,afade=t=out:st=18.5:d=1.5[o]" \
  -map "[o]" -c:a pcm_s16le "$OUT"
echo "wrote $OUT ($(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT") s)"
