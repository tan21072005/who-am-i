"""Read story documents and store local catalog files."""
import base64
import binascii
import csv
from io import BytesIO, StringIO
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from cai_dat_kenh import write_atomic
from tuong_tac import InteractionError

MAX_DOCUMENT = 12_000_000
MAX_SEGMENTS = 6000
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def write_json(path, value):
    write_atomic(path, json.dumps(value, ensure_ascii=False).encode("utf-8"))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_document(name, encoded):
    if not isinstance(name, str) or not isinstance(encoded, str):
        raise InteractionError("Chọn một file trước khi nhập.")
    try:
        data = base64.b64decode(encoded, validate=True)
        if not 0 < len(data) <= MAX_DOCUMENT:
            raise ValueError()
        if data.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
            raise InteractionError("Đây là Word .doc đời cũ hoặc Word có mật khẩu. Mở bằng Word rồi lưu thành .docx không khóa.")
        ext = Path(name.lower()).suffix
        if ext in (".doc", ".docx"):
            try:
                with ZipFile(BytesIO(data)) as archive:
                    entry = archive.getinfo("word/document.xml")
                    if entry.file_size > 24_000_000:
                        raise InteractionError("Phần XML của Word vượt 24 MiB.")
                    xml = archive.read(entry)
            except BadZipFile:
                raise InteractionError("Tệp DOCX hỏng hoặc không đúng định dạng nén chuẩn.")
            except KeyError:
                raise InteractionError("Tệp Word thiếu nội dung văn bản chuẩn (thiếu word/document.xml).")
            if re.search(rb"<!\s*(DOCTYPE|ENTITY)", xml, re.I) or b"\x00" in xml:
                raise InteractionError("Tệp Word chứa cấu trúc không an toàn.")
            root = ElementTree.fromstring(xml)
            paragraphs = []
            for p in root.iter(WORD + "p"):
                line = "".join(node.text or "" for node in p.iter(WORD + "t"))
                style = p.find(f"{WORD}pPr/{WORD}pStyle")
                if style is not None and re.match(r"(heading|title)", style.get(WORD + "val", ""), re.I):
                    line = "# " + line
                paragraphs.append(line)
            return "\n".join(paragraphs)
        if ext in (".txt", ".md", ".csv"):
            return data.decode("utf-8-sig")
    except (ValueError, KeyError, RuntimeError, OSError, BadZipFile, binascii.Error, ElementTree.ParseError):
        raise InteractionError("Không đọc được file. Dùng Word .docx hoặc Markdown, TXT, CSV mã hóa UTF-8, tối đa 12 MB.") from None
    raise InteractionError("Chọn file .docx, .md hoặc .txt. Với Word .doc cũ, lưu lại thành .docx.")


def document_segments(text):
    lines, chapters = [], []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        heading = re.match(r"^#{1,6}\s+(.+)$", paragraph)
        if heading:
            paragraph = heading[1]
        paragraph = re.sub(r"!?\[([^\]]+)\]\([^)]+\)", r"\1", paragraph)
        paragraph = " ".join(re.sub(r"https?://\S+|www\.\S+", "", paragraph).split())
        if not paragraph:
            continue
        if heading or re.match(r"^(chương|phần|tập)\s+\S+", paragraph, re.I):
            chapters.append({"slot": len(lines), "title": paragraph[:150]})
        while len(paragraph) > 480:
            endings = list(re.finditer(r"[.!?…](?=\s)", paragraph[:480]))
            end = endings[-1].end() if endings and endings[-1].end() >= 150 else paragraph.rfind(" ", 0, 480)
            end = end if end > 0 else 480
            lines.append(paragraph[:end])
            paragraph = paragraph[end:].strip()
        if paragraph:
            lines.append(paragraph)
        if len(lines) > MAX_SEGMENTS:
            raise InteractionError("Tài liệu quá dài cho một kịch bản. Hãy tách theo tập.")
    if not lines:
        raise InteractionError("Không tìm thấy văn bản để kể trong tài liệu.")
    return lines, chapters


def keywords(text):
    text = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return set(re.findall(r"\w{2,}", "".join(c for c in text if not unicodedata.combining(c)))) - {
        "cho", "cua", "nay", "nhu", "the", "dan", "hay", "nhung", "mot", "cac", "khi",
        "khong", "sao", "nao", "bao", "nhieu", "muon", "biet", "bong", "oi", "ve",
    }


def excerpts(question, lines):
    terms = keywords(question)
    if len(terms) < 2:
        return []
    ranked = sorted(((len(terms & keywords(line)), i) for i, line in enumerate(lines) if line), reverse=True)
    return [{"doan": i + 1, "noi_dung": lines[i]} for score, i in ranked[:3] if score >= 2]


def csv_titles(text):
    rows = csv.DictReader(StringIO(text))
    if not rows.fieldnames or "title" not in rows.fieldnames:
        raise InteractionError("CSV cần cột title. Mỗi hàng là tên một kịch bản đã lưu.")
    return [row["title"].strip() for row in rows if row.get("title", "").strip()]
