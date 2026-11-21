"""Duration estimates and chapter-aware episode boundaries."""
from bisect import bisect_right
import wave


def clip_info(handle, provider):
    # The caller has already consumed the cache key and provider line.
    if not handle.peek(1):
        return None
    if provider == "Edge TTS":
        return True, None
    if provider in ("VieNeu CUDA", "eSpeak NG"):
        try:
            with wave.open(handle, "rb") as audio:
                frames = audio.getnframes()
                duration = frames / audio.getframerate()
                size = frames * audio.getsampwidth() * audio.getnchannels()
                if 0 < size <= 6_000_000 and 0 < duration <= 60:
                    return True, duration
        except (EOFError, wave.Error):
            pass
    return None


def estimate(text, speaker):
    rate = 0 if speaker.engine == "vieneu" else speaker.rate
    return max(1, len(text.split())) * 60 / (225 * (1 + rate / 100))


def split_episodes(texts, chapters, joins, durations, target):
    names = sorted({0, *(chapter["slot"] for chapter in chapters)} - set(joins))
    joined = set(joins)
    result = [0]
    start = 0
    seconds = 0
    slot = 0
    while slot < len(texts):
        if slot > start and slot not in joined and seconds + durations[slot] > target:
            chapter = names[bisect_right(names, slot) - 1]
            # A very short tail before a chapter is better kept with the current episode.
            end = chapter if chapter > start and sum(durations[start:chapter]) >= target * .55 else slot
            if any(texts[end:]):
                result.append(end)
            start, slot, seconds = end, end, 0
        seconds += durations[slot]
        slot += 1
    return result
