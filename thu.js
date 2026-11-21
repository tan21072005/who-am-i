"use strict";
const previewFlower = new BongHoa.Flower(document.getElementById("flower"));
const previewVoice = new BongHoa.Voice(previewFlower);
const labels = BongHoa.actions;
const actionsNode = document.getElementById("actions");
const caption = document.getElementById("caption");
const effectButton = document.getElementById("effect");
let selected = "WINGS";
let sequence = 0;
let captionTimer;

function setCaption(text, duration = 1850) {
  clearTimeout(captionTimer);
  caption.textContent = text;
  if (duration) captionTimer = setTimeout(() => { caption.textContent = labels.IDLE; }, duration);
}

function selectAction(action) {
  selected = action;
  effectButton.disabled = !(action in BongEffects.descriptions);
  for (const button of actionsNode.children) button.setAttribute("aria-pressed", String(button.dataset.action === action));
}

function interrupt() {
  sequence++;
  previewVoice.stop();
  setCaption(labels.IDLE, 0);
}

for (const [action, label] of Object.entries(labels)) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener("click", () => {
    selectAction(action);
    if (action === "TALK") void playSound(false);
    else if (action in BongEffects.descriptions) void playSound(true);
    else {
      interrupt();
      previewFlower.play(action);
      setCaption(label);
    }
  });
  actionsNode.append(button);
}
selectAction(selected);

async function playSound(effect) {
  interrupt();
  const current = sequence;
  const action = selected === "IDLE" ? "TALK" : selected;
  setCaption(effect ? BongEffects.descriptions[action] : BongEffects.demoText, 0);
  try {
    await previewVoice.play({action, demo: !effect, effect});
    if (sequence === current) setCaption(labels.IDLE, 0);
  } catch {
    if (sequence !== current) return;
    previewFlower.play(action);
    setCaption("Hãy bấm nút phát lần nữa để thử âm thanh.", 0);
  }
}
effectButton.addEventListener("click", () => playSound(true));
document.getElementById("sound").addEventListener("click", () => playSound(false));
document.getElementById("sequence").addEventListener("click", async () => {
  interrupt();
  const current = sequence;
  for (const [action, label] of Object.entries(labels)) {
    if (sequence !== current) break;
    selectAction(action);
    previewFlower.play(action, 1300);
    setCaption(label, 0);
    await new Promise(resolve => setTimeout(resolve, 1340));
  }
  if (sequence === current) setCaption(labels.IDLE, 0);
});
document.getElementById("stop").addEventListener("click", interrupt);
document.getElementById("palette").addEventListener("change", event => {
  previewFlower.colors = BongHoa.colors[event.target.value];
});
