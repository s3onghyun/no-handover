#!/usr/bin/env bash
# Rebuild the shipped music/ambience/voice files in public/audio/ from the maintainer's originals.
# The originals are never committed (see public/audio/audio-credits.md for what they are).
#
#   scripts/audio-prepare.sh ORIGINALS_DIR [OUT_DIR]
#     ORIGINALS_DIR  the folder with the originals (required; not in this repository)
#     OUT_DIR        default: <project>/public/audio
#
# Needs ffmpeg (tested with 6.1, libopus + libmp3lame) and python3 (stdlib only, to read loudnorm's JSON).
# Targets (the cue sheet in the design notes, §d): voice -16 LUFS, music -18, ambience -24,
# true peak <= -1 dBTP, 48 kHz, Opus in .ogg + MP3 fallback. Budget: 4 MB per case, what one session downloads
# (the music that case plays plus its voices, in the larger of the two formats: a session fetches one format
# and only its own case's sounds, src/audio/audio.ts + src/engine/voices.ts caseManifest), checked by
# tests/voices.test.ts; all files together <= 12 MB (the repository; a session still downloads one case, one format).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN="${1:?usage: scripts/audio-prepare.sh ORIGINALS_DIR [OUT_DIR]}"
OUT="${2:-$ROOT/public/audio}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/nh-audio-prepare.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
FF=(ffmpeg -hide_banner -nostdin -loglevel error -y)
# soxr when this ffmpeg has it (the 2026-11-17 files), else swr at high quality (e.g. Homebrew ffmpeg 9)
if ffmpeg -hide_banner -buildconf 2>/dev/null | grep -q soxr; then RS="resampler=soxr:precision=28"; else RS="resampler=swr:filter_size=64:phase_shift=10:cutoff=0.97"; fi

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
    python3 -c 'import sys,json,re; t=sys.stdin.read(); d=json.loads(t[t.rindex("{"):t.rindex("}")+1]); print(":".join(f"{k}={d[v]}" for k,v in [("measured_I","input_i"),("measured_TP","input_tp"),("measured_LRA","input_lra"),("measured_thresh","input_thresh"),("offset","target_offset")]))')"
  local log
  log="$(ffmpeg -hide_banner -nostdin -nostats -y -i "$in" \
    -af "loudnorm=I=$I:TP=-1.5:LRA=20:$m:linear=true:print_format=json,aresample=48000:$RS" \
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
  -af "aresample=48000:$RS,atrim=start=$A0:duration=$(python3 -c "print($P+$XF)"),asetpts=PTS-STARTPTS" \
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
  -af "aresample=48000:$RS,atrim=start=0:end=12.7,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,afade=t=out:st=11.2:d=1.5" \
  -c:a pcm_f32le "$WORK/sting.wav"
loudnorm_2pass "$WORK/sting.wav" "$WORK/music.briefing.wav" -18 2

# ---------------------------------------------------------------- encode: Opus (.ogg) + MP3 fallback
#   enc <id> <folder> <opus kbps> <mp3 kbps> [mp3 sample rate, default 48000]
enc() {
  local id="$1" dir="$2" ok="$3" mk="$4" mr="${5:-48000}"
  "${FF[@]}" -i "$WORK/$id.wav" -c:a libopus -b:a "${ok}k" -vbr on -compression_level 10 -application audio -ar 48000 -map_metadata -1 "$OUT/$dir/$id.ogg"
  "${FF[@]}" -i "$WORK/$id.wav" -c:a libmp3lame -b:a "${mk}k" -ar "$mr" -map_metadata -1 -write_xing 1 "$OUT/$dir/$id.mp3"
}
# true peak (dBTP) of a file
tp() { ffmpeg -hide_banner -nostdin -nostats -i "$1" -af loudnorm=print_format=json -f null - 2>&1 | python3 -c 'import sys,json; t=sys.stdin.read(); print(json.loads(t[t.rindex("{"):t.rindex("}")+1])["input_tp"])'; }
enc amb.office music 80 96
enc music.briefing music 96 128

# music.reveal (2026-11-24, Lyria 3 Clip, optional original): the first 28.5 s; the last chord lands at 21 s and its
# reverb is closed with a 3 s fade after the last stroke (26.0 s). Plays once where a case ends on its debrief.
if [ -f "$IN/music.reveal.mp3" ]; then
  "${FF[@]}" -i "$IN/music.reveal.mp3" -af "aresample=48000:$RS,atrim=start=0:end=28.5,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,afade=t=out:st=25.5:d=3:curve=hsin" -c:a pcm_f32le "$WORK/reveal.wav"
  loudnorm_2pass "$WORK/reveal.wav" "$WORK/music.reveal.wav" -18 2
  enc music.reveal music 96 128
