"use strict";
(() => {
  const actions = {
    IDLE: "Đứng chờ", TALK: "Trò chuyện", WAVE: "Vẫy chào", LAUGH: "Cười lớn",
    THINK: "Suy nghĩ", SHOCK: "Ngạc nhiên", LOVE: "Thả tim", SHY: "Ngại ngùng",
    ANGRY: "Hờn dỗi", SAD: "Buồn", LIKE: "Giơ ngón cái", BOW: "Cúi chào",
    TIRED: "Ngáp ngủ", POINT: "Chỉ tay", SCARED: "Lo lắng", HAPPY: "Ăn mừng",
    WINGS: "Xòe cánh", FLY: "Bay tại chỗ"
  };
  const poses = {
    IDLE: [[-53, 29, -59, 63], [54, 26, 57, 60], 0, 0],
    TALK: [[-58, 29, -63, 52], [72, 17, 105, 1], -.035, 0],
    WAVE: [[-53, 30, -59, 58], [103, -9, 133, -67], -.07, 2],
    LAUGH: [[-47, 20, -13, 42], [48, 22, 15, 42], .05, -4],
    THINK: [[-43, 26, 13, 36], [51, 12, 23, -57], .14, 1],
    SHOCK: [[-78, -11, -62, -77], [78, -11, 61, -77], -.05, 7],
    LOVE: [[-48, 26, -17, 33], [49, 26, 17, 33], -.035, -2],
    SHY: [[-47, 29, -5, 40], [47, 29, 5, 40], .13, 6],
    ANGRY: [[-46, 24, 22, 35], [46, 24, -22, 33], -.07, 1],
    SAD: [[-78, -43, -38, -96], [48, 37, 43, 61], .12, 9],
    LIKE: [[-53, 29, -62, 61], [72, 22, 96, -4], -.08, -2],
    BOW: [[-43, 28, -8, 54], [43, 28, 8, 54], .18, 34],
    TIRED: [[-51, 32, -58, 62], [74, -5, 14, -71], .14, 14],
    POINT: [[-49, 30, -57, 55], [65, 12, 102, -12], .09, 0],
    SCARED: [[-47, 20, -22, 18], [46, 20, 23, 15], -.11, 8],
    HAPPY: [[-104, 1, -149, -64], [104, 1, 149, -64], -.04, -5],
    WINGS: [[-63, 26, -73, 49], [63, 26, 73, 49], .025, 1],
    FLY: [[-69, 17, -102, 22], [69, 17, 102, 22], -.045, -3]
  };
  const colors = {
    dao: ["#ff977d", "#ffad95", "#ffbd9e", "#e58578"],
    nang: ["#ffb84d", "#ffd177", "#ffe1a3", "#ea9944"],
    tim: ["#bca0ee", "#d2b9ff", "#ead2ff", "#a383dd"],
    xanh: ["#69cdbb", "#94e3c9", "#c7eed4", "#54acac"]
  };
  const ink = "#291d25";
  const waveFrames = [-20, -2, 22, 5, -20];
  const tau = Math.PI * 2;
  const mix = (a, b, t) => a + (b - a) * t;

  class Flower {
    constructor(canvas, palette = "dao") {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.colors = colors[palette] || colors.dao;
      this.action = "IDLE";
      this.start = performance.now();
      this.end = Infinity;
      this.pose = poses.IDLE.flat();
      this.blink = this.start + 2000;
      this.level = 0;
      this.wings = .1;
      this.voiceOn = false;
      this.readMouth = () => 0;
      this.silentTalk = false;
      this.last = 0;
      this.mode = "normal";
      this.nativeWidth = canvas.width;
      this.nativeHeight = canvas.height;
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    setMode(mode) {
      if (!["normal", "light"].includes(mode) || this.mode === mode) return;
      this.mode = mode;
      const scale = mode === "light" ? .75 : 1;
      this.canvas.width = Math.round(this.nativeWidth * scale);
      this.canvas.height = Math.round(this.nativeHeight * scale);
      this.canvas.dataset.mode = mode;
    }

    play(action, duration = 1800, silentTalk = action === "TALK") {
      this.action = poses[action] ? action : "IDLE";
      this.silentTalk = silentTalk;
      this.start = performance.now();
      this.end = this.start + duration;
    }

    ellipse(x, y, rx, ry, fill, stroke = null, width = 5, rotation = 0) {
      const c = this.ctx;
      c.beginPath();
      c.ellipse(x, y, rx, ry, rotation, 0, tau);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.lineWidth = width; c.strokeStyle = stroke; c.stroke(); }
    }

    line(points, stroke = ink, width = 6) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(...points[0]);
      for (const p of points.slice(1)) c.lineTo(...p);
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }

    curve(x, y, cx, cy, ex, ey, stroke = ink, width = 5) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(cx, cy, ex, ey);
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }

    heart(x, y, size, hue = "#f35f76", outline = ink) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.scale(size, size);
      c.beginPath();
      c.moveTo(0, 13);
      c.bezierCurveTo(-36, -9, -14, -25, 0, -13);
      c.bezierCurveTo(14, -25, 36, -9, 0, 13);
      c.fillStyle = hue;
      c.fill();
      c.strokeStyle = outline;
      c.lineWidth = 4;
      c.stroke();
      c.restore();
    }

    eye(x, y, side, action, blink) {
      if (action === "LOVE" && !blink) {
        this.heart(x, y + 4, .34, "#e45268");
        return;
      }
      if (blink || action === "TIRED" || action === "BOW" || (action === "LIKE" && side === 1)) {
        this.curve(x - 11, y, x, y + 9, x + 11, y, ink, 4.8);
        return;
      }
      if (action === "HAPPY" || action === "LAUGH" || action === "SAD") {
        this.curve(x - 11, y + 3, x, y + (action === "SAD" ? 12 : -15), x + 11, y + 3, ink, 5);
        return;
      }
      if (action === "SHOCK" || action === "SCARED") {
        this.ellipse(x, y, 11, 14, "#fff3dc", ink, 4);
        this.ellipse(x + side, y + 1, 4, 5, ink);
        return;
      }
      const look = action === "POINT" ? 5 : action === "THINK" ? 3 : 0;
      this.ellipse(x + look, y + (action === "THINK" ? -4 : 0), 5.5, 8, ink);
      if (action === "ANGRY" || action === "THINK")
        this.line([[x - 11, y - 16 + side * 4], [x + 11, y - 16 - side * 4]], ink, 3.8);
    }

    mouth(action, openness) {
      const c = this.ctx;
      if (openness < .12) {
        if (action === "SCARED") {
          this.line([[-14, 26], [-7, 21], [0, 26], [7, 21], [14, 26]], ink, 4);
        } else if (["SHOCK", "TIRED"].includes(action)) {
          this.ellipse(0, 26, 7, 9, ink);
        } else if (action === "THINK") {
          this.curve(-7, 26, 2, 22, 11, 26, ink, 4.5);
        } else if (action === "SAD" || action === "ANGRY") {
          this.curve(-13, 28, 0, 16, 13, 28, ink, 4.5);
        } else {
          this.curve(-14, 22, 0, 36, 14, 22, ink, 5);
        }
        return;
      }
      if (["SHOCK", "SCARED", "TIRED"].includes(action)) {
        this.ellipse(0, 25, 7 + 4 * openness, 6 + 8 * openness, "#4b2734", ink, 3.5);
        return;
      }
      const hw = 11 + openness * 9;
      c.beginPath();
      c.moveTo(-hw, 21);
      c.quadraticCurveTo(0, 24 + openness * 2, hw, 21);
      c.bezierCurveTo(hw - 2, 29 + openness * 15, -hw + 2, 29 + openness * 15, -hw, 21);
      c.fillStyle = "#4b2734";
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 3.8;
      c.stroke();
      if (openness > .55) this.ellipse(0, 32, 9, 3.3, "#f38293");
    }

    wing(side, openness, shimmer) {
      const c = this.ctx;
      c.save();
      c.scale(side, 1);
      c.translate(18, -17);
      c.rotate(-openness * .93);
      c.scale(1 + .30 * openness, 1);
      c.beginPath();
      c.moveTo(2, 0);
      c.bezierCurveTo(43, 7, 56, 42, 50, 77);
      c.bezierCurveTo(47, 96, 35, 113, 19, 113);
      c.bezierCurveTo(0, 100, -10, 32, 2, 0);
      c.closePath();
      const fill = c.createLinearGradient(4, 14, 48, 103);
      fill.addColorStop(0, "#8a5240");
      fill.addColorStop(.56, openness > .24 ? "#c67d4c" : "#a06246");
      fill.addColorStop(1, "#693a36");
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = ink;
      c.stroke();
      this.curve(11, 16, 33, 51, 23, 102, "#583236", 3.5);
      this.curve(20, 39, 31, 45, 44, 49, "#834637", 2.7);
      this.curve(24, 60, 34, 65, 43, 73, "#834637", 2.7);
      this.curve(29, 27, 42, 40, 43, 63, shimmer ? "#ffc78c" : "#cd8c5d", 2.6);
      c.restore();
    }

    frame(now) {
      requestAnimationFrame(this.frame);
      const active = this.voiceOn || this.action !== "IDLE";
      const interval = this.mode === "light" ? (active ? 52 : 104) : (active ? 29 : 50);
      if (now - this.last < interval) return;
      const delta = this.last ? now - this.last : 33;
      this.last = now;
      if (now > this.end && this.action !== "IDLE") this.play("IDLE", Infinity);
      const c = this.ctx;
      const action = this.action;
      const elapsed = (now - this.start) / 1000;
      const t = now / 1000;
      const tremble = action === "SCARED" ? Math.sin(elapsed * 42) * 3 : 0;
      const jump = action === "HAPPY" ? Math.pow(Math.abs(Math.sin(elapsed * 6.4)), 1.7) * 25 :
        action === "LAUGH" ? Math.abs(Math.sin(elapsed * 15)) * 10 : 0;
      const flying = action === "FLY";
      const flightLift = flying ? Math.min(1, elapsed * 4, Math.max(0, (this.end - now) / 360)) * (32 + Math.sin(elapsed * 12) * 7) : 0;
      const wingTarget = flying ? .79 + Math.sin(elapsed * 35) * .18 :
        action === "WINGS" ? .90 : action === "HAPPY" ? .41 : .08 + Math.sin(t * 2.3) * .025;
      this.wings = mix(this.wings, wingTarget, 1 - Math.exp(-delta / (flying ? 26 : 100)));
      this.canvas.dataset.wings = this.wings > .50 ? "open" : "folded";
      const stomp = action === "ANGRY" ? Math.max(0, Math.sin(elapsed * 16)) * 9 : 0;
      const target = poses[action].flat();
      if (action === "WAVE") {
        const phase = (elapsed / .58 * 4) % 4;
        const step = Math.floor(phase);
        target[6] += mix(waveFrames[step], waveFrames[step + 1], phase - step);
        target[7] += Math.sin(elapsed * 12) * 7;
      }
      if (action === "TALK") {
        target[6] += Math.sin(elapsed * 7) * 11;
        target[7] += Math.cos(elapsed * 7) * 11;
      }
      if (action === "HAPPY") {
        target[2] -= Math.sin(elapsed * 10) * 12;
        target[6] += Math.sin(elapsed * 10) * 12;
      }
      if (action === "THINK") target[7] += Math.sin(elapsed * 5) * 3;
      this.pose = target.map((value, i) => mix(this.pose[i], value, 1 - Math.exp(-delta / 75)));
      const [lex, ley, lx, ly, rex, rey, rx, ry, tilt, headY] = this.pose;
      if (now - this.blink > 145) this.blink = now + 2100 + Math.random() * 1900;
      const blinking = now >= this.blink;
      const audioMouth = this.voiceOn ? this.readMouth() : 0;
      this.level = mix(this.level, audioMouth, audioMouth > this.level ? .85 : .67);
      let previewMouth = 0;
      if (!this.voiceOn && action === "LAUGH") previewMouth = .64 + Math.sin(elapsed * 12) * .25;
      if (!this.voiceOn && this.silentTalk && action === "TALK") {
        const syllables = [0, .39, .92, .58, 0, .32, .74, .25, 0, 0, .51, .89, .35, 0];
        previewMouth = syllables[Math.floor(elapsed / .083) % syllables.length];
      }
      const openness = Math.max(this.level, previewMouth);
      this.canvas.dataset.mouth = openness < .12 ? "closed" : openness < .55 ? "small" : "open";
      this.canvas.dataset.action = action;
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.save();
      c.scale(this.canvas.width / 480, this.canvas.height / 530);
      c.lineCap = "round";
      c.lineJoin = "round";
      this.ellipse(240, 489, 80 - (jump + flightLift) * .57, 11, "rgba(36,20,28,.17)");
      c.translate(240 + tremble, 350 - jump - flightLift + Math.sin(t * 2.25) * 2.6);
      this.wing(-1, this.wings, flying);
      this.wing(1, this.wings, flying);
      this.curve(-30, 47, -59, 62, -61, 83, ink, 4);
      this.curve(30, 47, 59, 62, 61, 83, ink, 4);

      // Limbs have their own joints. The face follows the head transform.
      this.curve(-24, 66, -31, 107, -38, 121, ink, 9);
      this.curve(24, 64, 34, 96 - stomp, 43, 120 - stomp, ink, 9);
      this.ellipse(-45, 124, 18, 8, "#45303b", ink, 5, -.12);
      this.ellipse(46, 124 - stomp, 18, 8, "#45303b", ink, 5, .13);
      this.ellipse(0, 27, 45, 63, "#76463b", ink, 8, -.10);
      this.curve(-23, 32, -28, 54, -13, 66, "#995f47", 6);
      this.curve(-33, 16, lex, ley, lx, ly, ink, 8);
      this.curve(33, 14, rex, rey, rx, ry, ink, 8);
      this.ellipse(lx, ly, 8, 8, ink);
      this.ellipse(rx, ry, 8, 8, ink);
      if (action === "LIKE") this.line([[rx, ry], [rx + 4, ry - 15]], ink, 7);
      if (action === "POINT") this.line([[rx, ry], [rx + 17, ry - 3]], ink, 6);
      if (action === "LOVE") this.heart(0, 32 + Math.sin(elapsed * 8) * 3, 1.16);
      c.save();
      c.translate(0, -119 + headY);
      c.rotate(tilt + Math.sin(t * 2.1) * .025);
      for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate(i * tau / 5);
        this.ellipse(0, -78, 44, 64, this.colors[i % 4], ink, 8);
        this.curve(-17, -101, -9, -123, 8, -124, "rgba(255,247,209,.61)", 5);
        c.restore();
      }
      this.ellipse(0, 0, 77, 67, "#efbb80", ink, 8);
      this.curve(-57, -19, -52, -33, -40, -39, "#ffd3a1", 5);
      const cheek = action === "SHY" ? "#ef7e82" : "#eb9280";
      this.ellipse(-45, 14, 14, 7, cheek, null, 0, .15);
      this.ellipse(45, 14, 14, 7, cheek, null, 0, -.15);
      if (action === "SHY") {
        for (const side of [-1, 1]) {
          for (let i = -1; i <= 1; i++) this.line([[side * 45 + i * 6, 17], [side * 45 + i * 6 + 3, 11]], "#b34e60", 1.6);
        }
      }
      this.eye(-27, -8, -1, action, blinking);
      this.eye(27, -8, 1, action, blinking);
      this.mouth(action, openness);
      if (action === "SAD") {
        const drop = (elapsed * 37) % 24;
        this.ellipse(33, 12 + drop, 4, 8, "#7bcde8", "#356480", 2);
        this.ellipse(-32, 24 + ((drop + 10) % 20), 4, 8, "#7bcde8", "#356480", 2);
      }
      c.restore();
      // Bring the fingertips forward where a gesture touches the petals or face.
      if (action === "SAD" || action === "SHOCK") {
        this.curve(mix(lex, lx, .31), mix(ley, ly, .47), lx - 9, ly + 12, lx, ly, ink, 7);
        this.ellipse(lx, ly, 7, 7, ink);
      }
      if (action === "THINK" || action === "TIRED" || action === "SHOCK") {
        this.curve(mix(rex, rx, .31), mix(rey, ry, .47), rx + 11, ry + 10, rx, ry, ink, 7);
        this.ellipse(rx, ry, 7, 7, ink);
      }
      if (action === "HAPPY" || action === "LOVE" || action === "SHOCK") {
        for (let i = 0; i < 5; i++) {
          const p = (elapsed * .82 + i * .2) % 1;
          const x = (i % 2 ? 1 : -1) * (99 + i * 8 + p * 21);
          const y = -82 - p * 103 - i * 9;
          c.globalAlpha = Math.sin(p * Math.PI) * .95;
          if (action === "LOVE") this.heart(x, y, .35);
          else {
            this.line([[x - 6, y], [x + 6, y]], this.colors[i % 4], 4);
            this.line([[x, y - 6], [x, y + 6]], this.colors[i % 4], 4);
          }
        }
        c.globalAlpha = 1;
      }
      c.restore();
    }
  }

  class Voice {
    constructor(flower) {
      this.flower = flower;
      this.serial = 0;
      this.sources = [];
      this.gains = [];
      this.mouthTracks = [];
      this.recordings = new Map();
      flower.readMouth = () => {
        const time = this.context.currentTime;
        for (const track of this.mouthTracks) {
          const offset = time - track.start;
          if (offset >= 0 && offset < track.duration) return track.levelAt(offset);
        }
        return 0;
      };
    }

    async unlock() {
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === "running") return true;
      return Promise.race([
        this.context.resume().then(() => this.context.state === "running", () => false),
        new Promise(resolve => setTimeout(() => resolve(false), 750))
      ]);
    }

    stop() {
      this.serial++;
      for (const source of this.sources) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      this.sources = [];
      for (const gain of this.gains) gain.disconnect();
      this.gains = [];
      this.mouthTracks = [];
      if (this.finish) this.finish();
      this.flower.voiceOn = false;
      this.flower.level = 0;
      this.flower.play("IDLE", Infinity);
    }

    async recording(name) {
      if (!this.recordings.has(name)) {
        this.recordings.set(name, await BongEffects.decodeClip(this.context, BongRecordings[name]));
      }
      return this.recordings.get(name);
    }

    async effect(action) {
      if (location.protocol === "http:") {
        try {
          const response = await fetch("/effects/" + action, {signal: AbortSignal.timeout(1250)});
          if (response.ok && response.status !== 204) {
            const clip = await this.context.decodeAudioData(await response.arrayBuffer());
            if (clip.duration >= .04 && clip.duration <= 4) return clip;
          }
        } catch {
          // A missing, invalid, or slow user clip falls back to the bundled recording.
        }
      }
      if (Object.hasOwn(BongEffects.descriptions, action)) return this.recording(action);
      return null;
    }

    async play(job) {
      this.stop();
      const serial = this.serial;
      if (!await this.unlock()) throw new Error("unlock");
      let speech, effect;
      try {
        if (job.audio) speech = await BongEffects.decodeClip(this.context, job.audio);
        else if (job.demo) speech = await this.recording("SPEECH");
      } catch {
        throw new Error("decode");
      }
      if (job.effect) {
        try { effect = await this.effect(job.action); } catch { effect = null; }
        if (!effect && job.requireEffect) throw new Error("effect");
      }
      if (serial !== this.serial) return;
      const parts = [];
      if (effect) parts.push({
        buffer: effect, offset: 0, mouth: !["WINGS", "FLY"].includes(job.action), gain: job.effectGain ?? 1
      });
      if (speech) parts.push({buffer: speech, offset: effect ? effect.duration + .14 : 0, mouth: true});
      const last = parts.at(-1);
      const duration = last ? (last.buffer.duration + last.offset) * 1000 : 1850;
      this.flower.play(job.action, Math.max(duration, job.action === "WINGS" ? 1250 : 0) + 70, !last && job.action === "TALK");
      this.flower.voiceOn = parts.length > 0;
      await new Promise(resolve => {
        let timer;
        const done = () => {
          clearTimeout(timer);
          this.finish = null;
          if (serial === this.serial) {
            for (const source of this.sources) source.disconnect();
            this.sources = [];
            for (const gain of this.gains) gain.disconnect();
            this.gains = [];
            this.mouthTracks = [];
            this.flower.voiceOn = false;
          }
          resolve();
        };
        this.finish = done;
        if (!last) {
          timer = setTimeout(done, duration);
          return;
        }
        const tracks = parts.filter(part => part.mouth).map(part => ({
          duration: part.buffer.duration,
          offset: part.offset,
          levelAt: BongEffects.clipEnvelope(part.buffer)
        }));
        const start = this.context.currentTime + .045;
        this.mouthTracks = tracks.map(track => ({...track, start: start + track.offset}));
        for (const part of parts) {
          const source = this.context.createBufferSource();
          source.buffer = part.buffer;
          if (part.gain != null && part.gain !== 1) {
            const gain = this.context.createGain();
            gain.gain.value = part.gain;
            source.connect(gain);
            gain.connect(this.context.destination);
            this.gains.push(gain);
          } else {
            source.connect(this.context.destination);
          }
          this.sources.push(source);
          if (part === last) source.onended = done;
          source.start(start + part.offset);
        }
      });
    }
  }
  window.BongHoa = { actions, colors, Flower, Voice };
})();
