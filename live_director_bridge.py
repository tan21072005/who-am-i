"""
Cầu nối điều phối livestream (Live Director Bridge v2 — Chuẩn vận hành ổn định) cho who-am-i.

Nâng cấp v2:
1. Ghi cấu hình JSON nguyên tử (Atomic Write: temp file + os.replace) chống hỏng tệp khi kéo slider.
2. Hỗ trợ nút Ngắt khẩn cấp (multi_panic_stop) với stop_seq để cắt audio & animation tức thì trên OBS.
3. Hỗ trợ Preset đội hình 1 chạm (multi_apply_preset) và thông số giám sát sức khỏe (health).
4. Tích hợp SSE Event Hub (subscribe_sse / broadcast_event) để đẩy trạng thái thời gian thực (<50ms),
   vẫn tương thích 100% nếu frontend dùng polling cũ.
"""

from __future__ import annotations

import json
import os
import queue
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable

import director_prompt
from audio_pipeline import (
    MultiCharacterAudioPipeline,
    PRIORITY_IDLE,
    PRIORITY_LIVE,
    PRIORITY_MANUAL,
    PRIORITY_STORY,
)

LLMCallFunc = Callable[[str, str], str]

SCENE_PRESETS: dict[str, dict[str, dict[str, Any]]] = {
    "all4": {
        "bong": {"enabled": True, "x_ratio": 0.14, "scale": 0.92},
        "rong": {"enabled": True, "x_ratio": 0.38, "scale": 0.95},
        "ho":   {"enabled": True, "x_ratio": 0.62, "scale": 1.00},
        "tho":  {"enabled": True, "x_ratio": 0.86, "scale": 0.94},
    },
    "solo_bong": {
        "bong": {"enabled": True,  "x_ratio": 0.50, "scale": 1.08},
        "rong": {"enabled": False, "x_ratio": 0.38, "scale": 0.95},
        "ho":   {"enabled": False, "x_ratio": 0.62, "scale": 1.00},
        "tho":  {"enabled": False, "x_ratio": 0.86, "scale": 0.94},
    },
    "ho_tho": {
        "bong": {"enabled": False, "x_ratio": 0.14, "scale": 0.92},
        "rong": {"enabled": False, "x_ratio": 0.38, "scale": 0.95},
        "ho":   {"enabled": True,  "x_ratio": 0.34, "scale": 1.06},
        "tho":  {"enabled": True,  "x_ratio": 0.66, "scale": 1.02},
    },
    "trio_3d": {
        "bong": {"enabled": False, "x_ratio": 0.14, "scale": 0.92},
        "rong": {"enabled": True,  "x_ratio": 0.22, "scale": 0.98},
        "ho":   {"enabled": True,  "x_ratio": 0.50, "scale": 1.02},
        "tho":  {"enabled": True,  "x_ratio": 0.78, "scale": 0.98},
    },
}


