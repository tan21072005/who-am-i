"""Text replies through an OpenAI-compatible 9Router endpoint."""
import json
import re
import socket
import ssl
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

LOCAL_ROUTER = "http://127.0.0.1:20128/v1"
DEFAULT_COMBO = "live-tiktok"


class RouterError(Exception):
    """A concise operator-facing failure with no credentials or response body."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def router_url(value):
    if not isinstance(value, str):
        raise RouterError("router_base_url phải là một URL.")
    base = value.strip().rstrip("/")
    try:
        parts = urlsplit(base)
        port = parts.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError("port")
    except ValueError:
        raise RouterError("URL hoặc cổng 9Router không hợp lệ.") from None
    local_http = parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost", "::1")
    if (not parts.hostname or parts.username is not None or parts.password is not None
            or parts.query or parts.fragment or not parts.path.endswith("/v1")
            or (parts.scheme != "https" and not local_http)
            or any(c.isspace() for c in base)):
        raise RouterError("Dùng Base URL kết thúc bằng /v1, không kèm key. Dùng HTTPS khi gọi từ máy khác.")
    return base


def router_model(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", value):
        raise RouterError("Tên combo hoặc model 9Router không đúng định dạng.")
    return value


def router_reply(base_url, key, model, instruction, comment, *, max_tokens=600, timeout=24):
    model = router_model(model)
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": instruction}, {"role": "user", "content": comment}],
        "stream": False,
        "max_tokens": max_tokens,
        "temperature": .5,
    }
    request = Request(
        router_url(base_url) + "/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            status = response.status
            result = json.loads(response.read(262145))
    except HTTPError as error:
        status = error.code
        error.close()
        if 300 <= status <= 399:
            hint = "Base URL chuyển hướng. Kiểm tra đúng địa chỉ API /v1 và cổng."
        else:
            hint = {
                400: "Kiểm tra combo đã bấm Create/Save và các model còn hoạt động.",
                401: "Kiểm tra API key do 9Router cấp.",
                403: "Kiểm tra quyền của API key trong 9Router.",
                404: "Kiểm tra Base URL và tên combo đã lưu.",
                429: "Kiểm tra hạn mức và trạng thái các model trong combo.",
                502: "Kiểm tra kết nối từ 9Router tới model.",
                503: "Kiểm tra kết nối nhà cung cấp và các model dự phòng.",
            }.get(status, "Xem nhật ký ở Dashboard 9Router.")
        raise RouterError(f"9Router HTTP {status}. {hint}") from None
    except (TimeoutError, URLError, OSError) as error:
        detail = getattr(error, "reason", error)
        if isinstance(detail, ssl.SSLCertVerificationError):
            hint = "Không xác minh được chứng chỉ HTTPS của máy chủ."
        elif isinstance(detail, socket.gaierror):
            hint = "Không phân giải được tên máy. Kiểm tra địa chỉ, Tailscale và DNS."
        else:
            hint = "Không kết nối được. Kiểm tra Tailscale, cổng hoặc thử trực tiếp từ PC đang chạy 9Router."
        raise RouterError("9Router: " + hint) from None
    except (UnicodeError, ValueError):
        raise RouterError("9Router không trả về JSON. Kiểm tra Base URL /v1.") from None

    try:
        choice = result["choices"][0]
        content = choice["message"]["content"]
        if choice.get("finish_reason") not in (None, "stop"):
            raise ValueError("incomplete")
        if isinstance(content, list):
            content = "".join(part["text"] for part in content if part.get("type") == "text")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("empty")
    except (AttributeError, IndexError, KeyError, TypeError, ValueError):
        raise RouterError(f"9Router HTTP {status}, nhưng combo chưa trả lời thoại hoàn chỉnh. Xem Usage/Logs.") from None
    return content
