"""
Cầu nối điều phối livestream (Live Director Bridge) cho dự án who-am-i.

Nhiệm vụ:
1. Gom bình luận TikTok LIVE theo cửa sổ thời gian (3-5 giây) để phòng đông không bị ngộp.
2. Ưu tiên xử lý: Quà tặng (Gift) > Gọi đích danh (@ho, !tho...) > Bình luận mới nhất.
3. Gọi director_prompt.py + router_api.py để sinh chuỗi 2-3 lượt đối đáp rồi đẩy vào
   MultiCharacterAudioPipeline với độ ưu tiên cao (PRIORITY_LIVE).
4. Cung cấp các handler API sẵn sàng gắn vào app.py cho tab 'Nhân vật (4 bé)' trên
   bang-dieu-khien.html (http://127.0.0.1:8765/#live) và sân khấu overlay-3d.html.
"""

from __future__ import annotations

import json
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
        self._last_flush_at = time.time()
        self._last_activity_at = time.time()

        # Trạng thái hiển thị trực tiếp gửi sang overlay-3d.html & bang-dieu-khien.html
        self.stage_config: dict[str, Any] = {
            "fps": 30,
            "free_drag": False,
            "mirror_audio": False,
            "active_episode": None,
        }

        self._stop = threading.Event()
        self._batch_thread = threading.Thread(target=self._batch_loop, daemon=True, name="comment-batcher")
        self._batch_thread.start()

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
        # Fallback khi kiểm thử cục bộ không có 9Router
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
        """Gọi hàm này trong callback bình luận / quà tặng của TikTokLiveClient."""
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
                if self._comment_buffer and (now - self._last_flush_at >= window or any(c["gift_name"] for c in self._comment_buffer)):
                    # Chọn bình luận điểm cao nhất (ưu tiên quà tặng -> gọi đích danh -> mới nhất)
                    self._comment_buffer.sort(key=lambda x: (x["score"], x["ts"]), reverse=True)
                    picked = self._comment_buffer[0]
                    self._comment_buffer.clear()
                    self._last_flush_at = now

            if picked:
                self._process_comment(picked)

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
        return turns

    # ------------------------------------------------------------------
    # Các API Endpoint sẵn sàng nối vào app.py (POST /api/multi/<op>)
    # ------------------------------------------------------------------
    def handle_api(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Gắn trực tiếp vào handler POST /api/<operation> trong app.py.
        """
        if operation == "multi_state":
            return {
                "ok": True,
                "stage": self.stage_config,
                "characters": self.profile.get("characters", []),
                "pipeline": self.pipeline.get_status(),
            }

        if operation == "multi_update_character":
            cid = str(payload.get("id", "")).lower()
            for char in self.profile.get("characters", []):
                if char["id"] == cid:
                    if "enabled" in payload:
                        char["enabled"] = bool(payload["enabled"])
                    if "active_skin" in payload:
                        char.setdefault("renderer", {})["active_skin"] = str(payload["active_skin"])
                    if "voice_name" in payload:
                        char.setdefault("voice", {})["voice_name"] = str(payload["voice_name"])
                    if "x_ratio" in payload:
                        char.setdefault("stage", {})["x_ratio"] = float(payload["x_ratio"])
                    if "scale" in payload:
                        char.setdefault("stage", {})["scale"] = float(payload["scale"])
                    self._save_profile()
                    return {"ok": True, "character": char}
            return {"ok": False, "error": f"Không tìm thấy nhân vật '{cid}'"}

        if operation == "multi_stage_settings":
            if "fps" in payload:
                self.stage_config["fps"] = int(payload["fps"])
            if "free_drag" in payload:
                self.stage_config["free_drag"] = bool(payload["free_drag"])
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
            return {"ok": True, "loaded_turns": count}

        if operation == "multi_next_playback":
            nxt = self.pipeline.pop_next_for_playback()
            return {"ok": True, "event": nxt}

        if operation == "multi_trigger_idle":
            sys_prompt = director_prompt.build_system_prompt(self.profile)
            user_prompt = director_prompt.build_idle_prompt(self.profile, self.pipeline.get_recent_history())
            parsed = director_prompt.parse_director_response(self.llm_fn(sys_prompt, user_prompt), self.profile)
            self.pipeline.enqueue_turns(parsed.get("turns", []), priority=PRIORITY_IDLE, source="idle")
            return {"ok": True, "turns": parsed.get("turns", [])}

        return {"ok": False, "error": f"Lệnh không hỗ trợ: {operation}"}

    def _save_profile(self) -> None:
        self.profile_path.write_text(json.dumps(self.profile, ensure_ascii=False, indent=2), encoding="utf-8")

    def shutdown(self) -> None:
        self._stop.set()
        self._batch_thread.join(timeout=2.0)


if __name__ == "__main__":
    cfg = Path(__file__).with_name("kenh-1-multi.json")
    pipe = MultiCharacterAudioPipeline(cache_dir="/tmp/test_bridge_cache")
    bridge = LiveDirectorBridge(cfg, pipe)

    res = bridge.handle_api(
        "multi_test_comment",
        {"viewer_name": "Minh Anh", "comment_text": "@ho kể chuyện ma đi!", "gift_name": "Hoa hồng"},
    )
    assert res["ok"] and len(res["turns"]) >= 1
    time.sleep(0.25)
    ev = bridge.handle_api("multi_next_playback", {})
    assert ev["ok"] and ev["event"] is not None
    bridge.shutdown()
    pipe.shutdown()
    print("OK live_director_bridge.py self-test passed!")
