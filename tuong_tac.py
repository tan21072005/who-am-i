"""Per-channel knowledge, action rules, votes and music."""
from collections import deque
from copy import deepcopy
from hashlib import blake2b
import json
import re
import secrets
import time
import unicodedata

from cai_dat_kenh import audio_type, write_atomic

MUSIC_LIMIT = 10_000_000
SLOTS = ("A", "B")
AUDIENCE = ("join", "follow", "share", "like")
REPLY_LENGTHS = {"short": 180, "normal": 320, "long": 480}
MAX_REPLY_TEXT = max(REPLY_LENGTHS.values())
PREFERENCES = {"lofi": "thích nhạc Lofi", "vui": "thích nhạc sôi động"}
DEFAULTS = {
    "profile": "", "faq": [], "ai_actions": True, "fixed_action": "TALK",
    "commands_on": True, "commands": [
        {"trigger": "!tim", "action": "LOVE"},
        {"trigger": "!bay", "action": "FLY"},
        {"trigger": "!chao", "action": "WAVE"},
    ],
    "announce_results": True, "gifts_on": False, "gifts": [
        {"trigger": "Hoa hồng", "action": "LOVE", "reply": "Bông cảm ơn bạn đã tặng hoa!"},
    ],
    "cooldown": 8, "duration": 30, "goal": 5,
    "a_title": "Lofi", "b_title": "Sôi động", "volume": 24,
    "scene_a": "WINGS", "scene_b": "SHOCK",
    "memory_on": False, "memory_context": False, "join_on": False, "follow_on": False, "share_on": False,
    "join_action": "WAVE", "follow_action": "LOVE", "share_action": "BOW",
    "join_text": "Bông chào {name}, chúc bạn xem live vui nhé!",
    "return_text": "Bông chào mừng {name} quay lại!",
    "follow_text": "Bông cảm ơn {name} đã theo dõi!",
    "share_text": "Bông cảm ơn {name} đã chia sẻ buổi live!",
    "like_on": False, "like_action": "LOVE", "like_cooldown": 30,
    "like_text": "Bông cảm ơn {name} đã thả tim!",
    "reply_length": "normal", "reply_language": "auto", "idle_on": False, "idle_seconds": 45, "idle_script": "",
}


class InteractionError(Exception):
    """An invalid interaction setting or operation."""


def normalized(value):
    text = unicodedata.normalize("NFC", str(value)).casefold()
    return " ".join(text.split())


def plain(value, limit):
    if not isinstance(value, str) or len(value) > limit:
        raise InteractionError(f"Nội dung phải là văn bản tối đa {limit} ký tự.")
    return " ".join(value.split())


