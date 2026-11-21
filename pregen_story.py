"""
Công cụ dòng lệnh (CLI) render sẵn giọng đọc .wav cho kịch bản/truyện 4 nhân vật.

Cách dùng trên máy Windows có GPU NVIDIA:
    python pregen_story.py --profile profiles/kenh-1-multi.json --script stories/tap-01.txt --out sound-data/episodes/tap-01

Định dạng tệp kịch bản .txt cực đơn giản (mỗi dòng 1 lượt thoại):
    bong [HAPPY]: Chào cả nhà, hôm nay Bông kể chuyện ngôi nhà cuối ngõ nhé!
    rong [SCARED]: Ủa có ma thiệt không chị Bông ơi?
    ho [ANGRY]: Ma quỷ gì tầm này, chắc gió đập cửa thôi!
    tho [LAUGH]: Anh Hổ sợ mà cứ làm bộ cứng đó cả nhà ơi!
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any

LINE_PATTERN = re.compile(r"^\s*([a-zA-Z0-9_]+)\s*(?:\[([A-Za-z_]+)\])?\s*:\s*(.+?)\s*$")


def parse_script_file(script_path: Path, profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Đọc kịch bản từ file .json hoặc .txt phân vai 4 nhân vật."""
    raw = script_path.read_text(encoding="utf-8").strip()
    char_map = {c["id"]: c for c in profile.get("characters", [])}

    if script_path.suffix.lower() == ".json":
        data = json.loads(raw)
        items = data.get("turns", data) if isinstance(data, dict) else data
        parsed = []
        for item in items:
            spk = str(item.get("speaker", "bong")).lower()
            cfg = char_map.get(spk, next(iter(char_map.values())))
            v = cfg.get("voice", {})
            parsed.append(
                {
                    "speaker": spk,
                    "speaker_name": cfg.get("name", spk),
                    "emotion": str(item.get("emotion", "TALK")).upper(),
                    "text": str(item.get("text", "")).strip(),
                    "reactions": item.get("reactions", {}),
                    "pause_ms": int(item.get("pause_ms", 350)),
                    "voice_name": v.get("voice_name", "Thiện Minh"),
                    "voice_speed": float(v.get("speed", 1.0)),
                }
            )
        return parsed

    turns: list[dict[str, Any]] = []
    for idx, line in enumerate(raw.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = LINE_PATTERN.match(line)
        if not m:
            continue
        spk = m.group(1).lower()
        emo = (m.group(2) or "TALK").upper()
        text = m.group(3).strip()
        cfg = char_map.get(spk)
        if not cfg:
            continue
        v = cfg.get("voice", {})
        turns.append(
            {
                "line_no": idx,
                "speaker": spk,
                "speaker_name": cfg.get("name", spk),
                "emotion": emo,
                "text": text,
                "reactions": {},
                "pause_ms": 350,
                "voice_name": v.get("voice_name", "Thiện Minh"),
                "voice_speed": float(v.get("speed", 1.0)),
            }
        )
    return turns


def synthesize_turn_gpu(text: str, voice_name: str, out_wav: Path, dry_run: bool = False) -> None:
    """Gọi VieNeu CUDA từ giong_noi.py để xuất file .wav (hoặc dry-run khi kiểm thử)."""
    if dry_run:
        out_wav.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt ")
        return

    import giong_noi  # type: ignore

    res = giong_noi.vieneu_audio(text, voice=voice_name)
    if isinstance(res, (bytes, bytearray)):
        out_wav.write_bytes(res)
    elif isinstance(res, (str, Path)) and Path(res).exists():
        out_wav.write_bytes(Path(res).read_bytes())
    else:
        raise RuntimeError(f"giong_noi.vieneu_audio trả về định dạng không hỗ trợ: {type(res)}")


def pregenerate_episode(
    profile_path: Path,
    script_path: Path,
    out_dir: Path,
    episode_id: str | None = None,
    dry_run: bool = False,
) -> Path:
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    turns = parse_script_file(script_path, profile)
    out_dir.mkdir(parents=True, exist_ok=True)
    ep_id = episode_id or out_dir.name

    t0 = time.time()
    manifest_turns: list[dict[str, Any]] = []
    for i, turn in enumerate(turns, start=1):
        wav_name = f"{i:03d}_{turn['speaker']}.wav"
        wav_path = out_dir / wav_name
        if not wav_path.exists() or wav_path.stat().st_size <= 44:
            synthesize_turn_gpu(turn["text"], turn["voice_name"], wav_path, dry_run=dry_run)
        turn_entry = dict(turn)
        turn_entry["audio_path"] = str(wav_path.resolve())
        manifest_turns.append(turn_entry)

    manifest = {
        "episode_id": ep_id,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "turn_count": len(manifest_turns),
        "elapsed_seconds": round(time.time() - t0, 2),
        "turns": manifest_turns,
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate giọng đọc GPU cho truyện 4 nhân vật")
    parser.add_argument("--profile", required=True, help="Đường dẫn profiles/kenh-1-multi.json")
    parser.add_argument("--script", required=True, help="Đường dẫn kịch bản .txt hoặc .json")
    parser.add_argument("--out", required=True, help="Thư mục lưu file .wav và manifest.json")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử không gọi GPU")
    args = parser.parse_args()

    manifest = pregenerate_episode(Path(args.profile), Path(args.script), Path(args.out), dry_run=args.dry_run)
    print(f"Đã render xong tập truyện tại: {manifest}")


if __name__ == "__main__":
    main()
