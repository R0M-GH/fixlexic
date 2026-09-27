(() => {
  if (window.__fixlexicLoaded) return;
  window.__fixlexicLoaded = true;

  const DEFAULTS = { enabled: true, ratio: 0.45, weight: 700, disabledSites: [] };
  const HOST = location.hostname;

  const SKIP = new Set([
    "script", "style", "noscript", "template", "textarea", "input", "select", "option",
    "code", "pre", "kbd", "samp", "var", "svg", "math", "canvas", "iframe",
    "b", "strong", "fx-w"
  ]);
  const WORD = /\p{L}[\p{L}\p{M}'\u2019]*/gu;
  const HAS_WORD = /\p{L}/u;

  let settings = { ...DEFAULTS };
  let active = false;
  let observer = null;
  let pending = new Set();
  let queue = [];
  let head = 0;
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = "fx-b{font-weight:var(--fx-weight,700)!important}";
  function setWeight() {
    document.documentElement.style.setProperty("--fx-weight", String(settings.weight));
  }

  function leadLength(n) {
    if (n <= 1) return 1;
    return Math.min(n - 1, Math.max(1, Math.ceil(n * settings.ratio)));
  }

  function isSkipEl(el) {
    if (SKIP.has(el.localName) || el.isContentEditable) return true;
    const ce = el.getAttribute && el.getAttribute("contenteditable");
    return ce !== null && ce !== undefined && ce !== "false";
  }

  function ancestorSkipped(el) {
    for (let e = el; e; e = e.parentElement) if (isSkipEl(e)) return true;
    return false;
  }

  function transformText(tn) {
    const text = tn.nodeValue;
    if (!HAS_WORD.test(text)) return;
    const wrap = document.createElement("fx-w");
    let last = 0;
    WORD.lastIndex = 0;
    let m;
    while ((m = WORD.exec(text))) {
      const w = m[0];
      if (m.index > last) wrap.appendChild(document.createTextNode(text.slice(last, m.index)));
      const k = leadLength(w.length);
      const b = document.createElement("fx-b");
      b.textContent = w.slice(0, k);
      wrap.appendChild(b);
      if (k < w.length) wrap.appendChild(document.createTextNode(w.slice(k)));
      last = m.index + w.length;
    }
    if (last < text.length) wrap.appendChild(document.createTextNode(text.slice(last)));
    tn.replaceWith(wrap);
  }

  function collect(root) {
    if (!root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement && !ancestorSkipped(root.parentElement) && HAS_WORD.test(root.nodeValue)) {
        queue.push(root);
      }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || ancestorSkipped(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          return isSkipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return HAS_WORD.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    let n;
    while ((n = walker.nextNode())) queue.push(n);
  }

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    idle(flush, { timeout: 300 });
  }

  function flush() {
    scheduled = false;
    if (!active) return;
    for (const r of pending) collect(r);
    pending.clear();
    const start = performance.now();
    while (head < queue.length && performance.now() - start < 12) {
      const t = queue[head++];
      if (t.isConnected && t.parentElement && !ancestorSkipped(t.parentElement)) transformText(t);
    }
    if (head < queue.length) schedule();
    else { queue = []; head = 0; }
  }

  function activate() {
    active = true;
    if (!style.isConnected) document.documentElement.appendChild(style);
    setWeight();
    pending.add(document.body || document.documentElement);
    schedule();
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE && n.localName === "fx-w") continue;
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) pending.add(n);
        }
      }
      if (pending.size) schedule();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function deactivate() {
    active = false;
    if (observer) observer.disconnect();
    observer = null;
    pending.clear();
    queue = [];
    head = 0;
    const parents = new Set();
    document.querySelectorAll("fx-w").forEach((w) => {
      if (w.parentNode) parents.add(w.parentNode);
      w.replaceWith(document.createTextNode(w.textContent));
    });
    parents.forEach((p) => p.normalize());
  }

  function shouldBeActive() {
    return settings.enabled && !settings.disabledSites.includes(HOST);
  }

  function refresh() {
    const want = shouldBeActive();
    if (want && !active) activate();
    else if (!want && active) deactivate();
    setWeight();
  }

  chrome.storage.sync.get(DEFAULTS, (s) => {
    settings = { ...DEFAULTS, ...s };
    refresh();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const oldRatio = settings.ratio;
    for (const k of Object.keys(changes)) settings[k] = changes[k].newValue;
    if (active && settings.ratio !== oldRatio) deactivate();
    refresh();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "toggle-site") return;
    const sites = new Set(settings.disabledSites);
    if (active) {
      sites.add(HOST);
      chrome.storage.sync.set({ disabledSites: [...sites] });
    } else {
      sites.delete(HOST);
      chrome.storage.sync.set({ enabled: true, disabledSites: [...sites] });
    }
  });
})();
