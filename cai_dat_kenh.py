"""Per-channel presentation preferences and audio file storage."""
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

AUDIO_LIMIT = 1_500_000
MODES = ("normal", "light")
MIME = {".wav": "audio/wav", ".mp3": "audio/mpeg"}


def audio_type(data):
    if len(data) < 44:
        return None
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return MIME[".wav"]
    if data.startswith(b"ID3") or (data[0] == 0xff and data[1] & 0xe0 == 0xe0):
        return MIME[".mp3"]
    return None


def write_atomic(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as file:
            temp = Path(file.name)
            file.write(content)
        os.replace(temp, path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


class Presentation:
    def __init__(self, directory, shared_effects, built_in, actions):
        self.directory = directory
        self.shared_effects = shared_effects
        self.built_in = built_in
        self.actions = actions
        self.settings = directory / "settings.json"
        self.mode = "normal"
        self.volumes = {}
        if self.settings.is_file():
            try:
                data = json.loads(self.settings.read_text(encoding="utf-8"))
                mode = data.get("mode")
                if mode in MODES:
                    self.mode = mode
                self.volumes = {
                    action: volume for action, volume in data.get("volumes", {}).items()
                    if action in actions and type(volume) is int and 0 <= volume <= 100
                }
            except (AttributeError, OSError, ValueError):
                pass

    def set(self, *, mode=None, action=None, volume=None):
        next_mode = self.mode if mode is None else mode
        next_volumes = self.volumes.copy()
        if action is not None:
            next_volumes[action] = volume
        data = {"mode": next_mode, "volumes": next_volumes}
        write_atomic(self.settings, json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
        self.mode, self.volumes = next_mode, next_volumes

    def custom(self, action):
        return self.directory / f"{action}.audio"

    def clip(self, action):
        candidates = [self.custom(action), self.shared_effects / f"{action}.wav", self.shared_effects / f"{action}.mp3"]
        for path in candidates:
            try:
                if not 44 <= path.stat().st_size <= AUDIO_LIMIT:
                    continue
                data = path.read_bytes()
            except OSError:
                continue
            mime = audio_type(data)
            if mime and len(data) <= AUDIO_LIMIT:
                return mime, data
        return None

    def source(self, action):
        if self.custom(action).is_file():
            return "custom"
        if any((self.shared_effects / f"{action}{ext}").is_file() for ext in MIME):
            return "shared"
        return "bundled" if action in self.built_in else "none"

    def gain(self, action):
        return self.volumes.get(action, 100) / 100

    def snapshot(self):
        return {
            "mode": self.mode,
            "sounds": {action: {"source": self.source(action), "volume": self.volumes.get(action, 100)}
                       for action in self.actions},
        }

    def upload(self, action, data):
        write_atomic(self.custom(action), data)

    def restore(self, action):
        self.custom(action).unlink(missing_ok=True)
