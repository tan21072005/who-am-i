"""Vietnamese speech providers and a local file diagnostic."""
import asyncio
from dataclasses import dataclass
import importlib.util
from io import BytesIO
from threading import Lock
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import wave

VIE_VOICES = {
    "Thiện Minh", "Quỳnh Anh", "Mỹ Duyên", "Thái Sơn", "Hải Đăng", "Trúc Ly", "Ngọc Linh", "Thiền Tâm Đức", "Kim Thanh", "Đức Trí"
}
VIE_DEFAULT = "Thiện Minh"
VIE_VOICE = VIE_DEFAULT
_vieneu_lock = Lock()
_vieneu_model = None
MAX_AUDIO = 1_500_000
SAMPLE_TEXT = "Xin chào, mình là Bông, một chú gián đội mũ hoa. Bạn nghe thấy mình nói không?"


class SpeechError(Exception):
    pass


@dataclass
class Speech:
    audio: bytes
    extension: str
    provider: str


def find_espeak():
    candidate = (os.environ.get("ESPEAK_NG_EXE") or "").strip().strip('"')
    if candidate and Path(candidate).is_file():
        return str(Path(candidate).resolve())
    on_path = shutil.which("espeak-ng")
    if on_path:
        return on_path
    for key in ("ProgramFiles", "ProgramW6432", "ProgramFiles(x86)", "LOCALAPPDATA"):
        folder = os.environ.get(key)
        if not folder:
            continue
        for relative in ("eSpeak NG/espeak-ng.exe", "eSpeak NG Text-to-Speech/espeak-ng.exe",
                         "Programs/eSpeak NG/espeak-ng.exe"):
            path = Path(folder) / relative
            if path.is_file():
                return str(path.resolve())
    return None


class Speaker:
    def __init__(self, voice, engine="auto", rate=4):
        self.rate = rate
        self.voice = voice
        self.engine = engine
        self.vieneu = engine == "vieneu" and importlib.util.find_spec("vieneu") is not None
        self.edge = engine in ("auto", "edge") and importlib.util.find_spec("edge_tts") is not None
        self.espeak = None if engine == "edge" else find_espeak()
        self.edge_cooldown = 0

    @property
    def available(self):
        return bool(self.vieneu or self.edge or self.espeak)

    async def edge_audio(self, text):
        import edge_tts

        audio = bytearray()
        edge_voice = self.voice
        if edge_voice not in ("vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"):
            edge_voice = "vi-VN-HoaiMyNeural" if self.voice in ("Quỳnh Anh", "Mỹ Duyên", "Ngọc Linh", "Kim Thanh", "Trúc Ly") else "vi-VN-NamMinhNeural"
        async for chunk in edge_tts.Communicate(text, edge_voice, rate=f"{self.rate:+d}%").stream():
            if chunk.get("type") == "audio":
                audio.extend(chunk["data"])
                if len(audio) > MAX_AUDIO:
                    raise SpeechError("Lời thoại quá dài. Hãy rút ngắn câu.")
        if not audio:
            raise SpeechError("Edge TTS chưa trả về âm thanh.")
        return Speech(bytes(audio), "mp3", "Edge TTS")

    def espeak_audio(self, text):
        with TemporaryDirectory(prefix="bong-hoa-tts-") as directory:
            work = Path(directory)
            source = work / "text.txt"
            result = work / "voice.wav"
            source.write_text(text, encoding="utf-8")
            try:
                subprocess.run(
                    [self.espeak, "-b", "1", "-v", "vi", "-s", str(round(154 * (100 + self.rate) / 100)), "-f", source.name, "-w", result.name],
                    cwd=work, capture_output=True, check=True, timeout=9,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if result.stat().st_size > MAX_AUDIO:
                    raise SpeechError("Lời thoại quá dài. Hãy rút ngắn câu.")
                audio = result.read_bytes()
                with wave.open(BytesIO(audio)) as file:
                    if not file.getnframes():
                        raise SpeechError("eSpeak NG không tạo được giọng cho câu này.")
            except (subprocess.SubprocessError, OSError, EOFError, wave.Error):
                raise SpeechError("eSpeak NG chưa tạo được WAV. Kiểm tra lệnh espeak-ng --voices=vi.") from None
        return Speech(audio, "wav", "eSpeak NG")

    def vieneu_audio(self, text):
        global _vieneu_model
        if not self.vieneu:
            raise SpeechError("Chưa cài VieNeu CUDA. Chạy 07-CAI-VIENEU-GPU.bat.")
        try:
            import torch
            from vieneu import Vieneu

            if not torch.cuda.is_available():
                raise SpeechError("VieNeu không thấy CUDA. Kiểm tra card NVIDIA, driver và bản PyTorch.")
            with _vieneu_lock, TemporaryDirectory(prefix="bong-vieneu-") as directory:
                if _vieneu_model is None:
                    _vieneu_model = Vieneu()
                result = Path(directory) / "voice.wav"
                vieneu_voice = self.voice if self.voice in VIE_VOICES else (
                    "Quỳnh Anh" if self.voice == "vi-VN-HoaiMyNeural" else VIE_DEFAULT
                )
                audio = _vieneu_model.infer(text, voice=vieneu_voice, temperature=0.75, silence_p=0.18)
                _vieneu_model.save(audio, str(result))
                with wave.open(str(result), "rb") as wav:
                    if not wav.getnframes() or wav.getnframes() > wav.getframerate() * 58:
                        raise SpeechError("Đoạn VieNeu trống hoặc dài quá 58 giây. Hãy rút ngắn lời.")
                return Speech(result.read_bytes(), "wav", "VieNeu CUDA")
        except SpeechError:
            raise
        except Exception as error:
            raise SpeechError(f"VieNeu CUDA chưa tạo được giọng ({type(error).__name__}). Kiểm tra model, driver và VRAM.") from None

    async def synthesize(self, text, *, retry=None):
        loop = asyncio.get_running_loop()
        edge_error = None
        if self.engine == "vieneu":
            try:
                return await asyncio.to_thread(self.vieneu_audio, text)
            except SpeechError:
                if not self.espeak:
                    raise
                return await asyncio.to_thread(self.espeak_audio, text)
        if self.edge and (not self.espeak or loop.time() >= self.edge_cooldown):
            try:
                return await asyncio.wait_for(self.edge_audio(text), timeout=9)
            except Exception as error:
                if type(error).__name__ == "NoAudioReceived" and retry is not None and not self.espeak:
                    await asyncio.sleep(0.6)
                    if retry():
                        try:
                            return await asyncio.wait_for(self.edge_audio(text), timeout=9)
                        except Exception as retry_error:
                            error = retry_error
                if isinstance(error, SpeechError):
                    edge_error = str(error)
                elif isinstance(error, TimeoutError):
                    edge_error = "Edge TTS chờ quá lâu. Kiểm tra Internet."
                else:
                    edge_error = f"Edge TTS chưa phát được ({type(error).__name__})."
                self.edge_cooldown = loop.time() + 60
        if self.espeak:
            return await asyncio.to_thread(self.espeak_audio, text)
        if edge_error:
            raise SpeechError(edge_error + " Có thể chạy 02-CAI-CONG-CU.bat với -ThemGiongNgoaiTuyen.")
        raise SpeechError("Chưa có bộ giọng đọc. Hãy cài Edge TTS hoặc eSpeak NG rồi mở lại Bông Hoa.")
