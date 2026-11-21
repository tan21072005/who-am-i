"""
Bộ điều phối hội thoại đa nhân vật (Conversation Director) cho dự án who-am-i.
Tương thích với:
- profiles/kenh-1-multi.json (cấu hình 4 nhân vật)
- router_api.py (9Router OpenAI-compatible / Gemini)
- nhan-vat.js (18 trạng thái biểu cảm)
- hieu-ung.js (8 hiệu ứng âm thanh đi kèm cảm xúc)
- giong_noi.py (VieNeu GPU TTS theo từng voice_name)
"""

from __future__ import annotations

import json
import re
from typing import Any

# 18 trạng thái hợp lệ trong nhan-vat.js
VALID_EMOTIONS: tuple[str, ...] = (
    "IDLE",
    "TALK",
    "WAVE",
    "LAUGH",
    "THINK",
    "SHOCK",
    "LOVE",
    "SHY",
    "ANGRY",
    "SAD",
    "LIKE",
    "BOW",
    "TIRED",
    "POINT",
    "SCARED",
    "HAPPY",
    "WINGS",
    "FLY",
)

# 8 cảm xúc có sẵn hiệu ứng âm thanh trong hieu-ung.js
SFX_EMOTIONS: frozenset[str] = frozenset(
    {"LAUGH", "SAD", "TIRED", "SHOCK", "SCARED", "HAPPY", "WINGS", "FLY"}
)

