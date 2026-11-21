"""Local connection, speech preferences and prerecorded FAQ replies."""
from hashlib import sha256
import json
import re

from cai_dat_kenh import AUDIO_LIMIT, audio_type, write_atomic


class OperatorError(Exception):
    """An operator setting or local media error."""


class OperatorSettings:
    def __init__(self, folder, base, voices):
        self.folder = folder
        self.path = folder / "operator.json"
        self.defaults = {key: base[key] for key in ("tiktok_enabled", "tiktok_username", "voice", "voice_engine")}
        self.defaults["rate"] = 4
        self.voices = voices
        self.settings = self.defaults.copy()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            self.settings = self.validate({**self.defaults, **saved})
        except (OSError, ValueError, TypeError, OperatorError):
            pass

    def validate(self, values):
        if values.get("voice") not in self.voices or values.get("voice_engine") not in ("auto", "edge", "espeak", "vieneu"):
            raise OperatorError("Chọn giọng và phương thức đọc trong danh sách.")
        rate = values.get("rate")
        if type(rate) is not int or not -30 <= rate <= 30:
            raise OperatorError("Tốc độ đọc cần từ -30% đến +30%.")
        name = values.get("tiktok_username")
        enabled = values.get("tiktok_enabled")
        if type(enabled) is not bool or not isinstance(name, str):
            raise OperatorError("Cấu hình TikTok không hợp lệ.")
        name = name.strip().lstrip("@")
        if (enabled or name) and not re.fullmatch(r"[A-Za-z0-9_.]{2,32}", name):
            raise OperatorError("Nhập @username TikTok của chủ phòng LIVE, không điền tên hiển thị hoặc URL.")
        return {"tiktok_enabled": enabled, "tiktok_username": name, "voice": values["voice"],
                "voice_engine": values["voice_engine"], "rate": rate}

    def save(self, values):
        values = self.validate(values)
        write_atomic(self.path, json.dumps(values, ensure_ascii=False, indent=2).encode("utf-8"))
        self.settings = values

    def path_for(self, trigger, reply):
        key = sha256((trigger + "\0" + reply).encode("utf-8")).hexdigest()[:32]
        return self.folder / "faq-voice" / (key + ".audio")

    def store(self, trigger, reply, data):
        if len(data) > AUDIO_LIMIT or not audio_type(data):
            raise OperatorError("Bản thu cần là MP3 hoặc WAV tối đa 1,5 MB.")
        write_atomic(self.path_for(trigger, reply), data)

    def recording(self, trigger, reply):
        clip = self.path_for(trigger, reply)
        try:
            if not 44 <= clip.stat().st_size <= AUDIO_LIMIT:
                return None
            data = clip.read_bytes()
            return data if len(data) <= AUDIO_LIMIT and audio_type(data) else None
        except OSError:
            return None