class LiveDirectorBridge:
    def __init__(
        self,
        profile_path: str | Path,
        pipeline: MultiCharacterAudioPipeline,
        llm_fn: LLMCallFunc | None = None,
    ) -> None:
        self.profile_path = Path(profile_path)
        self.profile: dict[str, Any] = json.loads(self.profile_path.read_text(encoding="utf-8"))
        self.pipeline = pipeline
        self.llm_fn = llm_fn or self._default_router_adapter

        self._lock = threading.Lock()
        self._comment_buffer: list[dict[str, Any]] = []
        self._started_at = time.time()
        self._last_flush_at = time.time()
        self._last_activity_at = time.time()
        self._last_error: str | None = None
        self._stop_seq = 0
        self._sse_subscribers: list[queue.Queue[str]] = []

        self.stage_config: dict[str, Any] = {
            "fps": 30,
            "free_drag": False,
            "mirror_audio": False,
            "active_episode": None,
            "active_preset": "all4",
            "stop_seq": 0,
        }

        self._stop = threading.Event()
        self._batch_thread = threading.Thread(target=self._batch_loop, daemon=True, name="comment-batcher")
        self._batch_thread.start()

    # ------------------------------------------------------------------
    # SSE Real-Time Event Hub (tùy chọn nối GET /api/multi/events trong app.py)
    # ------------------------------------------------------------------
    def subscribe_sse(self) -> queue.Queue[str]:
        q: queue.Queue[str] = queue.Queue(maxsize=32)
        with self._lock:
            self._sse_subscribers.append(q)
        return q

    def unsubscribe_sse(self, q: queue.Queue[str]) -> None:
        with self._lock:
            if q in self._sse_subscribers:
                self._sse_subscribers.remove(q)

    def broadcast_event(self, event_type: str, data: dict[str, Any]) -> None:
        payload = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        with self._lock:
            dead: list[queue.Queue[str]] = []
            for q in self._sse_subscribers:
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                self._sse_subscribers.remove(q)

    # ------------------------------------------------------------------
    # Kết nối mặc định với router_api.py trong who-am-i
    # ------------------------------------------------------------------
    def _default_router_adapter(self, system_prompt: str, user_prompt: str) -> str:
        try:
            import router_api  # type: ignore

            if hasattr(router_api, "ask_router"):
                return str(router_api.ask_router(system_prompt=system_prompt, user_prompt=user_prompt))
        except ImportError:
            pass
        except Exception as exc:
            self._last_error = f"LLM Router: {exc}"
        return json.dumps(
            {
                "topic_summary": "Phản hồi thử nghiệm",
                "turns": [
                    {
                        "speaker": "tho",
                        "emotion": "HAPPY",
                        "text": "Chào bạn nha! Cả nhóm vừa đọc được bình luận của bạn rồi nè!",
                        "reactions": {"bong": "WAVE", "rong": "HAPPY"},
                        "pause_ms": 300,
                    },
                    {
                        "speaker": "ho",
                        "emotion": "THINK",
                        "text": "Gì mà ồn ào thế, nhưng mà cảm ơn bạn đã ghé phòng live nha!",
                        "reactions": {"tho": "LAUGH"},
                        "pause_ms": 350,
                    },
                ],
            },
            ensure_ascii=False,
        )

    # ------------------------------------------------------------------
    # Nhận sự kiện từ TikTokLiveClient (app.py / tuong_tac.py)
    # ------------------------------------------------------------------
    def on_tiktok_comment(self, viewer_name: str, comment_text: str, gift_name: str | None = None) -> None:
        mentioned = director_prompt.detect_mentioned_characters(comment_text, self.profile)
        score = 100 if gift_name else (50 if mentioned else 10)
        with self._lock:
            self._comment_buffer.append(
                {
                    "viewer_name": viewer_name,
                    "comment_text": comment_text,
                    "gift_name": gift_name,
                    "mentioned": mentioned,
                    "score": score,
                    "ts": time.time(),
                }
            )
            self._last_activity_at = time.time()

    def _batch_loop(self) -> None:
        window = float(self.profile.get("director", {}).get("comment_batch_seconds", 4))
        while not self._stop.is_set():
            time.sleep(0.4)
            now = time.time()
            picked: dict[str, Any] | None = None
            with self._lock:
                if self._comment_buffer and (
                    now - self._last_flush_at >= window or any(c["gift_name"] for c in self._comment_buffer)
                ):
                    self._comment_buffer.sort(key=lambda x: (x["score"], x["ts"]), reverse=True)
                    picked = self._comment_buffer[0]
                    self._comment_buffer.clear()
                    self._last_flush_at = now

            if picked:
                try:
                    self._process_comment(picked)
                except Exception as exc:
                    self._last_error = f"Batch error: {exc}"

    def _process_comment(self, item: dict[str, Any]) -> list[dict[str, Any]]:
        sys_prompt = director_prompt.build_system_prompt(self.profile)
        user_prompt = director_prompt.build_comment_prompt(
            self.profile,
            viewer_name=item["viewer_name"],
            comment_text=item["comment_text"],
            gift_name=item.get("gift_name"),
            recent_turns=self.pipeline.get_recent_history(),
        )
        raw = self.llm_fn(sys_prompt, user_prompt)
        parsed = director_prompt.parse_director_response(raw, self.profile)
        turns = parsed.get("turns", [])
        self.pipeline.enqueue_turns(turns, priority=PRIORITY_LIVE, source="live")
        self.broadcast_event("state", self._build_state_payload())
        return turns

    def _build_health_payload(self) -> dict[str, Any]:
        pipe_status = self.pipeline.get_status()
        with self._lock:
            buffer_len = len(self._comment_buffer)
            last_err = self._last_error
        pending = int(pipe_status.get("pending_tts", pipe_status.get("pending_count", 0)))
        ready = int(pipe_status.get("ready_to_play", pipe_status.get("ready_count", 0)))
        return {
            "ok": True,
            "uptime_sec": int(time.time() - self._started_at),
            "buffer_comments": buffer_len,
            "queue_pending": pending,
            "queue_ready": ready,
            "queue_total": pending + ready,
            "stop_seq": self._stop_seq,
            "last_error": last_err,
            "sse_clients": len(self._sse_subscribers),
        }

    def _build_state_payload(self) -> dict[str, Any]:
        return {
            "ok": True,
            "stage": self.stage_config,
            "characters": self.profile.get("characters", []),
            "pipeline": self.pipeline.get_status(),
            "health": self._build_health_payload(),
        }

    # ------------------------------------------------------------------
    # Các API Endpoint nối vào app.py (POST /api/multi_*)
    # ------------------------------------------------------------------
    def handle_api(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        if operation == "multi_state":
            return self._build_state_payload()

        if operation == "multi_health":
            return self._build_health_payload()

        if operation == "multi_panic_stop":
            with self._lock:
                self._comment_buffer.clear()
                self._stop_seq += 1
                self.stage_config["stop_seq"] = self._stop_seq
                self._last_error = None
            if hasattr(self.pipeline, "clear_all"):
                self.pipeline.clear_all()
            self.broadcast_event("panic_stop", {"stop_seq": self._stop_seq})
            return {"ok": True, "stop_seq": self._stop_seq, "health": self._build_health_payload()}

        if operation == "multi_apply_preset":
            preset_id = str(payload.get("preset", "all4")).strip()
            preset = SCENE_PRESETS.get(preset_id)
            if not preset:
                return {"ok": False, "error": f"Không tìm thấy preset '{preset_id}'"}
            with self._lock:
                for char in self.profile.get("characters", []):
                    rule = preset.get(char["id"])
                    if rule:
                        char["enabled"] = bool(rule["enabled"])
                        char.setdefault("stage", {})["x_ratio"] = float(rule["x_ratio"])
                        char.setdefault("stage", {})["scale"] = float(rule["scale"])
                self.stage_config["active_preset"] = preset_id
                self._save_profile_unlocked()
            state_out = self._build_state_payload()
            self.broadcast_event("state", state_out)
            return state_out

        if operation == "multi_update_character":
            cid = str(payload.get("id", "")).lower()
            updated = None
            with self._lock:
                for char in self.profile.get("characters", []):
                    if char["id"] == cid:
                        if "enabled" in payload:
                            char["enabled"] = bool(payload["enabled"])
                        if "active_skin" in payload:
                            char.setdefault("renderer", {})["active_skin"] = str(payload["active_skin"])
                        if "voice_name" in payload:
                            char.setdefault("voice", {})["voice_name"] = str(payload["voice_name"])
                        if "x_ratio" in payload:
                            char.setdefault("stage", {})["x_ratio"] = max(0.02, min(0.98, float(payload["x_ratio"])))
                        if "scale" in payload:
                            char.setdefault("stage", {})["scale"] = max(0.55, min(1.4, float(payload["scale"])))
                        self.stage_config["active_preset"] = "custom"
                        self._save_profile_unlocked()
                        updated = char
                        break
            if updated is None:
                return {"ok": False, "error": f"Không tìm thấy nhân vật '{cid}'"}
            self.broadcast_event("state", self._build_state_payload())
            return {"ok": True, "character": updated}

        if operation == "multi_stage_settings":
            with self._lock:
                if "fps" in payload:
                    self.stage_config["fps"] = int(payload["fps"])
                if "free_drag" in payload:
                    self.stage_config["free_drag"] = bool(payload["free_drag"])
            self.broadcast_event("state", self._build_state_payload())
            return {"ok": True, "stage": self.stage_config}

        if operation == "multi_trigger_action":
            cid = str(payload.get("speaker", "bong")).lower()
            emo = str(payload.get("emotion", "WAVE")).upper()
            text = str(payload.get("text", "")).strip() or "Chào cả nhà nha!"
            char_map = {c["id"]: c for c in self.profile.get("characters", [])}
            cfg = char_map.get(cid, self.profile["characters"][0])
            v = cfg.get("voice", {})
            turn = {
                "speaker": cfg["id"],
                "speaker_name": cfg["name"],
                "emotion": emo,
                "sfx": emo if emo in director_prompt.SFX_EMOTIONS else None,
                "text": text,
                "reactions": {},
                "pause_ms": 300,
                "voice_name": v.get("voice_name", "Thiện Minh"),
                "voice_speed": float(v.get("speed", 1.0)),
            }
            self.pipeline.enqueue_turns([turn], priority=PRIORITY_MANUAL, source="manual")
            self.broadcast_event("state", self._build_state_payload())
            return {"ok": True, "queued": turn}

        if operation == "multi_test_comment":
            viewer = str(payload.get("viewer_name", "Khán giả"))
            comment = str(payload.get("comment_text", "")).strip()
            gift = payload.get("gift_name")
            turns = self._process_comment({"viewer_name": viewer, "comment_text": comment, "gift_name": gift})
            return {"ok": True, "turns": turns}

        if operation == "multi_load_episode":
            manifest = Path(str(payload.get("manifest_path", "")))
            if not manifest.exists():
                return {"ok": False, "error": f"Không tìm thấy tệp {manifest}"}
            count = self.pipeline.load_pregen_episode(manifest)
            self.stage_config["active_episode"] = manifest.parent.name
            self.broadcast_event("state", self._build_state_payload())
            return {"ok": True, "loaded_turns": count}

        if operation == "multi_next_playback":
            nxt = self.pipeline.pop_next_for_playback()
            return {"ok": True, "event": nxt, "stop_seq": self._stop_seq}

        if operation == "multi_trigger_idle":
            sys_prompt = director_prompt.build_system_prompt(self.profile)
            user_prompt = director_prompt.build_idle_prompt(self.profile, self.pipeline.get_recent_history())
            parsed = director_prompt.parse_director_response(self.llm_fn(sys_prompt, user_prompt), self.profile)
            turns = parsed.get("turns", [])
            self.pipeline.enqueue_turns(turns, priority=PRIORITY_IDLE, source="idle")
            self.broadcast_event("state", self._build_state_payload())
            return {"ok": True, "turns": turns}

        return {"ok": False, "error": f"Lệnh không hỗ trợ: {operation}"}

    def _save_profile_unlocked(self) -> None:
        """Ghi file nguyên tử (atomic write) để tránh hỏng JSON khi nhiều thao tác diễn ra liên tiếp."""
        parent = self.profile_path.parent
        parent.mkdir(parents=True, exist_ok=True)
        content = json.dumps(self.profile, ensure_ascii=False, indent=2)
        fd, tmp_name = tempfile.mkstemp(prefix=".profile_", suffix=".tmp", dir=str(parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
                tmp_f.write(content)
                tmp_f.flush()
                os.fsync(tmp_f.fileno())
            os.replace(tmp_name, self.profile_path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    def shutdown(self) -> None:
        self._stop.set()
        self._batch_thread.join(timeout=2.0)
