"""Local originals and incremental full-text indexing for the LIVE assistant."""
from contextlib import contextmanager
from hashlib import sha256
from html.parser import HTMLParser
from itertools import islice
from pathlib import Path
import re
import secrets
import sqlite3
from threading import Lock, Thread
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from thu_vien import WORD
from tuong_tac import InteractionError

MAX_UPLOAD = 1024 ** 3
FORMATS = {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm", ".docx", ".pdf", ".doc"}
OLE = bytes.fromhex("d0cf11e0a1b11ae1")


class VisibleText(HTMLParser):
    blocks = {"p", "br", "li", "div", "section", "article", "tr", "h1", "h2", "h3", "h4", "h5", "h6"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = ""

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip = tag
        if not self.skip and tag in self.blocks:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == self.skip:
            self.skip = ""
        elif not self.skip and tag in self.blocks:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def document_parts(path, suffix):
    with path.open("rb") as handle:
        signature = handle.read(8)
    if signature == OLE:
        raise InteractionError("Đây là Word .doc đời cũ hoặc Word có mật khẩu. Mở bằng Word, lưu thành .docx không khóa rồi nhập lại.")
    if suffix in (".doc", ".docx"):
        try:
            with ZipFile(path) as archive:
                try:
                    entry = archive.getinfo("word/document.xml")
                except KeyError:
                    raise InteractionError("Tệp Word không chứa nội dung văn bản chuẩn (thiếu word/document.xml).")
                if entry.file_size > 256 * 1024 ** 2:
                    raise InteractionError("Phần XML của Word vượt 256 MiB sau khi giải nén.")
                with archive.open(entry) as source:
                    elements = ElementTree.iterparse(source, events=("start", "end"))
                    stack = []
                    for event, node in elements:
                        if event == "start":
                            stack.append(node)
                        else:
                            stack.pop()
                            if node.tag == WORD + "p":
                                yield None, "".join(t.text or "" for t in node.iter(WORD + "t"))
                                if stack:
                                    stack[-1].remove(node)
                            elif node.tag != WORD + "t" and not any(parent.tag == WORD + "p" for parent in stack):
                                if stack:
                                    stack[-1].remove(node)
        except BadZipFile:
            raise InteractionError("Tệp DOCX hỏng hoặc không đúng định dạng nén chuẩn.")
        return
    if suffix == ".pdf":
        try:
            import pymupdf
        except ImportError:
            raise InteractionError("Thiếu bộ đọc PDF. Chạy 08-CAI-DOC-PDF.bat rồi nhập lại.") from None
        try:
            with pymupdf.open(path, filetype="pdf") as document:
                if document.needs_pass:
                    raise InteractionError("PDF có mật khẩu. Lưu bản đã mở khóa rồi nhập lại.")
                for index, page in enumerate(document, 1):
                    yield index, page.get_text(sort=True)
        except Exception as error:
            if isinstance(error, InteractionError):
                raise
            raise InteractionError("Tệp PDF hỏng hoặc không đọc được nội dung.") from None
        return
    with path.open(encoding="utf-8-sig") as source:
        parser = VisibleText() if suffix in (".html", ".htm") else None
        while line := source.readline(65536):
            if parser:
                parser.feed(line)
                if len(parser.rawdata) > 4 * 1024 ** 2:
                    raise InteractionError("HTML có thẻ hoặc chú thích quá dài. Hãy xuất nội dung sang TXT.")
                line = "".join(parser.parts)
                parser.parts.clear()
            yield None, line
        if parser:
            parser.close()
            yield None, "".join(parser.parts)


def chunks(parts):
    buffer = ""
    page = None
    for current_page, text in parts:
        if page != current_page:
            if buffer:
                yield page, buffer
            buffer = ""
            page = current_page
        text = " ".join(text.split())
        if not text:
            continue
        buffer = f"{buffer} {text}".strip() if buffer else text
        while len(buffer) > 1400:
            end = buffer.rfind(" ", 0, 1401)
            if end < 700:
                end = 1400
            yield page, buffer[:end]
            buffer = buffer[end:].lstrip()
    if buffer:
        yield page, buffer


class DocumentStore:
    def __init__(self, directory):
        self.root = directory / "tai-lieu"
        self.lock = Lock()
        self.ready = False
        self.busy = False

    @contextmanager
    def connect(self):
        with self.lock:
            if not self.ready:
                self.root.mkdir(parents=True, exist_ok=True)
                with sqlite3.connect(self.root / "thu-vien.sqlite3") as db:
                    db.execute("PRAGMA journal_mode=WAL")
                    db.executescript("""
                      CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL,
                        status TEXT NOT NULL, detail TEXT DEFAULT '', segments INTEGER DEFAULT 0,
                        digest TEXT
                      );
                      CREATE VIRTUAL TABLE IF NOT EXISTS passages USING fts5(
                        document UNINDEXED, ordinal UNINDEXED, page UNINDEXED, body,
                        tokenize='unicode61 remove_diacritics 2'
                      );
                      UPDATE documents SET status='error', detail='Bông đã đóng giữa lúc đọc. Hãy nhập lại.'
                      WHERE status='indexing';
                      DELETE FROM passages WHERE document IN (SELECT id FROM documents WHERE status='error');
                    """)
                for partial in self.root.glob("*.part"):
                    partial.unlink()
                with sqlite3.connect(self.root / "thu-vien.sqlite3") as db:
                    failed = {row[0] for row in db.execute("SELECT id FROM documents WHERE status='error'")}
                for original in self.root.iterdir():
                    if original.stem in failed and original.suffix in FORMATS:
                        original.unlink()
                self.ready = True
        db = sqlite3.connect(self.root / "thu-vien.sqlite3")
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def upload(self, stream, name, size):
        name = Path(name.replace(chr(92), "/")).name
        suffix = Path(name).suffix.lower()
        if not name or len(name) > 240 or suffix not in FORMATS:
            raise InteractionError("Chọn file PDF, DOCX, TXT, MD, CSV, TSV, JSON, JSONL hoặc HTML.")
        if not 0 < size <= MAX_UPLOAD:
            raise InteractionError("Mỗi tài liệu phải lớn hơn 0 byte và tối đa 1 GiB.")
        try:
            import shutil
            if shutil.disk_usage(self.root).free < size * 2 + 50 * 1024 * 1024:
                raise InteractionError("Ổ đĩa không đủ dung lượng trống để lưu và lập chỉ mục tài liệu.")
        except OSError:
            pass
        with self.connect() as db:
            with self.lock:
                if self.busy:
                    raise InteractionError("Kho đang nhập một tài liệu. Chờ hoàn thành rồi nhập tệp tiếp theo.")
                self.busy = True
            doc = secrets.token_hex(16)
            partial = self.root / (doc + ".part")
            target = self.root / (doc + suffix)
            handed_off = False
            try:
                remaining = size
                digest = sha256()
                with partial.open("xb") as out:
                    while remaining:
                        data = stream.read(min(1024 ** 2, remaining))
                        if not data:
                            raise InteractionError("Tải lên chưa đủ dữ liệu. Chọn lại file và thử lại.")
                        out.write(data)
                        digest.update(data)
                        remaining -= len(data)
                checksum = digest.hexdigest()
                existing = db.execute("SELECT id FROM documents WHERE digest=? AND status='ready'", (checksum,)).fetchone()
                if existing:
                    return existing["id"]
                partial.replace(target)
                db.execute("INSERT INTO documents(id,name,size,status,digest) VALUES(?,?,?,'indexing',?)",
                           (doc, name, size, checksum))
                db.commit()
                Thread(target=self.index, args=(doc, target, suffix), daemon=True).start()
                handed_off = True
                return doc
            finally:
                if not handed_off:
                    try:
                        partial.unlink(missing_ok=True)
                        target.unlink(missing_ok=True)
                    finally:
                        with self.lock:
                            self.busy = False

    def index(self, doc, path, suffix):
        detail = ""
        try:
            count = 0
            with self.connect() as db:
                items = enumerate(chunks(document_parts(path, suffix)), 1)
                while batch := list(islice(items, 100)):
                    db.executemany("INSERT INTO passages(document,ordinal,page,body) VALUES(?,?,?,?)",
                                   ((doc, ordinal, page, body) for ordinal, (page, body) in batch))
                    count = batch[-1][0]
                    db.execute("UPDATE documents SET segments=? WHERE id=?", (count, doc))
                    db.commit()
                if not count:
                    hint = " PDF ảnh quét cần OCR trước." if suffix == ".pdf" else ""
                    raise InteractionError("Không tìm thấy văn bản." + hint)
                db.execute("UPDATE documents SET status='ready' WHERE id=?", (doc,))
        except InteractionError as error:
            detail = str(error)
        except UnicodeError:
            detail = "Tệp văn bản không đúng định dạng UTF-8. Hãy lưu lại với bảng mã UTF-8."
        except BadZipFile:
            detail = "Tệp DOCX hỏng hoặc không đúng định dạng nén chuẩn."
        except KeyError:
            detail = "Tệp Word thiếu nội dung văn bản chuẩn (thiếu word/document.xml)."
        except (ValueError, RuntimeError, ElementTree.ParseError, sqlite3.Error, OSError):
            detail = "Không đọc hoặc lập chỉ mục được. Kiểm tra định dạng, UTF-8 và dung lượng ổ đĩa."
        finally:
            try:
                if detail:
                    with self.connect() as db:
                        db.execute("DELETE FROM passages WHERE document=?", (doc,))
                        db.execute("UPDATE documents SET status='error', detail=?, segments=0 WHERE id=?", (detail, doc))
                    path.unlink(missing_ok=True)
            finally:
                with self.lock:
                    self.busy = False

    def list(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("""SELECT id,name,size,status,detail,segments FROM documents
                ORDER BY rowid DESC LIMIT 500""")]

    def search(self, doc, query):
        with self.connect() as db:
            ready = db.execute("SELECT name FROM documents WHERE id=? AND status='ready'", (doc,)).fetchone()
            if ready is None:
                raise InteractionError("Chọn tài liệu đã đọc xong.")
            words = re.findall(r"\w+", query[:240])[:12]
            if words:
                terms = " OR ".join(f'"{word}"' for word in words)
                rows = db.execute("""SELECT ordinal,page,body FROM passages
                    WHERE document=? AND passages MATCH ? ORDER BY rank, CAST(ordinal AS INTEGER) LIMIT 8""",
                                  (doc, terms))
            else:
                rows = db.execute("SELECT ordinal,page,body FROM passages WHERE document=? LIMIT 8", (doc,))
            return [dict(row) for row in rows]

    def excerpt(self, doc, ordinal):
        if not isinstance(doc, str) or type(ordinal) is not int or ordinal < 1:
            raise InteractionError("Chọn một đoạn hợp lệ trong kho.")
        with self.connect() as db:
            found = db.execute("""SELECT name,page,body FROM passages JOIN documents ON documents.id=passages.document
                WHERE documents.id=? AND status='ready' AND ordinal=? LIMIT 1""", (doc, ordinal)).fetchone()
            if found is None:
                raise InteractionError("Không tìm thấy đoạn đã chọn.")
            return found
