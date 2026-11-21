"use strict";
const parameters = new URLSearchParams(location.search);
const flower = new BongHoa.Flower(document.getElementById("flower"));
const mirror = parameters.get("mirror") === "1";
const voice = mirror ? null : new BongHoa.Voice(flower);
const unlock = document.getElementById("unlock");
const captionNode = document.getElementById("caption");
const captionTextNode = document.getElementById("caption-text") || captionNode;
const captionPageNode = document.getElementById("caption-page");
const WORD_LIMIT = Math.max(4, Math.min(60, Number(parameters.get("words")) || 12));
const bubbleStyle = parameters.get("bubble") || "manga";
if (captionNode && bubbleStyle) captionNode.classList.add("bubble-" + bubbleStyle);
const pos = parameters.get("pos") || "top";
if (captionNode && pos === "bottom") captionNode.classList.add("pos-bottom");
let currentCaptionText = "";
let currentCaptionPage = "";
const isSetup = parameters.get("setup") === "1";
let claimPrimary = false;
let resultAccepted = true;
let playing = null;

function updateCaptionPreview() {
  if (!isSetup || playing) return;
  const sample = "Xin chào! Mình là Bông ✨";
  captionTextNode.textContent = sample;
  currentCaptionText = sample;
  captionNode.hidden = parameters.get("captions") !== "1";
  if (captionPageNode) captionPageNode.hidden = true;
}
if (isSetup) updateCaptionPreview();

