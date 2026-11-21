"use strict";
const parameters = new URLSearchParams(location.search);
const flower = new BongHoa.Flower(document.getElementById("flower"));
const mirror = parameters.get("mirror") === "1";
const voice = mirror ? null : new BongHoa.Voice(flower);
const unlock = document.getElementById("unlock");
const captionNode = document.getElementById("caption");
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
let playing = null;
let lastSeen = 0;
let ack = null;
let retries = 0;
let light = false;
let mirrorActive = false;
document.body.classList.toggle("solid", parameters.get("bg") === "1");

function setUnlock() {
  unlock.hidden = (ready && !musicBlocked) || parameters.get("setup") !== "1";
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
  if (musicUrl) startMusic();
  try { ready = await voice.unlock(); } catch { ready = false; }
  setUnlock();
}
unlock.addEventListener("click", enableAudio);
if (!mirror) void enableAudio();

function clearPlayback() {
  playing = null;
  speaking = false;
  ack = null;
  voice.stop();
  captionNode.hidden = true;
}

async function playJob(job) {
  playing = job.id;
  speaking = Boolean(job.audio || job.demo);
  captionNode.textContent = job.text || "";
  captionNode.hidden = parameters.get("captions") !== "1" || !job.text;
  let failed = null;
  try { await voice.play(job); } catch (error) { failed = error.message; }
  if (playing !== job.id) return;
  playing = null;
  speaking = false;
  captionNode.hidden = true;
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
  return {elapsed, duration, mouth, voiced: flower.voiceOn, silentTalk: flower.silentTalk};
}

function showMirror(visual) {
  if (!visual || visual.elapsed + visual.age >= visual.duration) {
    if (playing) flower.play("IDLE", Infinity);
    playing = null;
    flower.voiceOn = false;
    captionNode.hidden = true;
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
  captionNode.textContent = visual.text;
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
    const result = await requestApi("render", {renderer, ready, playing, ack: sent, surface: parameters.get("setup") === "1" ? "setup" : "plain", visual: mirrorActive ? visualSnapshot() : null});
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
