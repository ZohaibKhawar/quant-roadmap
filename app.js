"use strict";

/* Browser storage can be blocked, so the page has to work without it. */
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not saved */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* nothing to clear */ } },
};

/* ---------- Hero: random walks with drift ---------- */

const PATHS = 200;
const STEPS = 100;
const YEARS = 4;
const BAR = 4;
const Y_MIN = -4;
const Y_MAX = 10;

const canvas = document.getElementById("sim-canvas");
const ctx = canvas.getContext("2d");
const muInput = document.getElementById("mu");
const sigmaInput = document.getElementById("sigma");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let shocks = [];
let animation = 0;

function standardNormal() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function newShocks() {
  shocks = Array.from({ length: PATHS }, () =>
    Float64Array.from({ length: STEPS }, standardNormal));
}

/* Normal CDF, Abramowitz and Stegun 26.2.17. */
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const tail = pdf * t * (0.31938153 + t * (-0.356563782 + t *
    (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/* X_T is normal with mean mu*T and variance sigma^2*T. */
function chanceAboveBar(mu, sigma) {
  return 1 - normalCdf((BAR - mu * YEARS) / (sigma * Math.sqrt(YEARS)));
}

function buildPaths(mu, sigma) {
  const dt = YEARS / STEPS;
  return shocks.map((row) => {
    const points = new Float64Array(STEPS + 1);
    for (let i = 0; i < STEPS; i++) {
      points[i + 1] = points[i] + mu * dt + sigma * Math.sqrt(dt) * row[i];
    }
    return points;
  });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw(paths, progress) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const bottom = 28;
  const top = 8;
  const x = (step) => (step / STEPS) * (width - 2) + 1;
  const y = (value) => top + (Y_MAX - value) / (Y_MAX - Y_MIN) * (height - top - bottom);
  const lastStep = Math.ceil(STEPS * progress);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, width, height - top - bottom);
  ctx.clip();
  ctx.lineJoin = "round";
  [false, true].forEach((above) => {
    ctx.strokeStyle = cssVar(above ? "--path-strong" : "--path-weak");
    ctx.lineWidth = width < 640 ? 0.6 : (above ? 1.1 : 1);
    ctx.beginPath();
    paths.forEach((points) => {
      if ((points[STEPS] >= BAR) !== above) return;
      ctx.moveTo(x(0), y(points[0]));
      for (let i = 1; i <= lastStep; i++) ctx.lineTo(x(i), y(points[i]));
    });
    ctx.stroke();
  });
  ctx.restore();

  const pencil = cssVar("--pencil");
  ctx.strokeStyle = pencil;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 6]);
  ctx.beginPath();
  ctx.moveTo(0, y(BAR));
  ctx.lineTo(width, y(BAR));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = pencil;
  ctx.font = '600 15px "Hanken Grotesk", "Segoe UI", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("Hiring bar", 6, y(BAR) - 8);

  ctx.fillStyle = cssVar("--muted");
  ctx.font = '14px "Hanken Grotesk", "Segoe UI", sans-serif';
  const baseline = height - 8;
  ctx.fillText("Today", 2, baseline);
  ctx.textAlign = "right";
  ctx.fillText(`${YEARS} years`, width - 2, baseline);
  ctx.textAlign = "left";
}

function render(animate) {
  const mu = Number(muInput.value);
  const sigma = Number(sigmaInput.value);
  document.getElementById("mu-out").value = mu.toFixed(1);
  document.getElementById("sigma-out").value = sigma.toFixed(1);

  const paths = buildPaths(mu, sigma);
  const above = paths.filter((points) => points[STEPS] >= BAR).length;
  const formula = chanceAboveBar(mu, sigma) * 100;
  document.getElementById("sim-result").textContent =
    `${above} of ${PATHS} paths finished above the bar (${(above / PATHS * 100).toFixed(0)}%). The formula predicts ${formula.toFixed(1)}%.`;
  canvas.setAttribute("aria-label",
    `Simulated random paths over ${YEARS} years. ${above} of ${PATHS} finish above the hiring bar.`);

  cancelAnimationFrame(animation);
  if (!animate || reduceMotion.matches || document.hidden) {
    draw(paths, 1);
    return;
  }
  const started = performance.now();
  const frame = (now) => {
    const progress = Math.min((now - started) / 1400, 1);
    draw(paths, progress);
    if (progress < 1) animation = requestAnimationFrame(frame);
  };
  draw(paths, 0);
  animation = requestAnimationFrame(frame);
}