# JSON Schema dùng cho response_format (9Router / OpenAI-compatible / Gemini)
DIALOGUE_JSON_SCHEMA: dict[str, Any] = {
    "name": "multi_character_dialogue",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "topic_summary": {
                "type": "string",
                "description": "Tóm tắt cực ngắn (<= 10 từ) ý chính của đoạn đối đáp này.",
            },
            "turns": {
                "type": "array",
                "minItems": 1,
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "properties": {
                        "speaker": {
                            "type": "string",
                            "description": "ID nhân vật phát ngôn (bong, rong, ho, tho).",
                        },
                        "emotion": {
                            "type": "string",
                            "enum": list(VALID_EMOTIONS),
                            "description": "Biểu cảm chính của nhân vật khi nói câu này.",
                        },
                        "text": {
                            "type": "string",
                            "description": "Lời thoại tiếng Việt tự nhiên để đọc bằng TTS, không chứa emoji hay markdown.",
                        },
                        "reactions": {
                            "type": "object",
                            "description": "Biểu cảm phụ (tuỳ chọn) cho 1-2 nhân vật đang nghe, dạng {character_id: emotion}.",
                            "additionalProperties": {
                                "type": "string",
                                "enum": list(VALID_EMOTIONS),
                            },
                        },
                        "pause_ms": {
                            "type": "integer",
                            "minimum": 150,
                            "maximum": 1200,
                            "description": "Khoảng nghỉ (ms) sau câu này trước khi nhân vật kế tiếp nói.",
                        },
                    },
                    "required": ["speaker", "emotion", "text", "reactions", "pause_ms"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["topic_summary", "turns"],
        "additionalProperties": False,
    },
}


def get_enabled_characters(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Lấy danh sách các nhân vật đang bật trong cấu hình kênh."""
    return [c for c in profile.get("characters", []) if c.get("enabled", True)]


def detect_mentioned_characters(text: str, profile: dict[str, Any]) -> list[str]:
    """Phát hiện khán giả có gọi đích danh nhân vật nào qua alias/lệnh (!ho, @tho, bé rồng...)."""
    lowered = text.lower()
    matched: list[str] = []
    for char in get_enabled_characters(profile):
        cid = char["id"]
        aliases = [a.lower() for a in char.get("aliases", [])]
        for alias in aliases:
            if not alias:
                continue
            pattern = rf"(?<!\w){re.escape(alias)}(?!\w)"
            if re.search(pattern, lowered):
                if cid not in matched:
                    matched.append(cid)
                break
    return matched


def build_system_prompt(profile: dict[str, Any]) -> str:
    """
    Tạo System Prompt động từ kenh-1-multi.json.
    Khi thêm/tắt nhân vật hoặc sửa tính cách trong JSON, prompt tự cập nhật theo.
    """
    chars = get_enabled_characters(profile)
    director_cfg = profile.get("director", {})
    max_words = director_cfg.get("max_words_per_turn", 28)

    char_blocks: list[str] = []
    for c in chars:
        p = c.get("persona", {})
        rels = p.get("relationships", {})
        rel_str = "; ".join(f"với {k}: {v}" for k, v in rels.items())
        traits = ", ".join(p.get("traits", []))
        prefs = ", ".join(c.get("preferred_emotions", ["HAPPY", "TALK"]))
        catch = " / ".join(p.get("catchphrases", []))
        char_blocks.append(
            f"- ID `{c['id']}` ({c['name']}): {c.get('role', '')}\n"
            f"  + Xưng hô: tự xưng '{p.get('pronoun_self', c['short_name'])}', gọi khán giả '{p.get('pronoun_audience', 'mọi người')}'.\n"
            f"  + Tính cách: {traits}.\n"
            f"  + Cách nói: {p.get('speaking_style', '')}\n"
            f"  + Quan hệ: {rel_str}\n"
            f"  + Biểu cảm hay dùng: {prefs}. Câu cửa miệng: {catch}."
        )

    valid_ids = ", ".join(c["id"] for c in chars)
    valid_emotions = ", ".join(VALID_EMOTIONS)

    return f"""Bạn là ĐẠO DIỄN HỘI THOẠI (Conversation Director) cho buổi livestream TikTok có nhiều linh vật ảo cùng tương tác trực tiếp bằng giọng nói tiếng Việt.

DANH SÁCH NHÂN VẬT ĐANG LÊN SÓNG (chỉ được dùng các ID sau: {valid_ids}):
{chr(10).join(char_blocks)}

QUY TẮC BẮT BUỘC:
1. Chỉ trả về ĐÚNG 1 đối tượng JSON hợp lệ theo cấu trúc:
   {{
     "topic_summary": "tóm tắt <= 10 từ",
     "turns": [
       {{
         "speaker": "id_nhan_vat",
         "emotion": "TRANG_THAI",
         "text": "lời thoại tự nhiên để đọc TTS",
         "reactions": {{"id_nguoi_nghe": "TRANG_THAI"}},
         "pause_ms": 300
       }}
     ]
   }}
2. Không thêm giải thích, không bọc markdown ```json, không dùng emoji, hashtag hay ký tự đặc biệt (*, #, ~) trong trường `text` vì TTS sẽ đọc lỗi.
3. Mỗi câu thoại ngắn gọn dưới {max_words} từ, ngắt dấu phẩy/chấm tự nhiên để giọng AI đọc có nhịp.
4. Các nhân vật phải tung hứng, nối ý hoặc trêu chọc nhau đúng tính cách — KHÔNG lặp lại cùng một ý ở 2 lượt liên tiếp và KHÔNG để cùng một nhân vật nói 2 lượt liền nhau.
5. `emotion` và giá trị trong `reactions` CHỈ được chọn trong 18 trạng thái: {valid_emotions}.
6. Giữ nội dung vui vẻ, an toàn cộng đồng TikTok LIVE, không công kích hay xúc phạm khán giả.
"""


def _format_history(recent_turns: list[dict[str, str]] | None, limit: int = 8) -> str:
    if not recent_turns:
        return "(Chưa có lịch sử gần đây)"
    lines = []
    for item in recent_turns[-limit:]:
        spk = item.get("speaker", "?")
        txt = item.get("text", "").strip()
        if txt:
            lines.append(f"- {spk}: {txt}")
    return "\n".join(lines) if lines else "(Chưa có lịch sử gần đây)"


def build_comment_prompt(
    profile: dict[str, Any],
    viewer_name: str,
    comment_text: str,
    gift_name: str | None = None,
    recent_turns: list[dict[str, str]] | None = None,
) -> str:
    """Prompt khi có bình luận hoặc quà tặng từ khán giả TikTok LIVE."""
    max_turns = profile.get("director", {}).get("max_turns_comment", 3)
    mentioned = detect_mentioned_characters(comment_text, profile)
    mention_hint = (
        f"Khán giả gọi đích danh: {', '.join(mentioned)} (nhân vật này phải nói lượt đầu hoặc lượt chính)."
        if mentioned
        else "Tự chọn 2 đến 3 nhân vật phù hợp nhất với nội dung bình luận để thay phiên đáp lại."
    )
    gift_line = f"\n- Quà tặng đi kèm: {gift_name} (nhớ cảm ơn ngắn gọn, hào hứng)." if gift_name else ""

    return f"""CHẾ ĐỘ: TRẢ LỜI BÌNH LUẬN TRỰC TIẾP
- Khán giả: {viewer_name}
- Nội dung bình luận: "{comment_text}"{gift_line}
- Định hướng phân vai: {mention_hint}
- Số lượt thoại: từ 2 đến {max_turns} lượt (nhanh, gọn, cuốn).

Lịch sử hội thoại gần nhất:
{_format_history(recent_turns)}

Hãy xuất JSON hội thoại ngay."""


def build_topic_prompt(
    profile: dict[str, Any],
    topic: str,
    story_chunk: str | None = None,
    resume_after_interrupt: bool = False,
    recent_turns: list[dict[str, str]] | None = None,
) -> str:
    """Prompt khi cả nhóm cùng kể chuyện hoặc bàn luận về một chủ đề."""
    max_turns = profile.get("director", {}).get("max_turns_topic", 5)
    story_block = f'\n- Đoạn nội dung/truyện cần kể & bình luận:\n"""{story_chunk}"""' if story_chunk else ""
    resume_note = (
        "\n- Lưu ý: Cả nhóm vừa ngắt quãng để trả lời bình luận khán giả, hãy cho lượt đầu có câu nối tự nhiên quay lại câu chuyện."
        if resume_after_interrupt
        else ""
    )

    return f"""CHẾ ĐỘ: KỂ CHUYỆN & BÀN LUẬN CHỦ ĐỀ
- Chủ đề: {topic}{story_block}{resume_note}
- Yêu cầu: Tạo {max_turns - 1} đến {max_turns} lượt thoại xoay vòng giữa các nhân vật (có người dẫn, người tò mò hỏi, người phản biện/cà khịa hài hước).

Lịch sử hội thoại gần nhất:
{_format_history(recent_turns)}

Hãy xuất JSON hội thoại ngay."""


def build_idle_prompt(
    profile: dict[str, Any],
    recent_turns: list[dict[str, str]] | None = None,
) -> str:
    """Prompt khi phòng live im ắng (thay thế idle_on đơn nhân vật trong tuong_tac.py)."""
    max_turns = profile.get("director", {}).get("max_turns_idle", 3)
    return f"""CHẾ ĐỘ: TỰ TRÒ CHUYỆN KHI PHÒNG RẢNH
- Yêu cầu: Tạo 2 đến {max_turns} lượt thoại ngắn, cả nhóm tự trêu nhau hoặc đặt 1 câu hỏi mở vui vẻ để kéo khán giả bình luận.

Lịch sử hội thoại gần nhất:
{_format_history(recent_turns)}

Hãy xuất JSON hội thoại ngay."""


def _extract_json_blob(raw_text: str) -> Any:
    """Tách chuỗi JSON sạch ngay cả khi LLM lỡ bọc ```json ... ``` hoặc thêm chữ thừa."""
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Tìm khối {...} hoặc [...] lớn nhất
    obj_start, obj_end = cleaned.find("{"), cleaned.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        try:
            return json.loads(cleaned[obj_start : obj_end + 1])
        except json.JSONDecodeError:
            pass

    arr_start, arr_end = cleaned.find("["), cleaned.rfind("]")
    if arr_start != -1 and arr_end > arr_start:
        return json.loads(cleaned[arr_start : arr_end + 1])

    raise ValueError("Không tìm thấy khối JSON hợp lệ trong phản hồi của LLM.")


def _clean_tts_text(text: str) -> str:
    """Làm sạch ký tự markdown/emoji để VieNeu TTS đọc mượt."""
    text = re.sub(r"[*_`#~>|]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_director_response(
    raw_text: str,
    profile: dict[str, Any],
    fallback_text: str = "Cả nhà đang nghe rõ tụi mình nói không nè?",
) -> dict[str, Any]:
    """
    Chuẩn hoá phản hồi từ LLM thành danh sách lượt phát sẵn sàng đẩy vào hàng đợi GPU TTS.
    Đảm bảo không bao giờ crash livestream kể cả khi LLM trả về JSON lỗi.
    """
    enabled_chars = get_enabled_characters(profile)
    char_map = {c["id"]: c for c in enabled_chars}
    default_id = profile.get("director", {}).get("default_lead_id")
    if default_id not in char_map and enabled_chars:
        default_id = enabled_chars[0]["id"]

    try:
        data = _extract_json_blob(raw_text)
        raw_turns = data.get("turns", []) if isinstance(data, dict) else data
        topic_summary = data.get("topic_summary", "") if isinstance(data, dict) else ""
    except Exception:
        raw_turns = []
        topic_summary = "fallback"

    normalized_turns: list[dict[str, Any]] = []
    if isinstance(raw_turns, list):
        for item in raw_turns:
            if not isinstance(item, dict):
                continue
            speaker = str(item.get("speaker", default_id)).strip().lower()
            if speaker not in char_map:
                speaker = default_id

            emotion = str(item.get("emotion", "TALK")).strip().upper()
            if emotion not in VALID_EMOTIONS:
                emotion = "TALK"

            text = _clean_tts_text(str(item.get("text", "")))
            if not text:
                continue

            raw_reactions = item.get("reactions", {})
            reactions: dict[str, str] = {}
            if isinstance(raw_reactions, dict):
                for rid, remo in raw_reactions.items():
                    rid_norm = str(rid).strip().lower()
                    remo_norm = str(remo).strip().upper()
                    if rid_norm in char_map and rid_norm != speaker and remo_norm in VALID_EMOTIONS:
                        reactions[rid_norm] = remo_norm

            try:
                pause_ms = int(item.get("pause_ms", 300))
            except (TypeError, ValueError):
                pause_ms = 300
            pause_ms = max(150, min(1200, pause_ms))

            char_cfg = char_map[speaker]
            voice_cfg = char_cfg.get("voice", {})
            normalized_turns.append(
                {
                    "speaker": speaker,
                    "speaker_name": char_cfg.get("name", speaker),
                    "emotion": emotion,
                    "sfx": emotion if emotion in SFX_EMOTIONS else None,
                    "text": text,
                    "reactions": reactions,
                    "pause_ms": pause_ms,
                    "voice_engine": voice_cfg.get("engine", "vieneu"),
                    "voice_name": voice_cfg.get("voice_name", "Thiện Minh"),
                    "voice_speed": voice_cfg.get("speed", 1.0),
                }
            )

    if not normalized_turns and default_id in char_map:
        char_cfg = char_map[default_id]
        voice_cfg = char_cfg.get("voice", {})
        normalized_turns.append(
            {
                "speaker": default_id,
                "speaker_name": char_cfg.get("name", default_id),
                "emotion": "WAVE",
                "sfx": None,
                "text": fallback_text,
                "reactions": {},
                "pause_ms": 300,
                "voice_engine": voice_cfg.get("engine", "vieneu"),
                "voice_name": voice_cfg.get("voice_name", "Thiện Minh"),
                "voice_speed": voice_cfg.get("speed", 1.0),
            }
        )

    return {
        "topic_summary": str(topic_summary).strip(),
        "turns": normalized_turns,
    }


if __name__ == "__main__":
    from pathlib import Path

    cfg_path = Path(__file__).with_name("kenh-1-multi.json")
    profile_data = json.loads(cfg_path.read_text(encoding="utf-8"))

    sys_prompt = build_system_prompt(profile_data)
    user_prompt = build_comment_prompt(
        profile_data,
        viewer_name="Minh Anh",
        comment_text="@ho sao anh Hổ khoanh tay quạu vậy, kể chuyện ma đi!",
        gift_name="Hoa hồng",
    )

    sample_llm_output = """```json
    {
      "topic_summary": "Khán giả trêu Hổ Mập và đòi kể chuyện ma",
      "turns": [
        {
          "speaker": "tho",
          "emotion": "HAPPY",
          "text": "Cảm ơn bạn Minh Anh tặng hoa hồng nha! Có người hỏi sao anh Hổ khoanh tay quạu kìa!",
          "reactions": {"ho": "ANGRY", "rong": "LAUGH"},
          "pause_ms": 250
        },
        {
          "speaker": "ho",
          "emotion": "ANGRY",
          "text": "Khoanh tay là dáng anh đại chứ quạu đâu! Mà nửa đêm đòi kể ma, lát Bé Rồng sợ khóc bây giờ.",
          "reactions": {"rong": "SCARED", "tho": "LAUGH"},
          "pause_ms": 350
        },
        {
          "speaker": "bong",
          "emotion": "LAUGH",
          "text": "Thôi nể hoa hồng của Minh Anh, để Bông kể một chuyện rùng rợn nhẹ nhẹ thôi nha!",
          "reactions": {"rong": "SHOCK", "tho": "HAPPY"},
          "pause_ms": 400
        }
      ]
    }
    ```"""

    parsed = parse_director_response(sample_llm_output, profile_data)
    assert len(parsed["turns"]) == 3
    assert parsed["turns"][0]["voice_name"] == "Mỹ Duyên"
    assert parsed["turns"][1]["voice_name"] == "Thái Sơn"
    assert parsed["turns"][2]["sfx"] == "LAUGH"
    print("OK! System prompt length:", len(sys_prompt))
    print("OK! Comment prompt preview:\n", user_prompt)
    print("OK! Parsed turns:", json.dumps(parsed, ensure_ascii=False, indent=2))