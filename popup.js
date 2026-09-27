const DEFAULTS = { enabled: true, ratio: 0.45, weight: 700, disabledSites: [] };
const SAMPLE = "Reading feels smoother when your eyes have an anchor at the start of every word.";
const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let host = null;

function lead(n, ratio) {
  if (n <= 1) return 1;
  return Math.min(n - 1, Math.max(1, Math.ceil(n * ratio)));
}

function renderPreview() {
  const p = $("preview");
  p.textContent = "";
  p.style.setProperty("--w", settings.weight);
  let last = 0;
  for (const m of SAMPLE.matchAll(/\p{L}[\p{L}\p{M}'\u2019]*/gu)) {
    if (m.index > last) p.append(SAMPLE.slice(last, m.index));
    const k = lead(m[0].length, settings.ratio);
    const b = document.createElement("fx-b");
    b.textContent = m[0].slice(0, k);
    p.append(b, m[0].slice(k));
    last = m.index + m[0].length;
  }
  p.append(SAMPLE.slice(last));
}

function render() {
  $("enabled").checked = settings.enabled;
  $("site").checked = host ? !settings.disabledSites.includes(host) : false;
  $("site").disabled = !host || !settings.enabled;
  $("ratio").value = settings.ratio;
  $("ratioOut").textContent = Math.round(settings.ratio * 100) + "%";
  $("weight").value = settings.weight;
  $("weightOut").textContent = settings.weight;
  renderPreview();
}

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
  render();
}

$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("site").addEventListener("change", (e) => {
  const sites = new Set(settings.disabledSites);
  e.target.checked ? sites.delete(host) : sites.add(host);
  save({ disabledSites: [...sites] });
});
$("ratio").addEventListener("input", (e) => { settings.ratio = +e.target.value; render(); });
$("ratio").addEventListener("change", (e) => save({ ratio: +e.target.value }));
$("weight").addEventListener("input", (e) => { settings.weight = +e.target.value; render(); });
$("weight").addEventListener("change", (e) => save({ weight: +e.target.value }));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url || "");
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
      host = url.hostname;
      $("host").textContent = host || "local files";
    }
  } catch {}
  if (host === null) {
    $("host").textContent = "this page";
    $("note").textContent = "Chrome doesn't let extensions run on this page.";
  }
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  render();
})();
