#!/usr/bin/env bash
# Rebuild the shipped music/ambience/voice files in public/audio/ from main's originals.
# The originals are never committed (see public/audio/audio-credits.md for what they are).
#
#   scripts/audio-prepare.sh [ORIGINALS_DIR] [OUT_DIR]
#     ORIGINALS_DIR  default: ../../data/infra-mystery-game/audio-in (relative to the project)
#     OUT_DIR        default: <project>/public/audio
#
# Needs ffmpeg (tested with 6.1, libopus + libmp3lame) and python3 (stdlib only, to read loudnorm's JSON).
# Targets (data/infra-mystery-game/audio-cues.md §d): voice -16 LUFS, music -18, ambience -24,
# true peak <= -1 dBTP, 48 kHz, Opus in .ogg + MP3 fallback, all files together <= 4 MB.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN="${1:-$ROOT/../../data/infra-mystery-game/audio-in}"
OUT="${2:-$ROOT/public/audio}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/nh-audio-prepare.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
FF=(ffmpeg -hide_banner -nostdin -loglevel error -y)

for f in amb.office.mp3 music.briefing.mp3 voice.briefing-jihun.wav; do
  [ -f "$IN/$f" ] || { echo "missing original: $IN/$f" >&2; exit 1; }
done
mkdir -p "$OUT/music" "$OUT/voice"

# Two-pass EBU R128 loudness normalisation in LINEAR mode (a pure gain, so the loop seam and the
# dynamics are untouched). Pass 1 measures, pass 2 applies; we check loudnorm really stayed linear.
#   loudnorm_2pass <in.wav> <out.wav> <target LUFS> <channels>
loudnorm_2pass() {
  local in="$1" out="$2" I="$3" ch="$4" m
  m="$(ffmpeg -hide_banner -nostdin -nostats -i "$in" -af "loudnorm=I=$I:TP=-1.5:LRA=20:print_format=json" -f null - 2>&1 |
    python3 -c 'import sys,json,re; t=sys.stdin.read(); d=json.loads(t[t.rindex("{"):]); print(":".join(f"{k}={d[v]}" for k,v in [("measured_I","input_i"),("measured_TP","input_tp"),("measured_LRA","input_lra"),("measured_thresh","input_thresh"),("offset","target_offset")]))')"
  local log
  log="$(ffmpeg -hide_banner -nostdin -nostats -y -i "$in" \
    -af "loudnorm=I=$I:TP=-1.5:LRA=20:$m:linear=true:print_format=json,aresample=48000:resampler=soxr:precision=28" \
    -ar 48000 -ac "$ch" -c:a pcm_f32le "$out" 2>&1)"
  grep -q '"normalization_type" : "linear"' <<<"$log" || { echo "loudnorm fell back to dynamic mode for $in" >&2; exit 1; }
}

# ---------------------------------------------------------------- amb.office: seamless 78.9 s loop
# The original (181.8 s, Gemini music) repeats a phrase every 78.90 s (envelope autocorrelation,
# r = 0.64 at 78.90 s vs <= 0.45 at any other lag in 60-92 s), and 26-116 s is its most even part
# (short-term loudness spread 1.05 LU). So the loop is exactly one phrase period, cut from 30 s:
#   X = original[30.0 s, 30.0 + 78.9 + 6 s]
#   loop = (X[78.9, 84.9] fading out  +  X[0, 6] fading in)  then  X[6, 78.9]
# The loop's last sample is X[78.9) and its first is X[78.9] at full gain: the seam is continuous,
# and the 6 s crossfade blends the same musical moment one period apart.
A0=30.0; P=78.9; XF=6
"${FF[@]}" -i "$IN/amb.office.mp3" \
  -af "aresample=48000:resampler=soxr:precision=28,atrim=start=$A0:duration=$(python3 -c "print($P+$XF)"),asetpts=PTS-STARTPTS" \
  -c:a pcm_f32le "$WORK/amb.x.wav"