newShocks();
document.getElementById("sim-controls").hidden = false;
render(true);
muInput.addEventListener("input", () => render(false));
sigmaInput.addEventListener("input", () => render(false));
document.getElementById("rerun").addEventListener("click", () => {
  newShocks();
  render(true);
});
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(false), 120);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render(false));

/* ---------- Roadmap: role filter and checklist ---------- */

const ROLE_KEY = "quant-roadmap-role";
const DONE_KEY = "quant-roadmap-done";
const ROLE_NAMES = { all: "all three routes", r: "the researcher route", t: "the trader route", d: "the developer route" };
const NEED_LABELS = ["Optional", "Useful", "Core"];

const items = [...document.querySelectorAll(".checks li")];
const boxes = items.map((item) => item.querySelector("input"));
const radios = [...document.querySelectorAll('input[name="role"]')];

function loadDone() {
  try {
    const saved = JSON.parse(store.get(DONE_KEY));
    return Array.isArray(saved) ? new Set(saved) : new Set();
  } catch {
    return new Set();
  }
}

const done = loadDone();
boxes.forEach((box) => { box.checked = done.has(box.id); });

items.forEach((item) => {
  const holder = item.querySelector("label > span");
  const text = document.createElement("span");
  text.className = "item-text";
  text.append(...holder.childNodes);
  const tag = document.createElement("span");
  tag.className = "tag";
  holder.append(text, tag);
});

function currentRole() {
  return radios.find((radio) => radio.checked).value;
}

/* With no role picked, an item counts as core if any route needs it as core. */
function needFor(item, role) {
  if (role === "all") return Math.max(Number(item.dataset.r), Number(item.dataset.t), Number(item.dataset.d));
  return Number(item.dataset[role]);
}

function updateProgress() {
  const role = currentRole();
  const core = items.filter((item) => needFor(item, role) === 2);
  const finished = core.filter((item) => item.querySelector("input").checked).length;
  document.getElementById("progress").textContent =
    `${finished} of ${core.length} core items done on ${ROLE_NAMES[role]}.`;

  document.querySelectorAll("[data-count]").forEach((count) => {
    const inStage = core.filter((item) => item.closest(".stage").id === count.dataset.count);
    const doneHere = inStage.filter((item) => item.querySelector("input").checked).length;
    count.textContent = `${doneHere} of ${inStage.length} core`;
  });
}

function applyRole(role) {
  items.forEach((item) => {
    const need = needFor(item, role);
    const tag = item.querySelector(".tag");
    if (role === "all") {
      delete item.dataset.need;
      tag.textContent = "";
    } else {
      item.dataset.need = String(need);
      tag.textContent = NEED_LABELS[need];
    }
  });

  const columns = { r: 2, t: 3, d: 4 };
  document.querySelectorAll(".jobs tr").forEach((row) => {
    [...row.children].forEach((cell, index) => {
      cell.classList.toggle("picked", columns[role] === index + 1);
    });
  });
  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.pick === role));
  });
  updateProgress();
}

function setRole(role) {
  radios.forEach((radio) => { radio.checked = radio.value === role; });
  store.set(ROLE_KEY, role);
  applyRole(role);
}

radios.forEach((radio) => radio.addEventListener("change", () => setRole(radio.value)));
document.querySelectorAll("[data-pick]").forEach((button) => {
  button.addEventListener("click", () => {
    setRole(button.dataset.pick);
    document.getElementById("route").scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  });
});

boxes.forEach((box) => {
  box.addEventListener("change", () => {
    if (box.checked) done.add(box.id); else done.delete(box.id);
    store.set(DONE_KEY, JSON.stringify([...done]));
    updateProgress();
  });
});

document.getElementById("reset").addEventListener("click", () => {
  done.clear();
  boxes.forEach((box) => { box.checked = false; });
  store.remove(DONE_KEY);
  updateProgress();
});

const savedRole = store.get(ROLE_KEY);
document.getElementById("role-picker").hidden = false;
document.getElementById("progress").hidden = false;
document.getElementById("reset-wrap").hidden = false;
setRole(Object.hasOwn(ROLE_NAMES, savedRole || "") ? savedRole : "all");

/* Mark the stage being read in the side list. */
if ("IntersectionObserver" in window) {
  const links = new Map([...document.querySelectorAll(".stage-nav a")]
    .map((link) => [link.getAttribute("href").slice(1), link]));
  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link, id) => {
        const current = id === entry.target.id;
        link.parentElement.classList.toggle("current", current);
        if (current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-30% 0px -65% 0px" });
  document.querySelectorAll(".stage").forEach((stage) => watcher.observe(stage));
}
