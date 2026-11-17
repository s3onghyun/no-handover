#!/usr/bin/env bash
# Check a looping audio file's seam: decode it, play it twice back to back, and compare the 1 s
# around the loop point with 1 s windows elsewhere (ffmpeg astats: RMS, peak, and the largest
# sample-to-sample jump, which is where a click shows up).
#
#   scripts/audio-check-seam.sh [FILE]     default: public/audio/music/amb.office.ogg
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
F="${1:-$ROOT/public/audio/music/amb.office.ogg}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/nh-seam.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ffmpeg -hide_banner -nostdin -loglevel error -y -i "$F" -ar 48000 -c:a pcm_f32le "$WORK/once.wav"
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$WORK/once.wav")
ffmpeg -hide_banner -nostdin -loglevel error -y -i "$WORK/once.wav" -i "$WORK/once.wav" \
  -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[o]" -map "[o]" -c:a pcm_f32le "$WORK/twice.wav"

# stats <start s> -> "rms_db peak_db max_step"  (channel 1; max_step = largest |x[n]-x[n-1]|)
stats() {
  ffmpeg -hide_banner -nostdin -nostats -ss "$1" -t 1 -i "$WORK/twice.wav" \
    -af "pan=mono|c0=c0,astats=metadata=0:measure_overall=RMS_level+Peak_level+Max_difference:measure_perchannel=none" \
    -f null - 2>&1 | awk -F': ' '/RMS level dB/{r=$2} /Peak level dB/{p=$2} /Max difference/{m=$2} END{printf "%s %s %s\n", r, p, m}'
}
printf 'file %s, loop length %.3f s\n' "$F" "$D"
printf '%-24s %10s %10s %10s\n' window rms_dB peak_dB max_step
seam=$(python3 -c "print($D-0.5)")
read -r sr sp sm < <(stats "$seam")
printf '%-24s %10s %10s %10s\n' "seam ($(printf %.1f "$seam") s)" "$sr" "$sp" "$sm"
worst=0
for t in 5 15 25 35 45 55 65 72; do
  read -r r p m < <(stats "$t")
  printf '%-24s %10s %10s %10s\n' "body ($t s)" "$r" "$p" "$m"
  worst=$(python3 -c "print(max($worst, $m))")
done
# 50 ms RMS steps right across the seam: a level jump would show as one big step
ffmpeg -hide_banner -nostdin -loglevel error -ss "$(python3 -c "print($D-0.25)")" -t 0.5 -i "$WORK/twice.wav" -ac 1 -ar 48000 -f f32le "$WORK/seam.raw"
python3 - "$WORK/seam.raw" "$sm" "$worst" <<'EOF'
import sys, array, math
a = array.array('f'); a.frombytes(open(sys.argv[1], 'rb').read())
hop = 2400
db = [20 * math.log10(math.sqrt(sum(x * x for x in a[i:i + hop]) / hop) + 1e-12) for i in range(0, len(a) - hop + 1, hop)]
steps = [abs(db[i + 1] - db[i]) for i in range(len(db) - 1)]
mid = len(db) // 2
print('50 ms RMS across the seam (dB):', ' '.join(f'{v:.1f}' for v in db), '| seam step', f'{abs(db[mid] - db[mid - 1]):.2f} dB')
seam_step, body_step = float(sys.argv[2]), float(sys.argv[3])
ok = seam_step <= body_step * 1.0 and abs(db[mid] - db[mid - 1]) < 3
print(f"verdict: {'SEAMLESS' if ok else 'CHECK BY EAR'} (seam max sample step {seam_step:.4f} vs body max {body_step:.4f})")
sys.exit(0 if ok else 1)
EOF
