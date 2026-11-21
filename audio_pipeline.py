"""
Hàng đợi phát âm thanh đa nhân vật & GPU TTS Prefetch cho dự án who-am-i.

Đặc điểm chính:
- 2 mức ưu tiên: PRIORITY_LIVE (bình luận/quà tặng) > PRIORITY_STORY (kể chuyện/idle).
- Ngắt mềm (finish_current_line): không cắt ngang giữa câu đang phát; chờ dứt câu rồi
  chèn ngay chuỗi phản hồi bình luận, xong tự động quay lại kể tiếp mạch truyện cũ.
- Prefetch gối đầu: trong lúc câu 1 đang phát trên overlay, worker GPU nền tạo sẵn file
  .wav cho câu 2, 3 qua _vieneu_lock của giong_noi.py.
- Độ trễ bằng 0 cho truyện đã pre-generate sẵn (bỏ qua bước gọi GPU nếu audio_path đã tồn tại).
"""

from __future__ import annotations

import hashlib
import heapq
import json
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

PRIORITY_LIVE = 1
PRIORITY_MANUAL = 2
PRIORITY_STORY = 5
PRIORITY_IDLE = 8

TTSFunc = Callable[[str, str, float, Path], Path]


@dataclass(order=True)
class QueuedTurn:
    priority: int
    seq: int
    turn: dict[str, Any] = field(compare=False)
    batch_id: str = field(default="", compare=False)
    source: str = field(default="live", compare=False)  # live | story | idle | manual
    audio_ready: bool = field(default=False, compare=False)
    audio_path: str | None = field(default=None, compare=False)
    created_at: float = field(default_factory=time.time, compare=False)