class Interaction:
    def __init__(self, directory, actions, acceptable):
        self.directory = directory
        self.path = directory / "interactions.json"
        self.actions = actions
        self.acceptable = acceptable
        self.settings = deepcopy(DEFAULTS)
        if self.path.is_file():
            try:
                saved = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(saved, dict):
                    self.settings = self.validate({**self.settings, **saved})
            except (OSError, ValueError, InteractionError):
                pass
        self.poll = None
        self.message = None
        self.playing = None
        self.music_seq = 0
        self.cooldowns = {}
        self.gift_ids = deque(maxlen=512)
        self.audience_ids = deque(maxlen=512)
        self.next_greeting = 0
        self.next_like = 0
        self.memory = ViewerMemory(directory / "viewer-memory.json")
        self.tracks = {slot: self.track_info(slot) for slot in SLOTS}

    def validate(self, values):
        if not isinstance(values, dict):
            raise InteractionError("Cài đặt không hợp lệ.")
        result = {}
        for key in ("ai_actions", "commands_on", "gifts_on", "announce_results", "memory_on", "memory_context",
                    "join_on", "follow_on", "share_on", "like_on", "idle_on"):
            if type(values.get(key)) is not bool:
                raise InteractionError("Trạng thái bật/tắt không hợp lệ.")
            result[key] = values[key]
        for key, low, high in (("cooldown", 2, 60), ("duration", 10, 120), ("goal", 1, 100), ("volume", 0, 100),
                               ("like_cooldown", 5, 300), ("idle_seconds", 15, 600)):
            value = values.get(key)
            if type(value) is not int or not low <= value <= high:
                raise InteractionError(f"{key} phải từ {low} đến {high}.")
            result[key] = value
        for key in ("fixed_action", "scene_a", "scene_b", "join_action", "follow_action", "share_action", "like_action"):
            if values.get(key) not in self.actions:
                raise InteractionError("Chọn một động tác có sẵn.")
            result[key] = values[key]
        for key in ("join_text", "return_text", "follow_text", "share_text", "like_text"):
            line = plain(values.get(key), 150)
            if line and not self.acceptable(line.replace("{name}", "bạn")):
                raise InteractionError("Lời chào cần là câu ngắn, không kèm link hay dữ liệu nhạy cảm.")
            result[key] = line
        result["profile"] = plain(values.get("profile"), 900)
        length = values.get("reply_length")
        if not isinstance(length, str) or length not in REPLY_LENGTHS:
            raise InteractionError("Chọn độ dài câu trả lời có sẵn.")
        result["reply_length"] = length
        reply_lang = values.get("reply_language", "auto")
        if reply_lang not in ("auto", "vi", "en"):
            raise InteractionError("Ngôn ngữ trả lời phải là auto, vi hoặc en.")
        result["reply_language"] = reply_lang
        script = values.get("idle_script")
        if not isinstance(script, str) or len(script) > 2000:
            raise InteractionError("Lời tự trò chuyện tối đa 2.000 ký tự.")
        lines = [plain(line, MAX_REPLY_TEXT) for line in script.splitlines() if line.strip()]
        if any(not self.acceptable(line) for line in lines):
            raise InteractionError("Lời tự trò chuyện không được kèm liên kết hoặc nội dung đã lọc.")
        result["idle_script"] = "\n".join(lines)
        for key in ("a_title", "b_title"):
            result[key] = plain(values.get(key), 36)
            if not result[key]:
                raise InteractionError("Hãy đặt tên hai lựa chọn nhạc.")
        for key, limit in (("faq", 30), ("commands", 18), ("gifts", 40)):
            records = values.get(key)
            if not isinstance(records, list) or len(records) > limit:
                raise InteractionError(f"Mục {key} tối đa {limit} dòng.")
            rows = []
            seen = set()
            for record in records:
                if not isinstance(record, dict):
                    raise InteractionError("Dòng cài đặt không hợp lệ.")
                trigger = plain(record.get("trigger"), 90)
                lookup = normalized(trigger)
                if not trigger or lookup in seen:
                    raise InteractionError("Điền từ khóa và tránh trùng trong cùng danh sách.")
                seen.add(lookup)
                row = {"trigger": trigger}
                if key == "commands" and not re.fullmatch(r"![\w-]{1,25}", lookup):
                    raise InteractionError("Lệnh cần bắt đầu bằng ! và không có dấu cách.")
                if key != "faq":
                    if record.get("action") not in self.actions:
                        raise InteractionError("Động tác trong bảng luật không hợp lệ.")
                    row["action"] = record["action"]
                if key != "commands":
                    line = plain(record.get("reply", ""), 180)
                    if (key == "faq" and not line) or (line and not self.acceptable(line)):
                        raise InteractionError("Kiểm tra lời thoại. Dùng câu ngắn, không kèm link hoặc dữ liệu nhạy cảm.")
                    row["reply"] = line
                rows.append(row)
            result[key] = rows
        return result

    def save(self, values):
        if not isinstance(values, dict):
            raise InteractionError("Cài đặt không hợp lệ.")
        values = self.validate({**self.settings, **values})
        write_atomic(self.path, json.dumps(values, ensure_ascii=False, indent=2).encode("utf-8"))
        self.settings = values

    def faq_match(self, comment):
        comment = normalized(comment)
        candidates = sorted(self.settings["faq"], key=lambda row: len(row["trigger"]), reverse=True)
        for row in candidates:
            terms = normalized(row["trigger"])
            if re.search(r"(?<!\w)" + re.escape(terms) + r"(?!\w)", comment):
                return row
        return None

    def allow(self, group, user):
        now = time.monotonic()
        wait = self.settings["cooldown"]
        key = group, user
        if now - self.cooldowns.get(key, -100) < wait:
            return False
        if len(self.cooldowns) >= 1000:
            self.cooldowns = {key: at for key, at in self.cooldowns.items() if now - at < wait}
            if len(self.cooldowns) >= 1000:
                return False
        self.cooldowns[key] = now
        return True

    def gift(self, user, gift_id, name, event_id):
        if not self.settings["gifts_on"]:
            return None
        keys = [normalized(value) for value in (gift_id, name) if value]
        rows = {normalized(row["trigger"]): row for row in self.settings["gifts"]}
        match = next((rows[key] for key in keys if key in rows), None)
        if not match or (event_id and event_id in self.gift_ids) or not self.allow("gift", user):
            return None
        if event_id:
            self.gift_ids.append(event_id)
        return match

    def command(self, user, value):
        if not value.startswith("!") or not self.settings["commands_on"]:
            return False, None
        for rule in self.settings["commands"]:
            if normalized(rule["trigger"]) == value:
                return True, rule["action"] if self.allow("command", user) else None
        return False, None

    def audience(self, kind, identity, event_id, returning):
        if kind not in AUDIENCE or not self.settings[kind + "_on"]:
            return None
        if event_id:
            if event_id in self.audience_ids:
                return None
            self.audience_ids.append(event_id)
        now = time.monotonic()
        if kind == "like" and now < self.next_like:
            return None
        if now < self.next_greeting or not self.allow(kind, identity):
            return None
        self.next_greeting = now + self.settings["cooldown"]
        if kind == "like":
            self.next_like = now + self.settings["like_cooldown"]
        line = "return_text" if kind == "join" and returning and self.settings["return_text"] else kind + "_text"
        return self.settings[kind + "_action"], self.settings[line]

    def start(self, kind):
        if kind not in ("music", "scene", "flight"):
            raise InteractionError("Vòng chơi không hợp lệ.")
        if self.poll:
            raise InteractionError("Hãy kết thúc vòng hiện tại trước.")
        if kind == "music" and not all(self.tracks.values()):
            raise InteractionError("Hãy nạp nhạc cho cả A và B trước.")
        self.poll = {
            "kind": kind, "expires": time.monotonic() + self.settings["duration"], "voters": {},
            "title": {"music": "Chọn nhạc cho Bông", "scene": "Chọn động tác tiếp theo", "flight": "Cả phòng gọi Bông bay"}[kind],
            "a": self.settings["a_title"] if kind == "music" else self.settings["scene_a"],
            "b": self.settings["b_title"] if kind == "music" else self.settings["scene_b"],
            "goal": self.settings["goal"],
        }
        self.message = None

    def vote(self, user, value):
        if self.poll is None:
            return False
        flight = self.poll["kind"] == "flight"
        valid = ("!bay",) if flight else ("a", "b")
        if value not in valid:
            return False
        voters = self.poll["voters"]
        if len(voters) < 5000:
            voters.setdefault(user, value)
        return True

    def say(self, text):
        self.message = (text, time.monotonic() + 7)

    def finish(self, actions_labels):
        poll = self.poll
        if poll is None:
            return None
        votes = list(poll["voters"].values())
        won_flight = poll["kind"] == "flight" and len(votes) >= poll["goal"]
        if not won_flight and time.monotonic() < poll["expires"]:
            return None
        self.poll = None
        if poll["kind"] == "flight":
            self.say("Đủ lượt! Bông bay nào!" if won_flight else "Hết giờ, cả phòng thử lại ở vòng sau nhé!")
            return "FLY" if won_flight else None
        a, b = votes.count("a"), votes.count("b")
        if a == b:
            self.say("Hòa phiếu" if a else "Vòng này chưa có phiếu")
            return None
        slot = "A" if a > b else "B"
        choice = poll[slot.lower()]
        if poll["kind"] == "music":
            self.play_music(slot)
            self.say("Nhạc thắng cuộc · " + choice)
            return "HAPPY"
        self.say("Động tác thắng cuộc · " + actions_labels[choice])
        return choice

    def track_path(self, slot):
        return self.directory / f"music-{slot}.audio"

    def track_info(self, slot):
        try:
            stat = self.track_path(slot).stat()
            return str(stat.st_mtime_ns) if 44 <= stat.st_size <= MUSIC_LIMIT else None
        except OSError:
            return None

    def upload(self, slot, data):
        if slot not in SLOTS or len(data) > MUSIC_LIMIT or not audio_type(data):
            raise InteractionError("Chọn MP3 hoặc WAV tối đa 10 MB.")
        write_atomic(self.track_path(slot), data)
        self.tracks[slot] = self.track_info(slot)
        if self.playing == slot:
            self.music_seq += 1

    def play_music(self, slot):
        if slot is not None and (slot not in SLOTS or not self.tracks[slot]):
            raise InteractionError("Chưa có file nhạc cho lựa chọn này.")
        self.playing = slot
        self.music_seq += 1

    def public(self, labels, quiet=False):
        now = time.monotonic()
        result = {
            "message": self.message[0] if self.message and self.message[1] > now else "",
            "poll": None, "music": None,
        }
        if self.playing and not quiet:
            result["music"] = {
                "url": f"/music/{self.playing}?v={self.tracks[self.playing]}&s={self.music_seq}",
                "volume": self.settings["volume"] / 100,
                "title": self.settings[self.playing.lower() + "_title"],
            }
        if self.poll:
            poll = self.poll
            votes = list(poll["voters"].values())
            scene = poll["kind"] == "scene"
            result["poll"] = {
                "kind": poll["kind"], "title": poll["title"],
                "seconds": max(0, int(poll["expires"] - now + .99)),
                "aTitle": labels[poll["a"]] if scene else poll["a"],
                "bTitle": labels[poll["b"]] if scene else poll["b"],
                "a": votes.count("a"), "b": votes.count("b"),
                "total": len(votes), "goal": poll["goal"],
            }
        return result