function splitCaption(text, limit = 12) {
  text = (text || "").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  if (words.length <= limit) return [text];

  const frames = [];
  let currentWords = [];

  for (let i = 0; i < words.length; i++) {
    currentWords.push(words[i]);
    const w = words[i];
    const isPunct = /[.!?:;,…]$/.test(w);
    const count = currentWords.length;

    if (count >= limit || (count >= Math.max(5, limit - 4) && isPunct)) {
      frames.push(currentWords.join(" "));
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    if (frames.length > 0 && currentWords.length <= 3 && (frames[frames.length - 1].split(/\s+/).length + currentWords.length) <= limit) {
      frames[frames.length - 1] += " " + currentWords.join(" ");
    } else {
      frames.push(currentWords.join(" "));
    }
  }
  return frames;
}
const card = document.getElementById("live-card");
const cardTitle = document.getElementById("live-card-title");
const cardTally = document.getElementById("live-card-tally");
const music = new Audio();
music.preload = "none";
music.loop = true;
let musicUrl = "";
let musicAttempt = false;
let musicBlocked = false;
let speaking = false;
const renderer = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("");
let boot;
let generation;
let ready = false;
let lastSeen = 0;
let ack = null;
let retries = 0;
let light = false;
let mirrorActive = false;
document.body.classList.toggle("solid", parameters.get("bg") === "1");

function setUnlock() {
  if (!isSetup) {
    unlock.hidden = true;
    return;
  }
  if (!resultAccepted) {
    unlock.textContent = "🔊 Nhấn vào đây để phát tiếng tại tab này";
    unlock.hidden = false;
  } else if (!ready || musicBlocked) {
    unlock.textContent = "🔔 Bật âm thanh · Bông Hoa";
    unlock.hidden = false;
  } else {
    unlock.hidden = true;
  }
}

function startMusic() {
  if (!musicUrl || !music.paused || musicAttempt) return;
  const current = musicUrl;
  musicAttempt = true;
  music.play().then(() => {
    if (current === musicUrl) musicBlocked = false;
  }).catch(error => {
    if (current === musicUrl) musicBlocked = error.name === "NotAllowedError";
  }).finally(() => {
    if (current === musicUrl) {
      musicAttempt = false;
      setUnlock();
    }
  });
}

function showLive(state) {
  const poll = state?.poll;
  card.hidden = !(poll || state?.message);
  cardTitle.textContent = poll?.title || state?.message || "";
  cardTally.textContent = !poll ? "" : poll.kind === "flight" ?
    `Gõ !bay · ${poll.total}/${poll.goal} · ${poll.seconds}s` :
    `Gõ A hoặc B · ${poll.seconds}s
A · ${poll.aTitle} (${poll.a})    B · ${poll.bTitle} (${poll.b})`;
  if (mirror) return;
  const track = state?.music;
  const next = track?.url || "";
  if (next !== musicUrl) {
    music.pause();
    musicAttempt = musicBlocked = false;
    musicUrl = next;
    if (next) {
      music.src = next;
    } else {
      music.removeAttribute("src");
      music.load();
    }
    setUnlock();
  }
  if (track) {
    music.volume = track.volume * (speaking ? .28 : 1);
    if (ready && !musicBlocked && !music.error) startMusic();
  }
}

async function enableAudio() {
  if (isSetup) claimPrimary = true;
  if (musicUrl) startMusic();
  try { ready = await voice.unlock(); } catch { ready = false; }
  setUnlock();
}
unlock.addEventListener("click", enableAudio);
window.addEventListener("click", () => {
  if (isSetup || (!ready && !mirror)) void enableAudio();
});
window.addEventListener("keydown", () => {
  if (isSetup || (!ready && !mirror)) void enableAudio();
});
if (!mirror) void enableAudio();

function clearPlayback() {
  playing = null;
  speaking = false;
  ack = null;
  if (voice) voice.stop();
  currentCaptionText = "";
  currentCaptionPage = "";
  if (captionPageNode) captionPageNode.hidden = true;
  if (isSetup) updateCaptionPreview();
  else captionNode.hidden = true;
}

async function playJob(job) {
  playing = job.id;
  speaking = Boolean(job.audio || job.demo);
  const frames = splitCaption(job.text, WORD_LIMIT);
  const totalWords = frames.reduce((sum, f) => sum + f.split(/\s+/).length, 0) || 1;
  const frameWeights = frames.map(f => f.split(/\s+/).length / totalWords);
  let activeFrame = -1;

  function setCaptionFrame(idx) {
    if (idx === activeFrame || idx < 0 || idx >= frames.length) return;
    activeFrame = idx;
    currentCaptionText = frames[idx];
    captionTextNode.textContent = frames[idx];
    if (captionPageNode) {
      if (frames.length > 1) {
        currentCaptionPage = `${idx + 1}/${frames.length}`;
        captionPageNode.textContent = currentCaptionPage;
        captionPageNode.hidden = false;
      } else {
        currentCaptionPage = "";
        captionPageNode.hidden = true;
      }
    }
  }

  setCaptionFrame(0);
  captionNode.hidden = parameters.get("captions") !== "1" || !job.text;

  let captionTimer = null;
  if (frames.length > 1) {
    captionTimer = setInterval(() => {
      if (!playing || playing !== job.id) {
        clearInterval(captionTimer);
        return;
      }
      const elapsed = performance.now() - flower.start;
      const duration = Math.max(1, flower.end - flower.start);
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      let acc = 0;
      let target = frames.length - 1;
      for (let i = 0; i < frames.length; i++) {
        acc += frameWeights[i];
        if (progress < acc) {
          target = i;
          break;
        }
      }
      setCaptionFrame(target);
    }, 75);
  }

  let failed = null;
  try { await voice.play(job); } catch (error) { failed = error.message; }
  clearInterval(captionTimer);
  if (playing !== job.id) return;
  playing = null;
  speaking = false;
  currentCaptionText = "";
  currentCaptionPage = "";
  if (captionPageNode) captionPageNode.hidden = true;
  if (isSetup) updateCaptionPreview();
  else captionNode.hidden = true;
  ack = {id: job.id, failed};
}

const MOUTH_SAMPLE_MS = 40;
const MOUTH_SAMPLES = 16;

function visualSnapshot() {
  if (!playing || flower.action === "IDLE") return null;
  const elapsed = Math.round(performance.now() - flower.start);
  const duration = Math.round(flower.end - flower.start);
  if (elapsed >= duration) return null;
  const audioTime = voice.context.currentTime;
  const mouth = Array.from({length: MOUTH_SAMPLES}, (_, i) => {
    const time = audioTime + i * MOUTH_SAMPLE_MS / 1000;
    const track = voice.mouthTracks.find(part => time >= part.start && time < part.start + part.duration);
    return track ? Math.round(100 * Math.max(0, Math.min(1, track.levelAt(time - track.start)))) : 0;
  });
  return {elapsed, duration, mouth, voiced: flower.voiceOn, silentTalk: flower.silentTalk, text: currentCaptionText || "", page: currentCaptionPage || ""};
}

function showMirror(visual) {
  if (!visual || visual.elapsed + visual.age >= visual.duration) {
    if (playing) flower.play("IDLE", Infinity);
    playing = null;
    flower.voiceOn = false;
    currentCaptionText = "";
    currentCaptionPage = "";
    if (captionPageNode) captionPageNode.hidden = true;
    if (isSetup) updateCaptionPreview();
    else captionNode.hidden = true;
    return;
  }
  const now = performance.now();
  const elapsed = visual.elapsed + visual.age;
  if (playing !== visual.id || flower.action !== visual.action) {
    flower.play(visual.action, visual.duration, visual.silentTalk);
    flower.start = now - elapsed;
    flower.end = flower.start + visual.duration;
  }
  playing = visual.id;
  flower.voiceOn = visual.voiced;
  flower.readMouth = () => {
    const sample = Math.floor((performance.now() - now + visual.age) / MOUTH_SAMPLE_MS);
    return (visual.mouth[sample] ?? 0) / 100;
  };
  captionTextNode.textContent = visual.text || "";
  if (captionPageNode) {
    if (visual.page) {
      captionPageNode.textContent = visual.page;
      captionPageNode.hidden = false;
    } else {
      captionPageNode.hidden = true;
    }
  }
  captionNode.hidden = parameters.get("captions") !== "1" || !visual.text;
}

async function pollMirror() {
  try {
    const result = await requestApi("render", {renderer, mirror: true});
    flower.colors = BongHoa.colors[result.palette] || BongHoa.colors.dao;
    flower.setMode(result.mode);
    showLive(result.live);
    showMirror(result.visual);
  } catch {
    showMirror(null);
    showLive(null);
  }
  setTimeout(pollMirror, playing ? 120 : 240);
}

async function poll() {
  try {
    if (!ready && voice.context?.state === "running") {
      ready = true;
      setUnlock();
    }
    if (ready && voice.context?.state !== "running") {
      ready = false;
      void enableAudio();
    }
    const sent = ack;
    const forceClaim = claimPrimary;
    const result = await requestApi("render", {
      renderer, ready, force: forceClaim, playing, ack: sent,
      surface: isSetup ? "setup" : "plain",
      visual: mirrorActive ? visualSnapshot() : null
    });
    resultAccepted = Boolean(result.accepted);
    if (forceClaim && resultAccepted) claimPrimary = false;
    setUnlock();
    if (lastSeen && (!result.accepted || boot !== result.boot || generation !== result.generation)) clearPlayback();
    if (ack === sent) ack = null;
    lastSeen = performance.now();
    boot = result.boot;
    generation = result.generation;
    retries = 0;
    flower.colors = BongHoa.colors[result.palette] || BongHoa.colors.dao;
    flower.setMode(result.mode);
    light = result.mode === "light";
    mirrorActive = result.mirrorActive === true;
    if (result.job && !playing) void playJob(result.job);
    showLive(result.live);
  } catch {
    if (performance.now() - lastSeen > 2600) {
      if (playing) clearPlayback();
      showLive(null);
    }
    retries = Math.min(retries + 1, 4);
  }
  const interval = playing && mirrorActive ? 140 : light && !playing && !ack ? 850 : 430;
  setTimeout(poll, retries ? 550 * retries : interval);
}
if (mirror) void pollMirror();
else void poll();