class MultiCharacterAudioPipeline:
    """
    Điều phối hàng đợi thoại 4 nhân vật với 1 luồng GPU TTS tuần tự duy nhất
    (tránh xung đột VRAM với VieNeu CUDA).
    """

    def __init__(
        self,
        cache_dir: str | Path = "sound-data/multi-cache",
        tts_fn: TTSFunc | None = None,
        prefetch_ahead: int = 2,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.tts_fn = tts_fn or self._default_tts_adapter
        self.prefetch_ahead = max(1, prefetch_ahead)

        self._lock = threading.Lock()
        self._wakeup = threading.Event()
        self._stop_event = threading.Event()

        self._seq = 0
        self._heap: list[QueuedTurn] = []
        self._ready_queue: list[QueuedTurn] = []
        self._current_playing: QueuedTurn | None = None
        self._paused: bool = False

        # Lưu lịch sử hội thoại gần nhất để truyền lại cho director_prompt.py
        self._recent_history: list[dict[str, str]] = []
        self._max_history = 16

        # Event version để overlay.html / overlay-3d.html poll hoặc nhận SSE
        self._event_seq = 0
        self._latest_event: dict[str, Any] | None = None

        self._worker = threading.Thread(target=self._prefetch_loop, daemon=True, name="gpu-tts-prefetch")
        self._worker.start()

    # ------------------------------------------------------------------
    # Tích hợp mặc định với giong_noi.py của who-am-i
    # ------------------------------------------------------------------
    def _default_tts_adapter(self, text: str, voice_name: str, speed: float, out_path: Path) -> Path:
        """
        Gọi sang giong_noi.py nếu chạy trong repo who-am-i.
        Khi test độc lập ngoài repo, tạo file giả nhẹ để kiểm thử luồng.
        """
        try:
            import giong_noi  # type: ignore

            if hasattr(giong_noi, "vieneu_audio"):
                wav_bytes_or_path = giong_noi.vieneu_audio(text, voice=voice_name)
                if isinstance(wav_bytes_or_path, (bytes, bytearray)):
                    out_path.write_bytes(wav_bytes_or_path)
                    return out_path
                if isinstance(wav_bytes_or_path, (str, Path)) and Path(wav_bytes_or_path).exists():
                    return Path(wav_bytes_or_path)
        except ImportError:
            pass

        # Fallback an toàn khi chạy kiểm thử không có GPU/giong_noi
        out_path.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt ")
        return out_path

    def _make_cache_path(self, text: str, voice_name: str, speed: float) -> Path:
        digest = hashlib.sha1(f"{voice_name}|{speed:.2f}|{text.strip()}".encode("utf-8")).hexdigest()[:16]
        return self.cache_dir / f"tts_{digest}.wav"

    # ------------------------------------------------------------------
    # Nạp lượt thoại vào hàng đợi
    # ------------------------------------------------------------------
    def enqueue_turns(
        self,
        turns: list[dict[str, Any]],
        priority: int = PRIORITY_LIVE,
        source: str = "live",
        batch_id: str = "",
    ) -> int:
        """Đẩy 1 chuỗi lượt thoại (từ director_prompt.py hoặc tập truyện pre-gen) vào hàng đợi."""
        added = 0
        with self._lock:
            for t in turns:
                text = str(t.get("text", "")).strip()
                if not text:
                    continue
                self._seq += 1
                existing_audio = t.get("audio_path")
                has_audio = bool(existing_audio and Path(existing_audio).exists())
                item = QueuedTurn(
                    priority=priority,
                    seq=self._seq,
                    turn=dict(t),
                    batch_id=batch_id,
                    source=source,
                    audio_ready=has_audio,
                    audio_path=str(existing_audio) if has_audio else None,
                )
                heapq.heappush(self._heap, item)
                added += 1
        if added:
            self._wakeup.set()
        return added

    def load_pregen_episode(self, manifest_path: str | Path) -> int:
        """Nạp toàn bộ tập truyện đã render sẵn .wav vào hàng đợi nền (PRIORITY_STORY)."""
        p = Path(manifest_path)
        data = json.loads(p.read_text(encoding="utf-8"))
        turns = data.get("turns", [])
        ep_id = data.get("episode_id", p.stem)
        return self.enqueue_turns(turns, priority=PRIORITY_STORY, source="story", batch_id=ep_id)

    # ------------------------------------------------------------------
    # Vòng lặp nền GPU TTS Prefetch (1 luồng tuần tự duy nhất)
    # ------------------------------------------------------------------
    def _prefetch_loop(self) -> None:
        while not self._stop_event.is_set():
            item = self._pick_next_for_synthesis()
            if item is None:
                self._wakeup.wait(timeout=0.35)
                self._wakeup.clear()
                continue

            if not item.audio_ready:
                turn = item.turn
                text = str(turn.get("text", ""))
                voice = str(turn.get("voice_name", "Thiện Minh"))
                speed = float(turn.get("voice_speed", 1.0))
                target_path = self._make_cache_path(text, voice, speed)
                try:
                    if target_path.exists() and target_path.stat().st_size > 44:
                        item.audio_path = str(target_path)
                    else:
                        result_path = self.tts_fn(text, voice, speed, target_path)
                        item.audio_path = str(result_path)
                    item.audio_ready = True
                except Exception as exc:
                    item.turn["tts_error"] = str(exc)
                    item.audio_ready = True  # Vẫn cho hiển thị phụ đề im lặng để không kẹt live

            with self._lock:
                heapq.heappush(self._ready_queue, item)

    def _pick_next_for_synthesis(self) -> QueuedTurn | None:
        with self._lock:
            if not self._heap:
                return None
            # Không render trước quá xa để luôn chừa chỗ cho bình luận mới (ưu tiên cao) chen vào
            if len(self._ready_queue) >= self.prefetch_ahead and self._heap[0].priority >= PRIORITY_STORY:
                return None
            return heapq.heappop(self._heap)

    # ------------------------------------------------------------------
    # Giao tiếp với Overlay (phát từng câu + ngắt mềm)
    # ------------------------------------------------------------------
    def pop_next_for_playback(self) -> dict[str, Any] | None:
        """
        Overlay gọi khi vừa phát xong câu cũ để lấy câu tiếp theo.
        Vì _ready_queue là min-heap theo (priority, seq), câu bình luận LIVE
        sẽ tự động chen lên trước câu truyện ngay sau khi câu hiện tại kết thúc.
        """
        with self._lock:
            if self._paused or not self._ready_queue:
                self._current_playing = None
                return None

            nxt = heapq.heappop(self._ready_queue)
            self._current_playing = nxt
            self._event_seq += 1

            # Lưu lịch sử để AI nhớ ngữ cảnh
            self._recent_history.append(
                {
                    "speaker": nxt.turn.get("speaker", "bong"),
                    "text": nxt.turn.get("text", ""),
                }
            )
            if len(self._recent_history) > self._max_history:
                self._recent_history = self._recent_history[-self._max_history :]

            payload = {
                "event_seq": self._event_seq,
                "source": nxt.source,
                "priority": nxt.priority,
                "speaker": nxt.turn.get("speaker", "bong"),
                "speaker_name": nxt.turn.get("speaker_name", "Bông Đào"),
                "emotion": nxt.turn.get("emotion", "TALK"),
                "sfx": nxt.turn.get("sfx"),
                "text": nxt.turn.get("text", ""),
                "reactions": nxt.turn.get("reactions", {}),
                "pause_ms": nxt.turn.get("pause_ms", 300),
                "audio_path": nxt.audio_path,
                "audio_url": f"/api/multi/audio?file={os.path.basename(nxt.audio_path)}" if nxt.audio_path else None,
            }
            self._latest_event = payload
        self._wakeup.set()
        return payload

    def get_recent_history(self, limit: int = 8) -> list[dict[str, str]]:
        with self._lock:
            return list(self._recent_history[-limit:])

    def clear_all(self) -> None:
        """Nút 'Dừng và xóa hàng đợi' trên Bàn LIVE."""
        with self._lock:
            self._heap.clear()
            self._ready_queue.clear()
            self._current_playing = None

    def set_paused(self, paused: bool) -> None:
        with self._lock:
            self._paused = paused
        if not paused:
            self._wakeup.set()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "paused": self._paused,
                "pending_tts": len(self._heap),
                "ready_to_play": len(self._ready_queue),
                "current_speaker": self._current_playing.turn.get("speaker") if self._current_playing else None,
                "event_seq": self._event_seq,
                "latest_event": self._latest_event,
            }

    def shutdown(self) -> None:
        self._stop_event.set()
        self._wakeup.set()
        self._worker.join(timeout=2.0)


if __name__ == "__main__":
    pipe = MultiCharacterAudioPipeline(cache_dir="/tmp/test_multi_cache")
    pipe.enqueue_turns(
        [
            {"speaker": "bong", "emotion": "HAPPY", "text": "Kể chuyện tập 1 câu 1", "voice_name": "Ngọc Linh"},
            {"speaker": "rong", "emotion": "THINK", "text": "Kể chuyện tập 1 câu 2", "voice_name": "Quỳnh Anh"},
        ],
        priority=PRIORITY_STORY,
        source="story",
    )
    # Chèn bình luận LIVE ưu tiên cao hơn
    pipe.enqueue_turns(
        [{"speaker": "ho", "emotion": "ANGRY", "text": "Trả lời bình luận ngay!", "voice_name": "Thái Sơn"}],
        priority=PRIORITY_LIVE,
        source="live",
    )
    time.sleep(0.3)
    first = pipe.pop_next_for_playback()
    second = pipe.pop_next_for_playback()
    assert first is not None and first["speaker"] == "ho", f"Expected live interrupt first, got {first}"
    assert second is not None and second["speaker"] == "bong", f"Expected story resume second, got {second}"
    pipe.shutdown()
    print("OK audio_pipeline.py self-test passed!")