class ViewerMemory:
    """Short local records keyed by a channel-specific digest. No raw IDs or chat."""
    retention = 30 * 86400
    capacity = 1000

    def __init__(self, path):
        self.path = path
        self.salt = secrets.token_bytes(16)
        self.records = {}
        self.changed = False
        self.last_write = time.monotonic()
        if path.is_file():
            try:
                stored = json.loads(path.read_text(encoding="utf-8"))
                salt = bytes.fromhex(stored["salt"])
                if len(salt) == 16 and isinstance(stored["records"], dict):
                    self.salt = salt
                    self.records = {key: value for key, value in stored["records"].items()
                                    if isinstance(value, dict) and type(value.get("at")) is int}
            except (OSError, ValueError, KeyError, TypeError):
                pass

    def _write(self):
        self.cut()
        write_atomic(self.path, json.dumps({"salt": self.salt.hex(), "records": self.records}).encode("utf-8"))
        self.changed = False
        self.last_write = time.monotonic()

    def flush(self):
        if self.changed and time.monotonic() - self.last_write >= 15:
            self._write()

    def cut(self):
        cutoff = int(time.time()) - self.retention
        keep = [(key, value) for key, value in self.records.items() if value["at"] > cutoff]
        self.records = dict(sorted(keep, key=lambda item: item[1]["at"])[-self.capacity:])

    def _key(self, identity):
        return blake2b(identity.encode("utf-8"), key=self.salt, digest_size=16).hexdigest()

    def record(self, identity):
        key = self._key(identity)
        now = int(time.time())
        old = self.records.get(key)
        if old and old["at"] <= now - self.retention:
            old = None
        if old and old.get("off"):
            return False
        if not old or now - old["at"] >= 86400:
            self.records[key] = {**(old or {}), "at": now}
            self.changed = True
            if len(self.records) > self.capacity:
                self.cut()
            self.flush()
        return bool(old)

    def preference(self, identity, value):
        self.records[self._key(identity)] = {"at": int(time.time()), "preference": value}
        self._write()

    def forget(self, identity):
        self.records[self._key(identity)] = {"at": int(time.time()), "off": True}
        self._write()

    def context(self, identity):
        value = self.records.get(self._key(identity), {})
        return PREFERENCES.get(value.get("preference"), "") if value.get("at", 0) > time.time() - self.retention else ""

    def clear(self):
        self.path.unlink(missing_ok=True)
        self.records.clear()
        self.changed = False
        self.salt = secrets.token_bytes(16)

    def count(self):
        self.cut()
        return sum(not value.get("off") for value in self.records.values())
