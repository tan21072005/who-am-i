"use strict";
(() => {
  const descriptions = {
    LAUGH: "Tiếng cười", SAD: "Tiếng khóc", TIRED: "Tiếng ngáp",
    SHOCK: "Tiếng giật mình", SCARED: "Tiếng thở hồi hộp",
    HAPPY: "Tiếng reo vui", WINGS: "Tiếng xòe cánh", FLY: "Tiếng đập cánh"
  };

  function decodeClip(context, encoded) {
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    return context.decodeAudioData(bytes.buffer);
  }

  function clipEnvelope(buffer) {
    // Measure the decoded signal in 20 ms windows, then scale each clip to its own level.
    const interval = .02;
    const width = Math.max(1, Math.round(buffer.sampleRate * interval));
    const frames = new Float32Array(Math.ceil(buffer.length / width));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const pcm = buffer.getChannelData(channel);
      for (let i = 0; i < frames.length; i++) {
        const start = i * width;
        const end = Math.min(pcm.length, start + width);
        let energy = 0;
        for (let sample = start; sample < end; sample++) energy += pcm[sample] * pcm[sample];
        frames[i] = Math.max(frames[i], Math.sqrt(energy / (end - start)));
      }
    }
    const voiced = Array.from(frames).filter(value => value > .002).sort((a, b) => a - b);
    const scale = Math.max(.009, voiced[Math.floor(voiced.length * .88)] || 0);
    const gate = Math.max(.002, scale * .14);
    return (seconds) => {
      if (seconds < 0 || seconds >= buffer.duration) return 0;
      const index = Math.min(Math.floor(seconds / interval), frames.length - 1);
      const value = frames[index];
      if (value <= gate) return 0;
      return Math.min(1, Math.pow((value - gate) / (scale - gate), .64));
    };
  }

  window.BongEffects = {
    descriptions, decodeClip, clipEnvelope,
    demoText: "Chúc mừng!"
  };
})();