fi
# music.finale (2026-11-24, Lyria 3.5, optional original): the whole take up to its own digital silence (69.6 s),
# a 1.5 s safety fade at the end. Case 4 only (src/engine/voices.ts caseManifest).
if [ -f "$IN/music.finale.mp3" ]; then
  "${FF[@]}" -i "$IN/music.finale.mp3" -af "aresample=48000:$RS,atrim=start=0:end=70.0,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,afade=t=out:st=68.5:d=1.5" -c:a pcm_f32le "$WORK/finale.wav"
  loudnorm_2pass "$WORK/finale.wav" "$WORK/music.finale.wav" -18 2
  enc music.finale music 96 128
fi

# ---------------------------------------------------------------- voices: mono, trimmed
# Every voice.*.wav in the originals (24 kHz mono Gemini TTS): trim the lead-in and tail silence
# (keeping 50 ms of air at each end), 80 Hz high-pass (2nd order), -16 LUFS. TTS files peak near
# 0 dBTP, so a pure gain to -16 LUFS cannot keep <= -1 dBTP: a transparent peak limiter first
# (only the odd plosive is touched) leaves room for the linear loudnorm gain. Without it loudnorm
# drops to dynamic mode (and hangs on voice.briefing-jihun in ffmpeg 6.1).
# voice.briefing-jihun keeps its original -3.1 dBFS (0.7) limit and 48/64 kbps. Every other line
# (Case 0-2 briefings, every colleague line) is encoded at speech rates that keep each case under 4 MB, Opus
# 20 kbps + MP3 24 kbps at 24 kHz (the TTS rate; MP3 below 32 kbps needs an MPEG-2 sample rate).
# Its limit starts where the peaks land at -3 dBFS after the gain (gain from a first loudness
# reading) and steps down 1 dB until loudnorm stays linear and both encodes are <= -1 dBTP: some
# TTS lines arrive clipped, and clipped speech overshoots after low-bitrate encoding.
TRIM="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,highpass=f=80:poles=2,aresample=48000:$RS"
for src in "$IN"/voice.*.wav; do
  id="$(basename "$src" .wav)"
  if [ "$id" = voice.briefing-jihun ]; then
    "${FF[@]}" -i "$src" -af "$TRIM,alimiter=limit=0.7:attack=1:release=50:level=0" -ar 48000 -ac 1 -c:a pcm_f32le "$WORK/voice.wav"
    loudnorm_2pass "$WORK/voice.wav" "$WORK/$id.wav" -16 1
    enc "$id" voice 48 64
    continue
  fi
  i="$(ffmpeg -hide_banner -nostdin -nostats -i "$src" -af "$TRIM,loudnorm=print_format=json" -f null - 2>&1 | python3 -c 'import sys,json; t=sys.stdin.read(); print(json.loads(t[t.rindex("{"):t.rindex("}")+1])["input_i"])')"
  head=3; ok=
  while [ "$head" -le 12 ]; do
    lim="$(python3 -c "print(min(1.0, 10 ** ((-$head - (-16 - $i)) / 20)))")"
    "${FF[@]}" -i "$src" -af "$TRIM,alimiter=limit=$lim:attack=1:release=50:level=0" -ar 48000 -ac 1 -c:a pcm_f32le "$WORK/voice.wav"
    if (loudnorm_2pass "$WORK/voice.wav" "$WORK/$id.wav" -16 1) 2>/dev/null; then
      enc "$id" voice 20 24 24000
      if python3 -c "import sys; sys.exit(0 if max($(tp "$OUT/voice/$id.ogg"), $(tp "$OUT/voice/$id.mp3")) <= -1.0 else 1)"; then ok=1; break; fi
    fi
    head=$((head + 1))
  done
  [ -n "$ok" ] || { echo "$id: no limit keeps loudnorm linear and the encodes <= -1 dBTP" >&2; exit 1; }
done

# ---------------------------------------------------------------- report
total=0
for f in "$OUT"/music/*.{ogg,mp3} "$OUT"/voice/voice.*.{ogg,mp3}; do
  s=$(wc -c <"$f" | tr -d " "); total=$((total + s))
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")
  l=$(ffmpeg -hide_banner -nostdin -nostats -i "$f" -af loudnorm=print_format=json -f null - 2>&1 | python3 -c 'import sys; t=sys.stdin.read(); import json; d=json.loads(t[t.rindex("{"):t.rindex("}")+1]); print(d["input_i"], "LUFS", d["input_tp"], "dBTP")')
  printf '%-44s %8d B  %7.2f s  %s\n' "${f#"$OUT"/}" "$s" "$d" "$l"
done
printf 'total %d B (%.2f MB; budget 4 MB per case, what one session downloads, npm test checks it; 12 MB for every case together)\n' "$total" "$(python3 -c "print($total/1e6)")"
[ "$total" -le 12000000 ] || { echo "over the 12 MB ceiling" >&2; exit 1; }