# (one input per branch: an asplit -> amix -> concat graph trips ffmpeg 6.1 with "Invalid data")
"${FF[@]}" -i "$WORK/amb.x.wav" -i "$WORK/amb.x.wav" -i "$WORK/amb.x.wav" -filter_complex "
  [0:a]atrim=start=0:end=$XF,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=$XF:curve=hsin[head];
  [1:a]atrim=start=$P,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=$XF:curve=hsin[tail];
  [head][tail]amix=inputs=2:normalize=0:duration=longest[xf];
  [2:a]atrim=start=$XF:end=$P,asetpts=PTS-STARTPTS[body];
  [xf][body]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a pcm_f32le "$WORK/amb.loop.wav"
loudnorm_2pass "$WORK/amb.loop.wav" "$WORK/amb.office.wav" -24 2

# ---------------------------------------------------------------- music.briefing: 12.7 s opening sting
# The original's first 12.7 s are the quiet opening (felt piano + low cello); its last notes decay
# on their own to about -41 dBFS at 12.4-12.6 s, just before the full-band hit at 12.8 s. Cut there,
# with a 1.5 s fade to smooth the decay to digital silence and a 20 ms fade-in against a click.
"${FF[@]}" -i "$IN/music.briefing.mp3" \
  -af "aresample=48000:resampler=soxr:precision=28,atrim=start=0:end=12.7,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,afade=t=out:st=11.2:d=1.5" \
  -c:a pcm_f32le "$WORK/sting.wav"
loudnorm_2pass "$WORK/sting.wav" "$WORK/music.briefing.wav" -18 2

# ---------------------------------------------------------------- voice.briefing-jihun: mono, trimmed
# From the 24 kHz mono WAV (not the mp3): trim the 0.23 s lead-in and 0.18 s tail silence (keeping
# 50 ms of air at each end), 80 Hz high-pass (2nd order), -16 LUFS. The TTS file peaks at -0.9 dBTP
# while its loudness is already -16.5 LUFS, so a pure gain to -16 LUFS cannot keep <= -1 dBTP: a
# transparent peak limiter at -3.1 dBFS (only the odd plosive is touched) leaves room for the linear
# loudnorm gain. Without it loudnorm drops to dynamic mode (and hangs on this file in ffmpeg 6.1).
"${FF[@]}" -i "$IN/voice.briefing-jihun.wav" \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,highpass=f=80:poles=2,aresample=48000:resampler=soxr:precision=28,alimiter=limit=0.7:attack=1:release=50:level=0" \
  -ar 48000 -ac 1 -c:a pcm_f32le "$WORK/voice.wav"
loudnorm_2pass "$WORK/voice.wav" "$WORK/voice.briefing-jihun.wav" -16 1

# ---------------------------------------------------------------- encode: Opus (.ogg) + MP3 fallback
#   enc <id> <folder> <opus kbps> <mp3 kbps>
enc() {
  local id="$1" dir="$2" ok="$3" mk="$4"
  "${FF[@]}" -i "$WORK/$id.wav" -c:a libopus -b:a "${ok}k" -vbr on -compression_level 10 -application audio -ar 48000 -map_metadata -1 "$OUT/$dir/$id.ogg"
  "${FF[@]}" -i "$WORK/$id.wav" -c:a libmp3lame -b:a "${mk}k" -ar 48000 -map_metadata -1 -write_xing 1 "$OUT/$dir/$id.mp3"
}
enc amb.office music 80 96
enc music.briefing music 96 128
enc voice.briefing-jihun voice 48 64

# ---------------------------------------------------------------- report
total=0
for f in "$OUT"/music/amb.office.{ogg,mp3} "$OUT"/music/music.briefing.{ogg,mp3} "$OUT"/voice/voice.briefing-jihun.{ogg,mp3}; do
  s=$(stat -c %s "$f"); total=$((total + s))
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")
  l=$(ffmpeg -hide_banner -nostdin -nostats -i "$f" -af loudnorm=print_format=json -f null - 2>&1 | python3 -c 'import sys; t=sys.stdin.read(); import json; d=json.loads(t[t.rindex("{"):]); print(d["input_i"], "LUFS", d["input_tp"], "dBTP")')
  printf '%-44s %8d B  %7.2f s  %s\n' "${f#"$OUT"/}" "$s" "$d" "$l"
done
printf 'total %d B (%.2f MB, budget 4 MB)\n' "$total" "$(python3 -c "print($total/1e6)")"
[ "$total" -le 4000000 ] || { echo "over the 4 MB budget" >&2; exit 1; }
