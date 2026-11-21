"""Editable, channel-local rundown and its monotonic playback clock."""
from hashlib import sha256
import json
import time

from cai_dat_kenh import write_atomic
from giong_noi import Speech, VIE_VOICE
from tuong_tac import InteractionError, plain

MINUTES = 30


class Rundown:
    def __init__(self, directory, acceptable):
        self.path = directory / "tro-ly-live.json"
        self.acceptable = acceptable
        self.plan = {"topic": "", "product": "", "notes": "", "lines": [""] * MINUTES}
        if self.path.is_file():
            self.plan = self.validate(json.loads(self.path.read_text(encoding="utf-8")))
        self.mode = "stopped"
        self.elapsed = 0
        self.anchor = 0
        self.last = -1
        self.token = 0
        self.drafting = False
        self.draft_note = ""
        self.revision = 0
        self.preparing = False
        self.audio_note = ""

    def validate(self, value):
        if not isinstance(value, dict):
            raise InteractionError("Kịch bản chưa đúng định dạng.")
        plan = {k: plain(value.get(k), n) for k, n in (("topic", 200), ("product", 1800), ("notes", 3000))}
        lines = value.get("lines")
        if not isinstance(lines, list) or len(lines) != MINUTES:
            raise InteractionError("Kịch bản cần đủ 30 ô phút.")
        plan["lines"] = [plain(line, 480) for line in lines]
        if any(line and not self.acceptable(line) for line in plan["lines"]):
            raise InteractionError("Lời đọc chứa liên kết hoặc nội dung đã lọc.")
        return plan

    def save(self, plan):
        plan = self.validate(plan)
        write_atomic(self.path, json.dumps(plan, ensure_ascii=False).encode())
        self.plan = plan
        self.revision += 1
        self.audio_note = ""

    def audio_file(self, slot, text, speaker):
        data = json.dumps([speaker.engine, speaker.voice, speaker.rate, VIE_VOICE, text])
        key = sha256(data.encode()).digest()
        return self.path.parent / "tro-ly-audio" / f"{slot + 1:02d}.clip", key

    def cached(self, slot, text, speaker):
        path, key = self.audio_file(slot, text, speaker)
        try:
            with path.open("rb") as file:
                if file.read(len(key)) != key:
                    return None
                provider = file.readline(80).decode().strip()
                audio = file.read(6_000_001)
        except (OSError, UnicodeError):
            return None
        if 0 < len(audio) <= 6_000_000 and provider in ("VieNeu CUDA", "Edge TTS", "eSpeak NG"):
            return Speech(audio, "mp3" if provider == "Edge TTS" else "wav", provider)
        return None

    def cache(self, slot, text, speaker, speech):
        path, key = self.audio_file(slot, text, speaker)
        write_atomic(path, key + speech.provider.encode() + b"\n" + speech.audio)

    def clock(self):
        return self.elapsed + (time.monotonic() - self.anchor if self.mode == "running" else 0)

    def stop(self):
        self.token += 1
        self.mode = "stopped"
        self.elapsed = 0
        self.last = -1

    def control(self, op):
        if op == "stop":
            self.stop()
        elif op == "start" and self.mode in ("stopped", "done"):
            if not any(self.plan["lines"]):
                raise InteractionError("Hãy lưu ít nhất một đoạn thoại.")
            self.stop()
            self.mode = "running"
            self.anchor = time.monotonic()
        elif op == "pause" and self.mode == "running":
            self.elapsed = self.clock()
            self.mode = "paused"
            self.token += 1
        elif op == "resume" and self.mode == "paused":
            self.mode = "running"
            self.anchor = time.monotonic()
        else:
            raise InteractionError("Trạng thái kịch bản đã thay đổi. Hãy kiểm tra lại.")

    def slot(self):
        if self.mode != "running":
            return None
        minute = int(self.clock() // 60)
        if minute >= MINUTES:
            self.mode = "done"
            self.elapsed = 1800
            self.token += 1
            return None
        return minute

    def state(self):
        self.slot()
        return {"mode": self.mode, "seconds": int(self.clock()), "drafting": self.drafting,
                "note": self.draft_note, "revision": self.revision}


def generate_lines(plan, persona, ask, update):
    lines = []
    for start in range(0, MINUTES, 3):
        update(f"Đang soạn phút {start + 1}–{start + 3} trong 30 phút…")
        prompt = ("Soạn lời nói tiếng Việt cho Bông, nhân vật gián đội hoa dẫn LIVE một mình. "
                  "Mỗi phút một đoạn 240–420 ký tự, câu tự nhiên, khác nhau, có mở và kết toàn buổi. "
                  "Đan xen chuyện ngắn, ví dụ, câu hỏi gợi mở; đừng bịa bình luận hay người xem. "
                  "Nếu có sản phẩm hãy giới thiệu vừa phải, chỉ dùng thông tin người vận hành cung cấp. "
                  "Với lịch sử chỉ kể dữ kiện có trong ghi chú. Không bịa nguồn, giá hoặc ưu đãi. "
                  "Trả duy nhất mảng JSON gồm đúng 3 chuỗi lời đọc, không đánh số, không URL.")
        data = {k: plan[k] for k in ("topic", "product", "notes")}
        data.update(persona=persona, minutes=list(range(start + 1, start + 4)), previous=[s[:75] for s in lines])
        raw = ask(prompt, json.dumps(data, ensure_ascii=False)).strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.splitlines()[1:-1])
        batch = json.loads(raw)
        if not isinstance(batch, list) or len(batch) != 3 or not all(isinstance(s, str) and s.strip() for s in batch):
            raise ValueError("batch")
        lines.extend(plain(s, 480) for s in batch)
    return lines
