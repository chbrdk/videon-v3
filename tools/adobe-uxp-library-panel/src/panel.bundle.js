(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/native.js
  async function loadNativeModule(id) {
    if (typeof __require === "function") {
      try {
        if (id === "uxp") return __require("uxp");
        if (id === "premierepro") return __require("premierepro");
        if (id === "aeft") return __require("aeft");
        if (id === "aftereffects") return __require("aftereffects");
        return __require(id);
      } catch {
      }
    }
    if (id === "uxp") return import("uxp");
    if (id === "premierepro") return import("premierepro");
    if (id === "aeft") return import("aeft");
    if (id === "aftereffects") return import("aftereffects");
    return import(id);
  }

  // src/premiere-path.js
  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }
  function pathBasename(filePath) {
    const normalized = String(filePath || "").replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }
  function pathsLikelyMatch(a, b) {
    const left = String(a || "").replace(/\\/g, "/").toLowerCase();
    const right = String(b || "").replace(/\\/g, "/").toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    return left.endsWith("/" + pathBasename(right)) || right.endsWith("/" + pathBasename(left));
  }
  function assertLocalImportPath(filePath) {
    const path = String(filePath || "").trim();
    if (!path) throw new Error("Lokaler Medienpfad fehlt");
    if (isHttpUrl(path)) {
      throw new Error("Premiere braucht eine lokale Datei \u2014 Cache-Download fehlgeschlagen");
    }
    return path;
  }

  // src/ae-placement.js
  function msToSeconds(ms) {
    return Math.max(0, Number(ms) || 0) / 1e3;
  }
  function sceneSourceWindowSec(hit) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) return null;
    const inPointSec = msToSeconds(hit.startMs);
    const outPointSec = msToSeconds(hit.endMs);
    return {
      inPointSec,
      outPointSec,
      durationSec: Math.max(0, outPointSec - inPointSec)
    };
  }
  function aeLayerTiming(hit, compTimeSec) {
    const window2 = sceneSourceWindowSec(hit);
    const t = Math.max(0, Number(compTimeSec) || 0);
    if (!window2) {
      return {
        startTime: t,
        inPoint: t,
        outPoint: null,
        durationSec: null,
        fullFootage: true
      };
    }
    return {
      startTime: t - window2.inPointSec,
      inPoint: t,
      outPoint: t + window2.durationSec,
      durationSec: window2.durationSec,
      fullFootage: false
    };
  }
  function planAeInserts(hits2, opts = {}) {
    const sequential = opts.sequential !== false;
    const fps = Number(opts.fps) > 0 ? Number(opts.fps) : 25;
    const gapFrames = Math.max(0, Number(opts.gapFrames) || 0);
    const gapSec = gapFrames / fps;
    let cursor = Math.max(0, Number(opts.startAtSec) || 0);
    return hits2.map((hit, index) => {
      const timing = aeLayerTiming(hit, cursor);
      const durationSec = timing.durationSec != null ? timing.durationSec : Math.max(0, msToSeconds((hit.endMs ?? 0) - (hit.startMs ?? 0))) || 1;
      const plan = {
        index,
        hitId: hit.id,
        compTimeSec: cursor,
        ...timing
      };
      if (sequential) cursor += durationSec + gapSec;
      return plan;
    });
  }

  // src/aftereffects.js
  function getExtendScriptApp() {
    try {
      if (typeof app !== "undefined" && app?.project) return app;
    } catch {
    }
    return null;
  }
  async function getAeUxpModule() {
    for (const id of ["aeft", "aftereffects"]) {
      try {
        return await loadNativeModule(id);
      } catch {
      }
    }
    return null;
  }
  function findCompByName(project, name) {
    const want = String(name || "").trim();
    if (!want) return null;
    for (let i = 1; i <= project.numItems; i += 1) {
      const item = project.item(i);
      if (item && item instanceof CompItem && item.name === want) return item;
    }
    return null;
  }
  function findFootageByPath(project, filePath) {
    const base3 = pathBasename(filePath);
    for (let i = 1; i <= project.numItems; i += 1) {
      const item = project.item(i);
      if (!(item instanceof FootageItem)) continue;
      try {
        const main = item.mainSource;
        if (main instanceof FileSource && main.file) {
          const full = String(main.file.fsName || main.file.fullName || "");
          if (full === filePath || full.endsWith(base3)) return item;
        }
      } catch {
      }
      if (item.name === base3) return item;
    }
    return null;
  }
  function importFootage(project, filePath) {
    const existing = findFootageByPath(project, filePath);
    if (existing) return existing;
    const file = new File(filePath);
    if (!file.exists) throw new Error(`Datei nicht gefunden: ${filePath}`);
    return project.importFile(new ImportOptions(file));
  }
  function getOrCreateComp(project, compName, fps) {
    const name = String(compName || "VIDEON").trim() || "VIDEON";
    const existing = findCompByName(project, name);
    if (existing) return existing;
    const rate = Number(fps) > 0 ? Number(fps) : 25;
    return project.items.addComp(name, 1920, 1080, 1, rate, 10);
  }
  function applyLayerTiming(layer, timing) {
    layer.startTime = timing.startTime;
    layer.inPoint = timing.inPoint;
    if (timing.outPoint != null) layer.outPoint = timing.outPoint;
  }
  async function insertHitIntoAfterEffects(input) {
    const localPath = assertLocalImportPath(input.filePath);
    const fps = Number(input.fps) > 0 ? Number(input.fps) : 25;
    const plan = planAeInserts([input.hit], {
      sequential: input.sequential !== false,
      gapFrames: input.gapFrames,
      fps,
      startAtSec: input.startAtSec
    })[0];
    const timing = aeLayerTiming(input.hit, plan.compTimeSec);
    const allowPlan = input.allowPlan === true;
    const esApp = getExtendScriptApp();
    if (esApp?.project) {
      try {
        const project = esApp.project;
        const comp = getOrCreateComp(project, input.compName, fps);
        const footage = importFootage(project, localPath);
        if (!footage) throw new Error("Footage-Import fehlgeschlagen");
        const layer = comp.layers.add(footage);
        applyLayerTiming(layer, timing);
        return {
          ok: true,
          mode: "extendscript",
          message: `AE: \u201E${input.hit.mediaFilename || pathBasename(localPath)}\u201C \u2192 Comp \u201E${comp.name}\u201C`,
          plan
        };
      } catch (error) {
        return {
          ok: false,
          mode: "extendscript",
          message: error instanceof Error ? error.message : String(error),
          plan
        };
      }
    }
    const uxp = await getAeUxpModule();
    if (uxp && !uxp.__videonStub) {
      return {
        ok: false,
        mode: "uxp-pending",
        message: "AE UXP DOM-APIs noch nicht \xF6ffentlich \u2014 Placement geplant; ExtendScript-Host oder sp\xE4tere Adobe-API n\xF6tig",
        plan,
        sourceWindow: sceneSourceWindowSec(input.hit),
        filePath: localPath
      };
    }
    const planMessage = `AE-Plan: ${localPath} \u2192 Comp \u201E${input.compName || "VIDEON"}\u201C @ ${plan.compTimeSec.toFixed(2)}s`;
    if (allowPlan) {
      return { ok: true, mode: "plan", message: planMessage, plan, filePath: localPath };
    }
    return {
      ok: false,
      mode: "unsupported",
      message: "After Effects Insert braucht ExtendScript `app.project` oder k\xFCnftige AE UXP DOM-APIs. Placement wurde berechnet, aber nicht eingef\xFCgt.",
      plan,
      filePath: localPath
    };
  }

  // src/http.js
  function httpRequest(url, init = {}) {
    const method = (init.method || "GET").toUpperCase();
    const headers = init.headers || {};
    const responseType = init.responseType || "";
    const body = init.body == null ? null : init.body;
    if (typeof XMLHttpRequest === "function") {
      return new Promise((resolve, reject) => {
        let settled = false;
        const xhr = new XMLHttpRequest();
        try {
          xhr.open(method, url, true);
          if (responseType) xhr.responseType = responseType;
        } catch (error) {
          reject(error);
          return;
        }
        for (const [key, value] of Object.entries(headers)) {
          if (value != null) xhr.setRequestHeader(key, String(value));
        }
        const finish = (fn, arg) => {
          if (settled) return;
          settled = true;
          fn(arg);
        };
        xhr.onload = () => {
          const status = xhr.status || 0;
          const raw = xhr.response;
          const bodyText = typeof raw === "string" ? raw : raw == null || responseType === "arraybuffer" || responseType === "blob" ? "" : String(raw);
          finish(resolve, {
            ok: status >= 200 && status < 300,
            status,
            statusText: xhr.statusText || "",
            json: async () => {
              if (responseType === "json" && raw && typeof raw === "object") return raw;
              const text = bodyText || (raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : "");
              return text ? JSON.parse(text) : null;
            },
            text: async () => {
              if (typeof raw === "string") return raw;
              if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
              return bodyText;
            },
            blob: async () => {
              if (typeof Blob === "function" && raw instanceof Blob) return raw;
              if (raw instanceof ArrayBuffer) return new Blob([raw]);
              return new Blob([bodyText]);
            },
            arrayBuffer: async () => {
              if (raw instanceof ArrayBuffer) return raw;
              if (typeof Blob === "function" && raw instanceof Blob) return raw.arrayBuffer();
              return new TextEncoder().encode(bodyText).buffer;
            }
          });
        };
        xhr.onerror = () => finish(reject, new Error(`Network error (${method} ${url})`));
        xhr.onabort = () => finish(reject, new Error("Request aborted"));
        if (init.signal) {
          if (init.signal.aborted) {
            xhr.abort();
            return;
          }
          const prev = typeof init.signal.onabort === "function" ? init.signal.onabort : null;
          init.signal.onabort = (event) => {
            try {
              if (prev) prev.call(init.signal, event);
            } catch {
            }
            try {
              xhr.abort();
            } catch {
            }
          };
        }
        try {
          xhr.send(body);
        } catch (error) {
          finish(reject, error);
        }
      });
    }
    return fetch(url, init).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: () => response.json(),
      text: () => response.text(),
      blob: () => response.blob(),
      arrayBuffer: () => response.arrayBuffer()
    }));
  }

  // src/settings.js
  function normalizeProductBaseUrl(value) {
    const trimmed = String(value || "").trim().replace(/\/$/, "");
    if (!trimmed) return { ok: false, error: "Product Base URL fehlt" };
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: "URL muss http(s) sein" };
      }
      return { ok: true, value: `${url.origin}${url.pathname}`.replace(/\/$/, "") };
    } catch {
      return { ok: false, error: "Ung\xFCltige Product Base URL" };
    }
  }
  function looksLikeApiToken(token) {
    const t = String(token || "").trim();
    return /^videon_[a-fA-F0-9]{64}$/.test(t);
  }

  // src/api.js
  var STORAGE_KEY = "videon.adobe.settings";
  var LAST_QUERY_KEY = "videon.adobe.lastQuery";
  var DEFAULTS = {
    productBaseUrl: "https://videon.projects-a.plygrnd.tech",
    apiToken: "",
    defaultPlatformProjectId: "",
    binName: "VIDEON",
    compName: "VIDEON",
    aeSequential: true,
    aeGapFrames: 0
  };
  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    if (partial.productBaseUrl != null) {
      const normalized = normalizeProductBaseUrl(partial.productBaseUrl);
      if (normalized.ok) next.productBaseUrl = normalized.value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  function loadLastQuery() {
    try {
      return localStorage.getItem(LAST_QUERY_KEY) || "";
    } catch {
      return "";
    }
  }
  function saveLastQuery(query) {
    try {
      localStorage.setItem(LAST_QUERY_KEY, String(query || ""));
    } catch {
    }
  }
  function authHeaders(token) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  function base(settings) {
    return String(settings.productBaseUrl || "").replace(/\/$/, "");
  }
  async function parseError(response) {
    try {
      const body = await response.json();
      const msg = body?.error?.message || body?.message || body?.error;
      const code = body?.error?.code;
      if (typeof msg === "string" && code) return `${code}: ${msg}`;
      if (typeof msg === "string") return msg;
      return `${response.status} ${response.statusText}`;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }
  async function testHealth(settings, signal) {
    const response = await httpRequest(`${base(settings)}/api/health`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    return response.ok;
  }
  async function verifyApiToken(settings, signal) {
    const response = await httpRequest(`${base(settings)}/api/tokens/verify`, {
      method: "POST",
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError(response));
    const body = await response.json();
    if (!body?.ok || !body?.ownerId) {
      throw new Error("Token verify lieferte keinen ownerId");
    }
    return { ownerId: String(body.ownerId), tokenId: String(body.tokenId || "") };
  }
  async function listCollections(settings, signal) {
    const response = await httpRequest(`${base(settings)}/api/collections`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  async function searchMedia(settings, query, limit = 40, signal) {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(Math.max(limit, 1), 40))
    });
    if (settings.defaultPlatformProjectId) {
      params.set("platformProjectId", settings.defaultPlatformProjectId);
    }
    const response = await httpRequest(`${base(settings)}/api/media/search?${params}`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  function frameUrl(settings, hit, width = 240) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    const params = new URLSearchParams({
      platformProjectId: hit.platformProjectId,
      t: String(t),
      w: String(width)
    });
    return `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/frame?${params}`;
  }
  function previewUrl(settings, hit, durationMs = 2e3) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    const params = new URLSearchParams({
      platformProjectId: hit.platformProjectId,
      t: String(t),
      durationMs: String(Math.min(Math.max(durationMs, 1), 3e3))
    });
    return `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/preview?${params}`;
  }
  async function fetchFrameBlob(settings, hit, signal) {
    const response = await httpRequest(frameUrl(settings, hit), {
      headers: authHeaders(settings.apiToken),
      signal,
      responseType: "arraybuffer"
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], { type: "image/jpeg" });
  }
  async function fetchPreviewBlob(settings, hit, signal) {
    if (!hit?.platformProjectId || !hit?.mediaAssetId) return null;
    const response = await httpRequest(previewUrl(settings, hit), {
      headers: {
        ...authHeaders(settings.apiToken),
        Accept: "video/mp4,application/octet-stream,*/*"
      },
      signal,
      responseType: "arraybuffer"
    });
    if (!response.ok) {
      console.warn("[VIDEON] preview HTTP", response.status, previewUrl(settings, hit));
      return null;
    }
    const buffer = await response.arrayBuffer();
    if (!buffer?.byteLength) return null;
    const copy = buffer instanceof ArrayBuffer ? buffer.slice(0) : Uint8Array.from(new Uint8Array(buffer)).buffer;
    return new Blob([copy], { type: "video/mp4" });
  }
  async function requestAdobeDownload(settings, hit, signal) {
    if (!hit.platformProjectId) {
      throw new Error("platformProjectId is required for download");
    }
    const params = new URLSearchParams({
      platformProjectId: hit.platformProjectId,
      kind: "source",
      mode: "json"
    });
    const response = await httpRequest(
      `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/adobe-download?${params}`,
      { headers: authHeaders(settings.apiToken), signal }
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  function absoluteProductHref(settings, href) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return href;
    return `${base(settings)}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  // src/cache-index.js
  var DEFAULT_MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024;
  var DEFAULT_MAX_CACHE_ENTRIES = 80;
  function emptyCacheIndex() {
    return (
      /** @type {CacheIndex} */
      {}
    );
  }
  function parseCacheIndex(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyCacheIndex();
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!key || !value || typeof value !== "object") continue;
      out[key] = {
        path: typeof value.path === "string" ? value.path : void 0,
        fileName: typeof value.fileName === "string" ? value.fileName : void 0,
        at: Number.isFinite(Number(value.at)) ? Number(value.at) : 0,
        bytes: Number.isFinite(Number(value.bytes)) ? Number(value.bytes) : 0
      };
    }
    return out;
  }
  function cacheStats(index) {
    const entries = Object.entries(index || {});
    let bytes = 0;
    for (const [, entry] of entries) bytes += Number(entry.bytes) || 0;
    return { count: entries.length, bytes };
  }
  function formatCacheBytes(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  function pickEvictionKeys(index, options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_CACHE_BYTES;
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    const incomingBytes = Math.max(0, Number(options.incomingBytes) || 0);
    const keepKey = options.keepKey || null;
    const entries = Object.entries(index || {}).filter(([key]) => key !== keepKey);
    entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    let bytes = entries.reduce((sum, [, e]) => sum + (Number(e.bytes) || 0), 0) + incomingBytes;
    let count = entries.length + (keepKey && index?.[keepKey] ? 0 : 1);
    const evict = [];
    for (const [key, entry] of entries) {
      if (count <= maxEntries && bytes <= maxBytes) break;
      evict.push(key);
      bytes -= Number(entry.bytes) || 0;
      count -= 1;
    }
    return evict;
  }
  function removeKeysFromIndex(index, keys) {
    const next = { ...index };
    for (const key of keys) delete next[key];
    return next;
  }

  // src/cache.js
  var META_KEY = "videon.adobe.cacheIndex";
  var POSTER_META_KEY = "videon.adobe.posterIndex";
  function readIndex() {
    try {
      return parseCacheIndex(JSON.parse(localStorage.getItem(META_KEY) || "{}"));
    } catch {
      return parseCacheIndex({});
    }
  }
  function writeIndex(index) {
    localStorage.setItem(META_KEY, JSON.stringify(index));
  }
  function readPosterIndex() {
    try {
      return parseCacheIndex(JSON.parse(localStorage.getItem(POSTER_META_KEY) || "{}"));
    } catch {
      return parseCacheIndex({});
    }
  }
  function writePosterIndex(index) {
    localStorage.setItem(POSTER_META_KEY, JSON.stringify(index));
  }
  function sanitizeFilename(name) {
    const base3 = String(name || "clip.mp4").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    return base3.includes(".") ? base3 : `${base3}.mp4`;
  }
  function cacheFileName(cacheKey, filename) {
    return `${String(cacheKey).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}_${sanitizeFilename(filename)}`;
  }
  async function getUxpFs() {
    const uxp = await loadNativeModule("uxp");
    const fs = uxp.storage?.localFileSystem;
    if (!fs?.getDataFolder) {
      throw new Error("UXP localFileSystem nicht verf\xFCgbar \u2014 Cache unm\xF6glich");
    }
    return { uxp, fs };
  }
  async function getDataFolder() {
    const { fs } = await getUxpFs();
    return fs.getDataFolder();
  }
  async function findEntryByName(folder, fileName) {
    if (!fileName || typeof folder.getEntries !== "function") return null;
    try {
      const entries = await folder.getEntries();
      return entries.find((entry) => entry?.name === fileName && !entry.isFolder) || null;
    } catch {
      return null;
    }
  }
  async function deleteEntrySafe(entry) {
    if (!entry) return;
    try {
      if (typeof entry.delete === "function") await entry.delete();
    } catch {
    }
  }
  async function resolveCachedPath(cacheKey) {
    const index = readIndex();
    const entry = index[cacheKey];
    if (!entry) return null;
    if (entry.path && isHttpUrl(entry.path)) {
      writeIndex(removeKeysFromIndex(index, [cacheKey]));
      return null;
    }
    try {
      const folder = await getDataFolder();
      const fileName = entry.fileName || (entry.path ? entry.path.split(/[/\\]/).pop() : null);
      if (!fileName) {
        writeIndex(removeKeysFromIndex(index, [cacheKey]));
        return null;
      }
      const file = await findEntryByName(folder, fileName);
      if (!file?.nativePath || isHttpUrl(file.nativePath)) {
        writeIndex(removeKeysFromIndex(index, [cacheKey]));
        return null;
      }
      index[cacheKey] = {
        ...entry,
        fileName,
        path: file.nativePath,
        at: Date.now(),
        bytes: entry.bytes || 0
      };
      writeIndex(index);
      return file.nativePath;
    } catch {
      return null;
    }
  }
  function getCacheStats() {
    return cacheStats(readIndex());
  }
  async function evictIfNeeded(index, keepKey, incomingBytes) {
    const keys = pickEvictionKeys(index, {
      keepKey,
      incomingBytes,
      maxBytes: DEFAULT_MAX_CACHE_BYTES,
      maxEntries: DEFAULT_MAX_CACHE_ENTRIES
    });
    if (!keys.length) return index;
    try {
      const folder = await getDataFolder();
      for (const key of keys) {
        const entry = index[key];
        const name = entry?.fileName;
        if (name) {
          const file = await findEntryByName(folder, name);
          await deleteEntrySafe(file);
        }
      }
    } catch {
    }
    return removeKeysFromIndex(index, keys);
  }
  async function materializeDownload(input) {
    const { cacheKey, downloadUrl, filename } = input;
    if (!downloadUrl) throw new Error("downloadUrl fehlt");
    if (!cacheKey) throw new Error("cacheKey fehlt");
    const existing = await resolveCachedPath(cacheKey);
    if (existing) return existing;
    const { uxp } = await getUxpFs();
    const folder = await getDataFolder();
    const fileName = cacheFileName(cacheKey, filename);
    const file = await folder.createFile(fileName, { overwrite: true });
    const response = await httpRequest(downloadUrl, { responseType: "arraybuffer" });
    if (!response.ok) {
      throw new Error(`Download fehlgeschlagen: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error("Download leer");
    await file.write(buffer, { format: uxp.storage.formats.binary });
    const nativePath = file.nativePath;
    if (!nativePath || isHttpUrl(nativePath)) {
      throw new Error("Kein nativer Dateipfad nach Cache-Write \u2014 Premiere-Import blockiert");
    }
    let index = await evictIfNeeded(readIndex(), cacheKey, buffer.byteLength);
    index[cacheKey] = {
      path: nativePath,
      fileName,
      at: Date.now(),
      bytes: buffer.byteLength
    };
    writeIndex(index);
    return nativePath;
  }
  function posterCacheKey(hit, width = 240) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    return `${hit.mediaAssetId}:poster:w${width}:t${t}`;
  }
  function previewCacheKey(hit, durationMs = 2e3) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    return `${hit.mediaAssetId}:preview:t${t}:d${durationMs}`;
  }
  function nativePathToFileUrl(nativePath) {
    if (!nativePath || typeof nativePath !== "string") return null;
    const trimmed = nativePath.trim();
    if (!trimmed) return null;
    if (/^file:/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/")) {
      return `file://${encodeURI(trimmed).replace(/#/g, "%23")}`;
    }
    return `file:///${encodeURI(trimmed.replace(/\\/g, "/")).replace(/#/g, "%23")}`;
  }
  async function resolveEntryPlaybackUrls(file) {
    if (!file) return [];
    const out = [];
    const push = (value) => {
      const s = value != null ? String(value).trim() : "";
      if (s && !out.includes(s)) out.push(s);
    };
    try {
      if (file.url) push(file.url);
    } catch {
    }
    try {
      const { fs } = await getUxpFs();
      if (typeof fs.getFsUrl === "function") push(fs.getFsUrl(file));
    } catch {
    }
    try {
      if (file.name) push(`plugin-data:/${file.name}`);
    } catch {
    }
    try {
      const native = file.nativePath;
      if (native) {
        push(nativePathToFileUrl(native));
        push(native);
      }
    } catch {
    }
    return out;
  }
  async function readCachedPreviewBlob(cacheKey) {
    const index = readPosterIndex();
    const entry = index[cacheKey];
    if (!entry?.fileName) return null;
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const file = await findEntryByName(folder, entry.fileName);
      if (!file || typeof file.read !== "function") return null;
      const data = await file.read({ format: uxp.storage.formats.binary });
      if (!data || data.byteLength != null && data.byteLength === 0) return null;
      index[cacheKey] = { ...entry, at: Date.now() };
      writePosterIndex(index);
      return new Blob([data], { type: "video/mp4" });
    } catch {
      return null;
    }
  }
  async function materializePreview(input) {
    const { cacheKey, blob, filename } = input;
    if (!cacheKey || !blob) return null;
    const index = readPosterIndex();
    const existing = index[cacheKey];
    if (existing?.fileName) {
      try {
        const folder = await getDataFolder();
        const file = await findEntryByName(folder, existing.fileName);
        const urls = await resolveEntryPlaybackUrls(file);
        if (urls.length) {
          index[cacheKey] = { ...existing, at: Date.now() };
          writePosterIndex(index);
          return { url: urls[0], urls, via: "file" };
        }
      } catch {
      }
    }
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const fileName = cacheFileName(cacheKey, filename || "preview.mp4");
      const file = await folder.createFile(fileName, { overwrite: true });
      const buffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
      if (!buffer?.byteLength) return null;
      await file.write(buffer, { format: uxp.storage.formats.binary });
      index[cacheKey] = {
        path: file.nativePath || void 0,
        fileName,
        at: Date.now(),
        bytes: buffer.byteLength
      };
      writePosterIndex(index);
      const urls = await resolveEntryPlaybackUrls(file);
      if (urls.length) {
        console.info("[VIDEON] materializePreview ok", fileName, urls[0], `(${urls.length} candidates)`);
        return { url: urls[0], urls, via: "file" };
      }
      console.warn("[VIDEON] materializePreview wrote file but no playback URL", fileName, file?.nativePath);
    } catch (error) {
      console.warn("[VIDEON] materializePreview file write failed", error);
    }
    try {
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: "video/mp4" }));
      return { url, urls: [url], via: "blob" };
    } catch {
      return null;
    }
  }
  async function readCachedPosterBlob(cacheKey) {
    const index = readPosterIndex();
    const entry = index[cacheKey];
    if (!entry?.fileName) return null;
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const file = await findEntryByName(folder, entry.fileName);
      if (!file || typeof file.read !== "function") return null;
      const data = await file.read({ format: uxp.storage.formats.binary });
      if (!data || data.byteLength != null && data.byteLength === 0) return null;
      index[cacheKey] = { ...entry, at: Date.now() };
      writePosterIndex(index);
      return new Blob([data], { type: "image/jpeg" });
    } catch {
      return null;
    }
  }
  async function materializePoster(input) {
    const { cacheKey, blob, filename } = input;
    if (!cacheKey || !blob) return null;
    const index = readPosterIndex();
    const existing = index[cacheKey];
    if (existing?.fileName) {
      try {
        const folder = await getDataFolder();
        const file = await findEntryByName(folder, existing.fileName);
        if (file?.nativePath && !isHttpUrl(file.nativePath)) {
          index[cacheKey] = { ...existing, at: Date.now() };
          writePosterIndex(index);
          return file.nativePath;
        }
      } catch {
      }
    }
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const fileName = cacheFileName(cacheKey, filename || "poster.jpg");
      const file = await folder.createFile(fileName, { overwrite: true });
      const buffer = await blob.arrayBuffer();
      await file.write(buffer, { format: uxp.storage.formats.binary });
      if (!file.nativePath || isHttpUrl(file.nativePath)) return null;
      index[cacheKey] = {
        path: file.nativePath,
        fileName,
        at: Date.now(),
        bytes: buffer.byteLength
      };
      writePosterIndex(index);
      return file.nativePath;
    } catch {
      return null;
    }
  }
  async function clearCache() {
    const media = readIndex();
    const posters = readPosterIndex();
    let deleted = 0;
    try {
      const folder = await getDataFolder();
      for (const entry of [...Object.values(media), ...Object.values(posters)]) {
        if (!entry?.fileName) continue;
        const file = await findEntryByName(folder, entry.fileName);
        if (file) {
          await deleteEntrySafe(file);
          deleted += 1;
        }
      }
    } catch {
    }
    writeIndex({});
    writePosterIndex({});
    return { deleted, ...cacheStats({}) };
  }
  async function refreshCacheStats() {
    const index = readIndex();
    const folder = await getDataFolder().catch(() => null);
    if (!folder) return cacheStats(index);
    let next = { ...index };
    for (const [key, entry] of Object.entries(index)) {
      const name = entry.fileName;
      if (!name) {
        next = removeKeysFromIndex(next, [key]);
        continue;
      }
      const file = await findEntryByName(folder, name);
      if (!file) next = removeKeysFromIndex(next, [key]);
    }
    writeIndex(next);
    return cacheStats(next);
  }

  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = (function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  });
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
      if (a[i] > m)
        m = a[i];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    // determined by compression function
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i = 0; i < hcLen; ++i) {
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i = 0; i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i = sym - 257, b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var et = /* @__PURE__ */ new u8(0);
  var b2 = function(d, b) {
    return d[b] | d[b + 1] << 8;
  };
  var b4 = function(d, b) {
    return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
  };
  var b8 = function(d, b) {
    return b4(d, b) + b4(d, b + 4) * 4294967296;
  };
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }
  var dutf8 = function(d) {
    for (var r = "", i = 0; ; ) {
      var c = d[i++];
      var eb = (c > 127) + (c > 223) + (c > 239);
      if (i + eb > d.length)
        return { s: r, r: slc(d, i - 1) };
      if (!eb)
        r += String.fromCharCode(c);
      else if (eb == 3) {
        c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
      } else if (eb & 1)
        r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
      else
        r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
    }
  };
  function strFromU8(dat, latin1) {
    if (latin1) {
      var r = "";
      for (var i = 0; i < dat.length; i += 16384)
        r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
      return r;
    } else if (td) {
      return td.decode(dat);
    } else {
      var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
      if (r.length)
        err(8);
      return s;
    }
  }
  var slzh = function(d, b) {
    return b + 30 + b2(d, b + 26) + b2(d, b + 28);
  };
  var zh = function(d, b, z) {
    var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
    var _a2 = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a2[0], su = _a2[1], off = _a2[2];
    return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
  };
  var z64hs = function(d, b, l, z, sc, su, off) {
    var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
    var nf = nsc + nsu + noff;
    if (z && nf) {
      for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
        if (b2(d, b) == 1) {
          return [
            nsc ? b8(d, b + 4 + 8 * nsu) : sc,
            nsu ? b8(d, b + 4) : su,
            noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
            1
          ];
        }
      }
      if (z < 2)
        err(13);
    }
    return [sc, su, off, 0];
  };
  function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 101010256; --e) {
      if (!e || data.length - e > 65558)
        err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
      return {};
    var o = b4(data, e + 16);
    var z = b4(data, e - 20) == 117853008;
    if (z) {
      var ze = b4(data, e - 12);
      z = b4(data, ze) == 101075792;
      if (z) {
        c = b4(data, ze + 32);
        o = b4(data, ze + 48);
      }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
      var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
      o = no;
      if (!fltr || fltr({
        name: fn,
        size: sc,
        originalSize: su,
        compression: c_2
      })) {
        if (!c_2)
          files[fn] = slc(data, b, b + sc);
        else if (c_2 == 8)
          files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
        else
          err(14, "unknown compression type " + c_2);
      }
    }
    return files;
  }

  // src/open-cut-model.js
  var OPEN_CUT_PHASE = {
    export: "export",
    download: "download",
    extract: "extract",
    handoff: "handoff",
    import: "import",
    done: "done",
    error: "error"
  };
  var OPEN_CUT_PHASE_LABEL = {
    export: "Export\u2026",
    download: "Download\u2026",
    extract: "Entpacken\u2026",
    handoff: "Bereit zum Import\u2026",
    import: "Import\u2026",
    done: "Fertig",
    error: "Fehler"
  };
  var OPEN_CUT_LIST_LIMIT = 40;
  var OPEN_CUT_MAX_TREES = 8;
  var OPEN_CUT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
  var OPEN_CUT_POLL_TIMEOUT_MS = 10 * 60 * 1e3;
  var OPEN_CUT_HANDOFF_BANNER = "ZIP entpackt. In Premiere: Datei \u2192 Importieren \u2192 XML w\xE4hlen.";
  var PRESET_BY_WH = {
    "1920x1080": "16:9",
    "1080x1920": "9:16",
    "1080x1080": "1:1"
  };
  function canvasLabel(cut) {
    const w = cut?.width;
    const h = cut?.height;
    if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h)) return "\u2014";
    const key = `${Math.round(w)}x${Math.round(h)}`;
    return PRESET_BY_WH[key] || `${Math.round(w)}\xD7${Math.round(h)}`;
  }
  function formatUpdatedAt(iso, now = Date.now()) {
    if (!iso) return "\u2014";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "\u2014";
    const delta = Math.max(0, now - t);
    const min = Math.floor(delta / 6e4);
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min.`;
    const hrs = Math.floor(min / 60);
    if (hrs < 48) return `vor ${hrs} Std.`;
    const days = Math.floor(hrs / 24);
    return `vor ${days} T.`;
  }
  function shouldReusePremiereExport(cut, exportJob) {
    if (!cut || !exportJob) return false;
    if (exportJob.format !== "premiere_xml") return false;
    if (exportJob.status !== "succeeded") return false;
    if (!exportJob.storageKey && exportJob.bytes == null) {
    }
    const cutAt = Date.parse(cut.updatedAt || "");
    const expAt = Date.parse(exportJob.createdAt || "");
    if (!Number.isFinite(cutAt) || !Number.isFinite(expAt)) return false;
    return expAt >= cutAt;
  }
  function pickReusablePremiereExport(cut, exportsList) {
    const list = Array.isArray(exportsList) ? exportsList : [];
    for (const job of list) {
      if (shouldReusePremiereExport(cut, job)) return job;
    }
    return null;
  }
  function openCutIdempotencyKey(cut) {
    const updated = cut?.updatedAt || "unknown";
    return `open-cut:${cut?.id || "x"}:${updated}`;
  }
  function openCutCacheKey(cutId, exportId, bytesOrChecksum) {
    const stamp = bytesOrChecksum != null ? String(bytesOrChecksum) : "na";
    return `${cutId}:premiere_xml:${exportId}:${stamp}`;
  }
  function sanitizeOpenCutFolder(cacheKey) {
    return String(cacheKey || "cut").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  }
  function normalizeCutsList(payload) {
    const raw = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    const items = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) continue;
      items.push({
        id,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : id,
        width: typeof row.width === "number" ? row.width : null,
        height: typeof row.height === "number" ? row.height : null,
        frameRate: typeof row.frameRate === "number" ? row.frameRate : null,
        status: typeof row.status === "string" ? row.status : "active",
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
        sceneCount: typeof row.sceneCount === "number" ? row.sceneCount : null
      });
    }
    items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return items.slice(0, OPEN_CUT_LIST_LIMIT);
  }
  function phaseLabel(phaseId, extra = "") {
    const base3 = OPEN_CUT_PHASE_LABEL[phaseId] || phaseId;
    if (phaseId === "done" && extra) return `${base3} \xB7 ${extra}`;
    if (phaseId === "error" && extra) return `${base3} \xB7 ${extra}`;
    return base3;
  }
  function nextPollDelayMs(attempt) {
    const n = Math.max(0, Number(attempt) || 0);
    return Math.min(5e3, Math.round(1e3 * Math.pow(1.5, n)));
  }
  function pickXmlPathFromEntries(paths) {
    const list = (paths || []).map(String);
    const root = list.filter((p) => /\.xml$/i.test(p) && !p.includes("/"));
    if (root.length) return root[0];
    const any = list.find((p) => /\.xml$/i.test(p));
    return any || null;
  }

  // src/open-cut-cache.js
  var INDEX_KEY = "videon.adobe.openCutIndex";
  var ROOT_FOLDER = "open-cut";
  function readIndex2() {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function writeIndex2(index) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }
  async function getUxpFs2() {
    const uxp = await loadNativeModule("uxp");
    const fs = uxp.storage?.localFileSystem;
    if (!fs?.getDataFolder) throw new Error("UXP localFileSystem nicht verf\xFCgbar");
    return { uxp, fs };
  }
  async function getDataFolder2() {
    const { fs } = await getUxpFs2();
    return fs.getDataFolder();
  }
  async function ensureChildFolder(parent, name) {
    if (typeof parent.getEntries === "function") {
      try {
        const entries = await parent.getEntries();
        const existing = entries.find((e) => e?.name === name && e.isFolder);
        if (existing) return existing;
      } catch {
      }
    }
    if (typeof parent.createFolder === "function") {
      try {
        return await parent.createFolder(name);
      } catch (error) {
        if (typeof parent.getEntries === "function") {
          const entries = await parent.getEntries();
          const existing = entries.find((e) => e?.name === name && e.isFolder);
          if (existing) return existing;
        }
        throw error;
      }
    }
    throw new Error(`createFolder fehlt f\xFCr ${name}`);
  }
  async function getChildEntry(parent, name) {
    if (typeof parent.getEntries !== "function") return null;
    try {
      const entries = await parent.getEntries();
      return entries.find((e) => e?.name === name) || null;
    } catch {
      return null;
    }
  }
  async function deleteEntrySafe2(entry) {
    if (!entry) return;
    try {
      if (typeof entry.delete === "function") await entry.delete();
    } catch {
    }
  }
  function toArrayBuffer(u82) {
    if (u82 instanceof ArrayBuffer) return u82;
    if (u82?.buffer instanceof ArrayBuffer) {
      return u82.buffer.slice(u82.byteOffset, u82.byteOffset + u82.byteLength);
    }
    return new Uint8Array(u82).buffer;
  }
  async function writeRelativeFile(rootFolder, relativePath, bytes, uxp) {
    const parts = String(relativePath).replace(/^\/+/, "").split("/").filter(Boolean);
    if (!parts.length) return null;
    let folder = rootFolder;
    for (let i = 0; i < parts.length - 1; i += 1) {
      folder = await ensureChildFolder(folder, parts[i]);
    }
    const fileName = parts[parts.length - 1];
    const file = await folder.createFile(fileName, { overwrite: true });
    await file.write(toArrayBuffer(bytes), { format: uxp.storage.formats.binary });
    return file;
  }
  async function evictIfNeeded2(incomingBytes) {
    let index = readIndex2();
    const entries = Object.entries(index).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    let totalBytes = entries.reduce((sum, [, e]) => sum + (Number(e.bytes) || 0), 0);
    let count = entries.length;
    const needEvict = () => count >= OPEN_CUT_MAX_TREES || totalBytes + (incomingBytes || 0) > OPEN_CUT_MAX_BYTES;
    if (!needEvict()) return;
    const data = await getDataFolder2();
    let openRoot;
    try {
      openRoot = await ensureChildFolder(data, ROOT_FOLDER);
    } catch {
      return;
    }
    for (const [key, entry] of entries) {
      if (!needEvict()) break;
      try {
        if (entry?.folderName) {
          const folder = await getChildEntry(openRoot, entry.folderName);
          await deleteEntrySafe2(folder);
        }
      } catch {
      }
      delete index[key];
      totalBytes -= Number(entry?.bytes) || 0;
      count -= 1;
    }
    writeIndex2(index);
  }
  async function extractOpenCutZip(cacheKey, zipBuffer) {
    if (!cacheKey || !zipBuffer) throw new Error("extractOpenCutZip: cacheKey/zip fehlen");
    const folderName = sanitizeOpenCutFolder(cacheKey);
    const u82 = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
    const unzipped = unzipSync(u82);
    const paths = Object.keys(unzipped);
    const xmlRel = pickXmlPathFromEntries(paths);
    if (!xmlRel) throw new Error("ZIP enth\xE4lt keine .xml");
    await evictIfNeeded2(u82.byteLength);
    const { uxp } = await getUxpFs2();
    const data = await getDataFolder2();
    const openRoot = await ensureChildFolder(data, ROOT_FOLDER);
    try {
      const prev = await getChildEntry(openRoot, folderName);
      await deleteEntrySafe2(prev);
    } catch {
    }
    const extractRoot = await ensureChildFolder(openRoot, folderName);
    let written = 0;
    for (const [rel, bytes] of Object.entries(unzipped)) {
      if (!bytes) continue;
      if (rel.endsWith("/")) continue;
      await writeRelativeFile(extractRoot, rel, bytes, uxp);
      written += bytes.byteLength || 0;
    }
    let xmlEntry = null;
    const xmlParts = xmlRel.replace(/^\/+/, "").split("/");
    let cursor = extractRoot;
    for (let i = 0; i < xmlParts.length - 1; i += 1) {
      cursor = await ensureChildFolder(cursor, xmlParts[i]);
    }
    xmlEntry = await getChildEntry(cursor, xmlParts[xmlParts.length - 1]);
    const xmlNativePath = xmlEntry?.nativePath || null;
    const extractDir = extractRoot.nativePath || folderName;
    if (!xmlNativePath) throw new Error("XML nativePath nicht aufl\xF6sbar");
    const index = readIndex2();
    index[cacheKey] = {
      folderName,
      xmlRel,
      xmlPath: xmlNativePath,
      extractDir,
      at: Date.now(),
      bytes: written || u82.byteLength
    };
    writeIndex2(index);
    return {
      extractDir,
      xmlPath: xmlNativePath,
      xmlNativePath,
      bytes: written || u82.byteLength,
      folderName,
      xmlRel
    };
  }
  async function clearOpenCutCache() {
    const index = readIndex2();
    let deleted = 0;
    try {
      const data = await getDataFolder2();
      const openRoot = await ensureChildFolder(data, ROOT_FOLDER);
      for (const entry of Object.values(index)) {
        if (!entry?.folderName) continue;
        try {
          const folder = entry?.folderName ? await getChildEntry(openRoot, entry.folderName) : null;
          if (folder) {
            await deleteEntrySafe2(folder);
            deleted += 1;
          }
        } catch {
        }
      }
      if (typeof openRoot.getEntries === "function") {
        const kids = await openRoot.getEntries();
        for (const kid of kids || []) {
          await deleteEntrySafe2(kid);
          deleted += 1;
        }
      }
    } catch {
    }
    writeIndex2({});
    return { deleted };
  }

  // src/cuts-api.js
  function authHeaders2(token) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  function base2(settings) {
    return String(settings.productBaseUrl || "").replace(/\/$/, "");
  }
  async function parseError2(response) {
    try {
      const body = await response.json();
      const msg = body?.error?.message || body?.message || body?.error;
      const code = body?.error?.code;
      if (typeof msg === "string" && code) return `${code}: ${msg}`;
      if (typeof msg === "string") return msg;
      return `${response.status} ${response.statusText}`;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }
  async function listCuts(settings, platformProjectId, signal) {
    if (!platformProjectId) throw new Error("platformProjectId is required");
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(`${base2(settings)}/api/cuts?${params}`, {
      headers: authHeaders2(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError2(response));
    return normalizeCutsList(await response.json());
  }
  async function listCutExports(settings, cutId, platformProjectId, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(
      `${base2(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports?${params}`,
      { headers: authHeaders2(settings.apiToken), signal }
    );
    if (!response.ok) throw new Error(await parseError2(response));
    const body = await response.json();
    return Array.isArray(body?.exports) ? body.exports : [];
  }
  async function enqueuePremiereExport(settings, cutId, platformProjectId, idempotencyKey, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(
      `${base2(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports?${params}`,
      {
        method: "POST",
        headers: {
          ...authHeaders2(settings.apiToken),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          format: "premiere_xml",
          idempotencyKey: idempotencyKey || void 0
        }),
        signal
      }
    );
    if (!response.ok) throw new Error(await parseError2(response));
    const body = await response.json();
    if (!body?.export?.id) throw new Error("Export enqueue ohne export.id");
    return body.export;
  }
  async function getCutExport(settings, cutId, exportId, platformProjectId, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(
      `${base2(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports/${encodeURIComponent(exportId)}?${params}`,
      { headers: authHeaders2(settings.apiToken), signal }
    );
    if (!response.ok) throw new Error(await parseError2(response));
    return response.json();
  }
  async function downloadExportZip(downloadUrl, signal) {
    if (!downloadUrl) throw new Error("downloadUrl fehlt");
    const response = await httpRequest(downloadUrl, {
      signal,
      responseType: "arraybuffer"
    });
    if (!response.ok) throw new Error(`ZIP download ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (!buffer?.byteLength) throw new Error("ZIP leer");
    return buffer;
  }
  async function getCutDetail(settings, cutId, platformProjectId, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(
      `${base2(settings)}/api/cuts/${encodeURIComponent(cutId)}?${params}`,
      { headers: authHeaders2(settings.apiToken), signal }
    );
    if (!response.ok) throw new Error(await parseError2(response));
    return response.json();
  }
  async function listWorkspaceMedia(settings, platformProjectId, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(`${base2(settings)}/api/media?${params}`, {
      headers: authHeaders2(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError2(response));
    const body = await response.json();
    return Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
  }
  async function restoreCutFromPushback(settings, cutId, platformProjectId, scenes, signal) {
    const params = new URLSearchParams({ platformProjectId });
    const response = await httpRequest(
      `${base2(settings)}/api/cuts/${encodeURIComponent(cutId)}?${params}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders2(settings.apiToken),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "restore", scenes }),
        signal
      }
    );
    if (!response.ok) throw new Error(await parseError2(response));
    return response.json();
  }

  // src/host.js
  async function detectHostApp() {
    try {
      const uxp = await loadNativeModule("uxp");
      const name = String(uxp?.host?.name || uxp?.host?.app || "").toLowerCase();
      if (name.includes("after") || name === "aeft" || name === "ae") {
        return { id: "AEFT", source: uxp?.host?.__videonPreview ? "preview" : "uxp" };
      }
      if (name.includes("premiere") || name === "ppro" || name === "premierepro") {
        return { id: "PPRO", source: "uxp" };
      }
      if (name === "aeft") return { id: "AEFT", source: "preview" };
    } catch {
    }
    try {
      if (typeof location !== "undefined") {
        const q = new URLSearchParams(location.search).get("host");
        if (q && /aeft|aftereffects|^ae$/i.test(q)) {
          return { id: "AEFT", source: "preview" };
        }
      }
    } catch {
    }
    return { id: "PPRO", source: "default" };
  }
  function isAfterEffectsHost(host) {
    return host === "AEFT" || host?.id === "AEFT";
  }

  // src/time.js
  function msToFrames(ms, fps) {
    const rate = Number(fps);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.round(Math.max(0, Number(ms) || 0) / 1e3 * rate);
  }
  function sceneInOutFrames(hit, fps) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
      return null;
    }
    return {
      inPoint: msToFrames(hit.startMs, fps),
      outPoint: msToFrames(hit.endMs, fps)
    };
  }

  // src/premiere.js
  async function getPremiereApi() {
    try {
      return await loadNativeModule("premierepro");
    } catch {
      return null;
    }
  }
  function runLockedTransaction(project, name, build) {
    let ok = false;
    project.lockedAccess(() => {
      ok = project.executeTransaction((compoundAction) => {
        build(compoundAction);
      }, name);
    });
    return ok;
  }
  async function listFolderItems(folder) {
    if (!folder || typeof folder.getItems !== "function") return [];
    return await folder.getItems() || [];
  }
  async function findBinByName(ppro, root, binName) {
    const want = String(binName || "VIDEON").trim() || "VIDEON";
    const queue = [root];
    while (queue.length) {
      const folder = queue.shift();
      const items = await listFolderItems(folder);
      for (const item of items) {
        if (item?.name === want) {
          const asFolder = ppro.FolderItem?.cast?.(item) || item;
          if (asFolder && typeof asFolder.getItems === "function") return asFolder;
        }
        const nested = ppro.FolderItem?.cast?.(item);
        if (nested) queue.push(nested);
      }
    }
    return null;
  }
  async function ensureBin(ppro, project, binName) {
    const root = await project.getRootItem();
    if (!root) throw new Error("Projekt-Root nicht verf\xFCgbar");
    const existing = await findBinByName(ppro, root, binName);
    if (existing) return existing;
    const name = String(binName || "VIDEON").trim() || "VIDEON";
    if (typeof root.createBinAction !== "function") {
      return root;
    }
    runLockedTransaction(project, `VIDEON: Bin \u201E${name}\u201C`, (compoundAction) => {
      compoundAction.addAction(root.createBinAction(name, false));
    });
    const created = await findBinByName(ppro, root, name);
    return created || root;
  }
  async function walkProjectItems(ppro, root) {
    const out = [];
    const queue = [root];
    while (queue.length) {
      const folder = queue.shift();
      const items = await listFolderItems(folder);
      for (const item of items) {
        out.push(item);
        const nested = ppro.FolderItem?.cast?.(item);
        if (nested) queue.push(nested);
      }
    }
    return out;
  }
  async function findClipMatchingPath(ppro, project, filePath) {
    const root = await project.getRootItem();
    const items = await walkProjectItems(ppro, root);
    const base3 = pathBasename(filePath);
    for (const item of items) {
      const clip = ppro.ClipProjectItem?.cast?.(item);
      if (!clip) continue;
      let mediaPath = null;
      try {
        mediaPath = typeof clip.getMediaFilePath === "function" ? await clip.getMediaFilePath() : null;
      } catch {
        mediaPath = null;
      }
      if (mediaPath && pathsLikelyMatch(mediaPath, filePath)) return clip;
      if (!mediaPath && item.name && item.name === base3) return clip;
    }
    for (const item of items) {
      const clip = ppro.ClipProjectItem?.cast?.(item);
      if (!clip || typeof clip.findItemsMatchingMediaPath !== "function") continue;
      try {
        const matches = await clip.findItemsMatchingMediaPath(filePath, true);
        if (Array.isArray(matches) && matches.length) {
          return ppro.ClipProjectItem.cast(matches[0]) || matches[0];
        }
        const byName = await clip.findItemsMatchingMediaPath(base3, true);
        if (Array.isArray(byName) && byName.length) {
          return ppro.ClipProjectItem.cast(byName[0]) || byName[0];
        }
      } catch {
      }
    }
    return null;
  }
  function secondsFromMs(ms) {
    return Math.max(0, Number(ms) || 0) / 1e3;
  }
  async function applySceneInOut(ppro, project, clip, hit) {
    if (!clip || typeof clip.createSetInOutPointsAction !== "function") {
      return { applied: false, reason: "createSetInOutPointsAction unavailable" };
    }
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
      return { applied: false, reason: "no scene bounds" };
    }
    const inPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.startMs));
    const outPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.endMs));
    const ok = runLockedTransaction(project, "VIDEON: Scene In/Out", (compoundAction) => {
      compoundAction.addAction(clip.createSetInOutPointsAction(inPoint, outPoint));
    });
    return { applied: Boolean(ok), reason: ok ? null : "transaction failed" };
  }
  async function resolveInsertTime(ppro, sequence) {
    try {
      if (typeof sequence.getPlayerPosition === "function") {
        const pos = await sequence.getPlayerPosition();
        if (pos) return pos;
      }
    } catch {
    }
    return ppro.TickTime?.TIME_ZERO || ppro.TickTime.createWithSeconds(0);
  }
  async function appendClipToActiveSequence(ppro, project, clipProjectItem) {
    const sequence = await project.getActiveSequence();
    if (!sequence) {
      return { ok: false, message: "Keine aktive Sequence" };
    }
    if (!ppro.SequenceEditor?.getEditor) {
      return { ok: false, message: "SequenceEditor API fehlt" };
    }
    const editor = ppro.SequenceEditor.getEditor(sequence);
    const at = await resolveInsertTime(ppro, sequence);
    const ok = runLockedTransaction(project, "VIDEON: Sequence Insert", (compoundAction) => {
      const action = editor.createInsertProjectItemAction(
        clipProjectItem,
        at,
        0,
        // V1
        0,
        // A1
        true
        // limitShift
      );
      compoundAction.addAction(action);
    });
    return {
      ok: Boolean(ok),
      message: ok ? "Auf Sequence eingef\xFCgt" : "Sequence-Insert fehlgeschlagen"
    };
  }
  async function insertHitIntoPremiere(input) {
    const { filePath, binName, hit, appendToSequence } = input;
    const localPath = assertLocalImportPath(filePath);
    const ppro = await getPremiereApi();
    if (!ppro) {
      console.info("[VIDEON] premierepro module unavailable; would import", {
        filePath: localPath,
        binName,
        hitId: hit.id,
        appendToSequence,
        inOut: sceneInOutFrames(hit, 25)
      });
      return {
        ok: true,
        mode: "stub",
        message: `Host-API nicht verf\xFCgbar \u2014 Datei bereit: ${localPath}`
      };
    }
    try {
      const project = await ppro.Project.getActiveProject();
      if (!project) throw new Error("Kein aktives Premiere-Projekt");
      if (typeof project.importFiles !== "function") {
        throw new Error("importFiles fehlt \u2014 Premiere UXP \u2265 25.6 n\xF6tig");
      }
      const bin = await ensureBin(ppro, project, binName || "VIDEON");
      const targetBin = bin || null;
      const imported = await project.importFiles([localPath], true, targetBin, false);
      if (imported === false) {
        throw new Error("importFiles hat false zur\xFCckgegeben");
      }
      let clip = await findClipMatchingPath(ppro, project, localPath);
      if (!clip) {
        await new Promise((r) => setTimeout(r, 150));
        clip = await findClipMatchingPath(ppro, project, localPath);
      }
      if (!clip) {
        return {
          ok: true,
          mode: "imported-unresolved",
          message: `Importiert, Clip nicht aufl\xF6sbar \u2014 pr\xFCfe Bin \u201E${binName || "VIDEON"}\u201C`
        };
      }
      const inOut = await applySceneInOut(ppro, project, clip, hit);
      let sequenceNote = "";
      if (appendToSequence) {
        const seq = await appendClipToActiveSequence(ppro, project, clip);
        sequenceNote = seq.ok ? `; ${seq.message}` : `; Sequence: ${seq.message}`;
      }
      const timing = inOut.applied && hit.startMs != null && hit.endMs != null ? ` (${secondsFromMs(hit.startMs).toFixed(2)}s\u2013${secondsFromMs(hit.endMs).toFixed(2)}s)` : "";
      return {
        ok: true,
        mode: "imported",
        message: `Importiert in \u201E${binName || "VIDEON"}\u201C${timing}${sequenceNote}`
      };
    } catch (error) {
      return {
        ok: false,
        mode: "error",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // src/premiere-open-cut.js
  async function getPremiereApi2() {
    try {
      return await loadNativeModule("premierepro");
    } catch {
      return null;
    }
  }
  async function copyToClipboard(text) {
    try {
      const uxp = await loadNativeModule("uxp");
      if (uxp?.clipboard?.writeText) {
        await uxp.clipboard.writeText(String(text));
        return true;
      }
    } catch {
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
    } catch {
    }
    return false;
  }
  async function revealPath(path) {
    if (!path) return false;
    try {
      const uxp = await loadNativeModule("uxp");
      if (typeof uxp?.shell?.openPath === "function") {
        await uxp.shell.openPath(path);
        return true;
      }
      if (typeof uxp?.shell?.showItemInFolder === "function") {
        await uxp.shell.showItemInFolder(path);
        return true;
      }
    } catch (error) {
      console.warn("[VIDEON] revealPath failed", error);
    }
    return false;
  }
  function sequenceKey(seq) {
    if (!seq) return "";
    try {
      if (seq.guid != null) return String(seq.guid);
    } catch {
    }
    try {
      if (typeof seq.getId === "function") return String(seq.getId());
    } catch {
    }
    return String(seq.name || "");
  }
  async function listSequenceSnapshot(project) {
    if (typeof project.getSequences !== "function") return [];
    try {
      const list = await project.getSequences();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  async function revealAndPromptOpenCut(input) {
    const hostInfo2 = input.hostInfo || { id: "PPRO" };
    if (isAfterEffectsHost(hostInfo2) || hostInfo2.id === "AEFT") {
      return {
        ok: false,
        mode: "unsupported",
        message: "Open Cut ist nur in Premiere Pro verf\xFCgbar."
      };
    }
    const xmlPath = input.xmlPath;
    if (!xmlPath) {
      return { ok: false, mode: "unsupported", message: "XML-Pfad fehlt" };
    }
    const clipped = await copyToClipboard(xmlPath);
    const revealed = await revealPath(input.extractDir || xmlPath);
    const reason = input.reason ? `
(${input.reason})` : "";
    return {
      ok: true,
      mode: "reveal_and_prompt",
      xmlPath,
      extractDir: input.extractDir || null,
      cutId: input.cutId,
      exportId: input.exportId,
      clipboard: clipped,
      revealed,
      banner: OPEN_CUT_HANDOFF_BANNER,
      message: `${OPEN_CUT_HANDOFF_BANNER}
${xmlPath}${reason}`
    };
  }
  async function autoImportOpenCutXml(input) {
    const { xmlPath, binName, cutName } = input;
    let localPath;
    try {
      localPath = assertLocalImportPath(xmlPath);
    } catch (error) {
      return {
        ok: false,
        mode: "unavailable",
        message: error instanceof Error ? error.message : String(error)
      };
    }
    const ppro = await getPremiereApi2();
    if (!ppro?.Project) {
      return {
        ok: false,
        mode: "unavailable",
        message: "premierepro Modul nicht verf\xFCgbar"
      };
    }
    try {
      const project = await ppro.Project.getActiveProject();
      if (!project) {
        return { ok: false, mode: "unavailable", message: "Kein aktives Premiere-Projekt" };
      }
      if (typeof project.importFiles !== "function") {
        return {
          ok: false,
          mode: "unavailable",
          message: "importFiles fehlt \u2014 Premiere UXP \u2265 25.6 n\xF6tig"
        };
      }
      const before = await listSequenceSnapshot(project);
      const beforeKeys = new Set(before.map(sequenceKey).filter(Boolean));
      const bin = await ensureBin(ppro, project, binName || "VIDEON");
      const imported = await project.importFiles([localPath], true, bin || null, false);
      if (imported === false) {
        return { ok: false, mode: "unavailable", message: "importFiles hat false zur\xFCckgegeben" };
      }
      await new Promise((r) => setTimeout(r, 200));
      const after = await listSequenceSnapshot(project);
      let created = after.find((seq) => {
        const key = sequenceKey(seq);
        return key && !beforeKeys.has(key);
      });
      if (!created && cutName) {
        const want = String(cutName).toLowerCase();
        created = after.find((seq) => String(seq?.name || "").toLowerCase().includes(want));
      }
      if (!created && after.length > before.length) {
        created = after[after.length - 1];
      }
      if (created && typeof project.openSequence === "function") {
        try {
          await project.openSequence(created);
        } catch (error) {
          console.warn("[VIDEON] openSequence after Open Cut failed", error);
        }
      }
      if (created && typeof project.setActiveSequence === "function") {
        try {
          await project.setActiveSequence(created);
        } catch {
        }
      }
      const sequenceName = created?.name || pathBasename(localPath).replace(/\.xml$/i, "") || cutName || null;
      return {
        ok: true,
        mode: "auto_import",
        sequenceName,
        message: sequenceName ? `Sequenz importiert: ${sequenceName}` : `XMEML importiert (${pathBasename(localPath)}) \u2014 Sequenz in Projekt pr\xFCfen`
      };
    } catch (error) {
      return {
        ok: false,
        mode: "unavailable",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async function openCutInPremiere(input) {
    const hostInfo2 = input.hostInfo || { id: "PPRO" };
    if (isAfterEffectsHost(hostInfo2) || hostInfo2.id === "AEFT") {
      return {
        ok: false,
        mode: "unsupported",
        message: "Open Cut ist nur in Premiere Pro verf\xFCgbar."
      };
    }
    const auto = await autoImportOpenCutXml({
      xmlPath: input.xmlPath,
      binName: input.binName || "VIDEON",
      cutName: input.cutName
    });
    if (auto.ok) {
      return {
        ok: true,
        mode: "auto_import",
        xmlPath: input.xmlPath,
        extractDir: input.extractDir || null,
        cutId: input.cutId,
        exportId: input.exportId,
        sequenceName: auto.sequenceName || null,
        message: auto.message
      };
    }
    console.warn("[VIDEON] auto_import failed \u2192 reveal_and_prompt", auto.message);
    return revealAndPromptOpenCut({
      ...input,
      reason: `Auto-Import: ${auto.message}`
    });
  }

  // src/open-cut.js
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      const t = setTimeout(resolve, ms);
      if (signal) {
        const prev = signal.onabort;
        signal.onabort = (event) => {
          try {
            if (typeof prev === "function") prev.call(signal, event);
          } catch {
          }
          clearTimeout(t);
          reject(new Error("aborted"));
        };
      }
    });
  }
  async function ensurePremiereExport(settings, cut, platformProjectId, signal, onPhase) {
    onPhase?.(OPEN_CUT_PHASE.export);
    const existing = await listCutExports(settings, cut.id, platformProjectId, signal);
    const reusable = pickReusablePremiereExport(cut, existing);
    if (reusable) return reusable;
    const enqueued = await enqueuePremiereExport(
      settings,
      cut.id,
      platformProjectId,
      openCutIdempotencyKey(cut),
      signal
    );
    const started = Date.now();
    let attempt = 0;
    let current = enqueued;
    while (current.status !== "succeeded") {
      if (signal?.aborted) throw new Error("aborted");
      if (current.status === "failed" || current.status === "cancelled") {
        throw new Error(current.errorMessage || `Export ${current.status}`);
      }
      if (Date.now() - started > OPEN_CUT_POLL_TIMEOUT_MS) {
        throw new Error("Export Timeout (10 Min.)");
      }
      await sleep(nextPollDelayMs(attempt), signal);
      attempt += 1;
      const detail = await getCutExport(settings, cut.id, current.id, platformProjectId, signal);
      current = detail?.export || current;
      if (detail?.export?.status === "succeeded" && detail.downloadUrl) {
        return { ...detail.export, _downloadUrl: detail.downloadUrl };
      }
    }
    const finalDetail = await getCutExport(settings, cut.id, current.id, platformProjectId, signal);
    return {
      ...finalDetail?.export || current,
      _downloadUrl: finalDetail?.downloadUrl || null
    };
  }
  async function runOpenCut(input) {
    const {
      settings,
      cut,
      platformProjectId,
      hostInfo: hostInfo2,
      signal,
      handoff = true,
      onPhase
    } = input;
    const emit = (phase, extra) => {
      onPhase?.(phase, phaseLabel(phase, extra));
    };
    if (isAfterEffectsHost(hostInfo2) || hostInfo2?.id === "AEFT") {
      emit(OPEN_CUT_PHASE.error, "nur Premiere");
      return {
        ok: false,
        mode: "unsupported",
        message: "Open Cut ist nur in Premiere Pro verf\xFCgbar."
      };
    }
    if (!platformProjectId) {
      emit(OPEN_CUT_PHASE.error, "Collection fehlt");
      return { ok: false, mode: "unsupported", message: "Collection pinnen, dann Cuts \xF6ffnen." };
    }
    if (!cut?.id) {
      emit(OPEN_CUT_PHASE.error, "Cut fehlt");
      return { ok: false, mode: "unsupported", message: "Kein Cut gew\xE4hlt." };
    }
    try {
      let exportJob = await ensurePremiereExport(settings, cut, platformProjectId, signal, emit);
      let downloadUrl = exportJob._downloadUrl;
      if (!downloadUrl) {
        emit(OPEN_CUT_PHASE.export);
        const detail = await getCutExport(settings, cut.id, exportJob.id, platformProjectId, signal);
        exportJob = detail?.export || exportJob;
        downloadUrl = detail?.downloadUrl;
        if (exportJob.status !== "succeeded") {
          const started = Date.now();
          let attempt = 0;
          while (exportJob.status !== "succeeded") {
            if (exportJob.status === "failed" || exportJob.status === "cancelled") {
              throw new Error(exportJob.errorMessage || `Export ${exportJob.status}`);
            }
            if (Date.now() - started > OPEN_CUT_POLL_TIMEOUT_MS) throw new Error("Export Timeout");
            await sleep(nextPollDelayMs(attempt), signal);
            attempt += 1;
            const again = await getCutExport(settings, cut.id, exportJob.id, platformProjectId, signal);
            exportJob = again?.export || exportJob;
            downloadUrl = again?.downloadUrl;
          }
        }
      }
      if (!downloadUrl) throw new Error("downloadUrl nach Export fehlt");
      emit(OPEN_CUT_PHASE.download);
      const zipBuffer = await downloadExportZip(downloadUrl, signal);
      const cacheKey = openCutCacheKey(cut.id, exportJob.id, exportJob.bytes ?? zipBuffer.byteLength);
      emit(OPEN_CUT_PHASE.extract);
      const extracted = await extractOpenCutZip(cacheKey, zipBuffer);
      if (!handoff) {
        emit(OPEN_CUT_PHASE.done, "ZIP bereit");
        return {
          ok: true,
          mode: "cache_only",
          cutId: cut.id,
          exportId: exportJob.id,
          xmlPath: extracted.xmlNativePath,
          extractDir: extracted.extractDir,
          message: `ZIP bereit:
${extracted.xmlNativePath}`
        };
      }
      emit(OPEN_CUT_PHASE.import);
      const opened = await openCutInPremiere({
        xmlPath: extracted.xmlNativePath,
        extractDir: extracted.extractDir,
        cutId: cut.id,
        exportId: exportJob.id,
        hostInfo: hostInfo2,
        binName: settings.binName || "VIDEON",
        cutName: cut.name
      });
      if (!opened.ok) {
        emit(OPEN_CUT_PHASE.error, opened.message || "import");
        return opened;
      }
      if (opened.mode === "reveal_and_prompt") {
        emit(OPEN_CUT_PHASE.handoff);
      }
      emit(OPEN_CUT_PHASE.done, opened.mode);
      return {
        ...opened,
        message: opened.message
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "aborted") {
        emit(OPEN_CUT_PHASE.error, "abgebrochen");
        return { ok: false, mode: "unsupported", message: "Abgebrochen." };
      }
      emit(OPEN_CUT_PHASE.error, msg.slice(0, 80));
      return { ok: false, mode: "error", message: msg };
    }
  }

  // src/premiere-capture.js
  async function getPremiereApi3() {
    try {
      return await loadNativeModule("premierepro");
    } catch {
      return null;
    }
  }
  async function writePathInDataFolder(fileName) {
    const uxp = await loadNativeModule("uxp");
    const fs = uxp.storage?.localFileSystem;
    if (!fs?.getDataFolder) throw new Error("UXP localFileSystem fehlt");
    const folder = await fs.getDataFolder();
    let pushRoot = folder;
    try {
      if (typeof folder.createFolder === "function") {
        const entries = typeof folder.getEntries === "function" ? await folder.getEntries() : [];
        const existing = entries.find((e) => e?.name === "pushback" && e.isFolder);
        pushRoot = existing || await folder.createFolder("pushback");
      }
    } catch {
      pushRoot = folder;
    }
    const file = await pushRoot.createFile(fileName, { overwrite: true });
    try {
      await file.write("", { format: uxp.storage.formats.utf8 });
    } catch {
      try {
        await file.write(new ArrayBuffer(0), { format: uxp.storage.formats.binary });
      } catch {
      }
    }
    if (!file.nativePath) throw new Error("nativePath f\xFCr Export fehlt");
    return file;
  }
  async function readUtf8File(file) {
    const uxp = await loadNativeModule("uxp");
    const data = await file.read({ format: uxp.storage.formats.utf8 });
    return String(data || "");
  }
  async function captureActiveSequenceXml() {
    const ppro = await getPremiereApi3();
    if (!ppro) {
      return { ok: false, mode: "unavailable", message: "premierepro Modul fehlt" };
    }
    try {
      const project = await ppro.Project.getActiveProject();
      if (!project) {
        return { ok: false, mode: "unavailable", message: "Kein aktives Premiere-Projekt" };
      }
      const sequence = typeof project.getActiveSequence === "function" && await project.getActiveSequence() || null;
      if (!sequence) {
        return { ok: false, mode: "unavailable", message: "Keine aktive Sequenz" };
      }
      const Converter = ppro.ProjectConverter;
      const exportFn = Converter && typeof Converter.exportAsFinalCutProXML === "function" && Converter.exportAsFinalCutProXML || typeof project.exportAsFinalCutProXML === "function" && project.exportAsFinalCutProXML.bind(project) || null;
      if (exportFn) {
        const stamp = Date.now();
        const file = await writePathInDataFolder(`pushback-${stamp}.xml`);
        const path = file.nativePath;
        let ok;
        if (Converter && exportFn === Converter.exportAsFinalCutProXML) {
          ok = await Converter.exportAsFinalCutProXML(sequence, path, true);
        } else {
          ok = await exportFn(path, true);
        }
        if (ok === false) {
          return {
            ok: false,
            mode: "unavailable",
            message: "exportAsFinalCutProXML hat false zur\xFCckgegeben"
          };
        }
        const xml = await readUtf8File(file);
        if (!xml || xml.length < 40) {
          return { ok: false, mode: "unavailable", message: "Export-XML leer" };
        }
        return { ok: true, mode: "host_export", xml, path, sequenceName: sequence.name || null };
      }
      return pickXmlFileFallback();
    } catch (error) {
      console.warn("[VIDEON] captureActiveSequenceXml failed", error);
      return pickXmlFileFallback(error instanceof Error ? error.message : String(error));
    }
  }
  async function pickXmlFileFallback(reason) {
    try {
      const uxp = await loadNativeModule("uxp");
      const fs = uxp.storage?.localFileSystem;
      if (typeof fs?.getFileForOpening !== "function") {
        return {
          ok: false,
          mode: "unsupported",
          message: (reason ? `${reason}. ` : "") + "Sequenz-Export API fehlt (Premiere \u2265 26.2) und kein Datei-Dialog."
        };
      }
      const file = await fs.getFileForOpening({
        types: ["xml"],
        allowMultiple: false
      });
      if (!file) {
        return { ok: false, mode: "unsupported", message: "Kein XML gew\xE4hlt." };
      }
      const xml = await readUtf8File(file);
      if (!xml) return { ok: false, mode: "unsupported", message: "XML leer." };
      return {
        ok: true,
        mode: "file_pick",
        xml,
        path: file.nativePath || null,
        message: reason ? `Host-Export fehlgeschlagen (${reason}) \u2014 Datei verwendet.` : void 0
      };
    } catch (error) {
      return {
        ok: false,
        mode: "unsupported",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // src/xmeml-pushback.js
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function framesToMs(frames, fps) {
    const rate = fps > 0 ? fps : 25;
    const f = Number(frames);
    if (!Number.isFinite(f)) return 0;
    return Math.max(0, Math.round(f / rate * 1e3));
  }
  function pathBasenameFromUrl(pathurl) {
    const raw = String(pathurl || "").replace(/^file:\/+/i, "").replace(/^localhost\/+/i, "").replace(/\\/g, "/");
    const parts = raw.split("/").filter(Boolean);
    const name = parts[parts.length - 1] || raw;
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }
  function normalizeFilenameKey(name) {
    const base3 = String(name || "").split(/[/\\]/).pop()?.trim();
    if (!base3) return "";
    try {
      return decodeURIComponent(base3).toLowerCase();
    } catch {
      return base3.toLowerCase();
    }
  }
  function firstMatch(xml, re) {
    const m = String(xml || "").match(re);
    return m ? m[1] : null;
  }
  function parseSequenceTimebase(xml) {
    const tb = firstMatch(xml, /<sequence[\s\S]*?<rate>[\s\S]*?<timebase>(\d+)<\/timebase>/i) || firstMatch(xml, /<timebase>(\d+)<\/timebase>/i);
    const n = Number(tb);
    return Number.isFinite(n) && n > 0 ? n : 25;
  }
  function mediaAssetIdFromFileId(fileId) {
    const raw = String(fileId || "").trim();
    if (!raw) return null;
    const stripped = raw.replace(/^file-/i, "").trim();
    if (!stripped || stripped === raw) return null;
    if (UUID_RE.test(stripped)) return stripped;
    if (/^\d+$/.test(stripped)) return null;
    if (stripped.length >= 8 && /[a-z]/i.test(stripped)) return stripped;
    return null;
  }
  function extractFileRegistry(xml) {
    const registry = {};
    const re = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi;
    let m;
    while (m = re.exec(String(xml || ""))) {
      const attrs = m[1] || "";
      const body = m[2] || "";
      const id = firstMatch(attrs, /\bid\s*=\s*"([^"]+)"/i) || firstMatch(attrs, /\bid\s*=\s*'([^']+)'/i);
      if (!id) continue;
      if (!body.trim()) continue;
      const pathurl = firstMatch(body, /<pathurl>([\s\S]*?)<\/pathurl>/i);
      const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || "").trim() || null;
      const filename = pathBasenameFromUrl(pathurl) || name;
      registry[id] = {
        id,
        name,
        pathurl: pathurl || null,
        filename: filename || null,
        mediaAssetId: mediaAssetIdFromFileId(id)
      };
    }
    return registry;
  }
  function trackLooksLikeVideo(openTag, body, name) {
    const hasVideoClip = /premiereChannelType\s*=\s*["']video["']/i.test(body);
    const hasAudioClipOnly = /premiereChannelType\s*=\s*["']audio["']/i.test(body) && !hasVideoClip;
    if (hasAudioClipOnly) return false;
    if (/premiereTrackType\s*=\s*["']Stereo["']/i.test(openTag) && !hasVideoClip) return false;
    if (/^a\d+$/i.test(name) || /^audio\b/i.test(name)) return false;
    if (hasVideoClip) return true;
    if (/^v\d+$/i.test(name) || /^video\s*\d*$/i.test(name) || /^main$/i.test(name)) return true;
    if (/<sourcetrack>[\s\S]*?<mediatype>\s*video\s*<\/mediatype>/i.test(body)) return true;
    if (/<clipitem\b/i.test(body) && /<file\b/i.test(body) && !/<sourcetrack>[\s\S]*?<mediatype>\s*audio\s*<\/mediatype>/i.test(body)) {
      return true;
    }
    return false;
  }
  function extractVideoTracks(xml) {
    const tracks = [];
    const re = /<track\b([^>]*)>([\s\S]*?)<\/track>/gi;
    let m;
    while (m = re.exec(String(xml || ""))) {
      const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
      const body = m[2];
      const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || "").trim();
      if (!/<clipitem\b/i.test(body)) continue;
      if (!trackLooksLikeVideo(openTag, body, name)) continue;
      tracks.push({ name, body });
    }
    tracks.sort((a, b) => {
      const rank = (n) => /^v1$/i.test(n) ? 0 : /^v2$/i.test(n) ? 1 : /^video\s*1$/i.test(n) ? 0 : 2;
      return rank(a.name) - rank(b.name);
    });
    return tracks;
  }
  function pickV1Track(tracks) {
    if (!tracks?.length) return null;
    const byName = tracks.find(
      (t) => /^v1$/i.test(t.name) || /^video\s*1$/i.test(t.name) || /main/i.test(t.name)
    );
    return byName || tracks[0];
  }
  function extractClipItems(trackBody) {
    const clips = [];
    const re = /<clipitem\b[^>]*>([\s\S]*?)<\/clipitem>/gi;
    let m;
    while (m = re.exec(trackBody || "")) {
      clips.push(m[1]);
    }
    return clips;
  }
  function parseClipItem(body, fps, fileRegistry) {
    const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || "").trim();
    const start = Number(firstMatch(body, /<start>(-?\d+)<\/start>/i));
    const end = Number(firstMatch(body, /<end>(-?\d+)<\/end>/i));
    const inn = Number(firstMatch(body, /<in>(-?\d+)<\/in>/i));
    const out = Number(firstMatch(body, /<out>(-?\d+)<\/out>/i));
    const fileIdAttr = firstMatch(body, /<file\b[^>]*\bid="([^"]+)"/i) || firstMatch(body, /<file\b[^>]*\bid='([^']+)'/i);
    const inlinePathurl = firstMatch(body, /<pathurl>([\s\S]*?)<\/pathurl>/i);
    const inlineFileName = firstMatch(body, /<file\b[\s\S]*?<name>([\s\S]*?)<\/name>/i);
    const enabledRaw = firstMatch(body, /<enabled>([\s\S]*?)<\/enabled>/i);
    const enabled = !enabledRaw || /true/i.test(enabledRaw);
    const fileMeta = fileIdAttr && fileRegistry?.[fileIdAttr] || null;
    const pathurl = inlinePathurl || fileMeta?.pathurl || null;
    const fileNameTag = (inlineFileName || "").trim() || fileMeta?.name || null;
    let mediaAssetId = mediaAssetIdFromFileId(fileIdAttr) || fileMeta?.mediaAssetId || null;
    const filename = pathBasenameFromUrl(pathurl) || fileNameTag || fileMeta?.filename || name || null;
    if (!Number.isFinite(inn) || !Number.isFinite(out) || out <= inn) return null;
    if (!enabled) return { skipped: true, reason: "disabled" };
    if (start < 0 || end < 0) return { skipped: true, reason: "gap" };
    return {
      name,
      filename,
      mediaAssetId,
      fileId: fileIdAttr,
      pathurl: pathurl || null,
      startMs: framesToMs(inn, fps),
      endMs: framesToMs(out, fps),
      timelineStartMs: framesToMs(start, fps),
      timelineEndMs: framesToMs(end, fps)
    };
  }
  function parsePremiereTimelineXml(xml) {
    const ignored = [];
    if (!xml || !/<xmeml|<xmeml\b|<fcpxml|<sequence/i.test(xml)) {
      return { fps: 25, v1: [], ignored: ["not_xml_timeline"], trackName: null, fileCount: 0 };
    }
    if (/transitionitem/i.test(xml)) ignored.push("transitions");
    if (/effect\b/i.test(xml) && /<effect/i.test(xml)) ignored.push("effects");
    const fps = parseSequenceTimebase(xml);
    const fileRegistry = extractFileRegistry(xml);
    const tracks = extractVideoTracks(xml);
    if (tracks.length > 1) {
      const extra = tracks.slice(1).map((t) => t.name || "video");
      if (extra.some((n) => /^v2$/i.test(n) || /^video\s*2$/i.test(n))) ignored.push("v2_not_applied_p0");
      else if (extra.length) ignored.push("extra_video_tracks");
    }
    const v1Track = pickV1Track(tracks);
    if (!v1Track) {
      return {
        fps,
        v1: [],
        ignored: [...ignored, "no_video_track"],
        trackName: null,
        fileCount: Object.keys(fileRegistry).length
      };
    }
    const v1 = [];
    for (const body of extractClipItems(v1Track.body)) {
      const clip = parseClipItem(body, fps, fileRegistry);
      if (!clip) {
        ignored.push("unparsed_clip");
        continue;
      }
      if (clip.skipped) {
        ignored.push(clip.reason || "skipped_clip");
        continue;
      }
      v1.push(clip);
    }
    return {
      fps,
      v1,
      ignored: [...new Set(ignored)],
      trackName: v1Track.name || "V1",
      fileCount: Object.keys(fileRegistry).length
    };
  }
  function catalogLookupKeys(clip) {
    const keys = [];
    for (const n of [clip.filename, clip.name, pathBasenameFromUrl(clip.pathurl)]) {
      const k = normalizeFilenameKey(n);
      if (k) keys.push(k);
    }
    return [...new Set(keys)];
  }
  function mapClipsToMedia(clips, catalog) {
    const byFilename = catalog?.byFilename || {};
    const byId = catalog?.byId || {};
    const mapped = [];
    const unmapped = [];
    for (const clip of clips) {
      let mediaAssetId = clip.mediaAssetId;
      if (mediaAssetId && byId[mediaAssetId]) {
        mapped.push({ ...clip, mediaAssetId, mapVia: "file_id" });
        continue;
      }
      if (mediaAssetId && !byId[mediaAssetId]) {
        mediaAssetId = null;
      }
      let fromName = null;
      let hitKey = null;
      for (const key of catalogLookupKeys(clip)) {
        if (byFilename[key]) {
          fromName = byFilename[key];
          hitKey = key;
          break;
        }
      }
      if (fromName) {
        mapped.push({
          ...clip,
          mediaAssetId: fromName,
          mapVia: "filename",
          mapKey: hitKey
        });
        continue;
      }
      unmapped.push(clip);
    }
    return { mapped, unmapped };
  }
  function normalizeCutDetailScenes(detail) {
    if (Array.isArray(detail?.scenes) && detail.scenes.length) {
      return detail.scenes;
    }
    if (Array.isArray(detail?.clips)) {
      return detail.clips.map((row) => {
        const scene = row?.scene || row;
        if (!scene?.mediaAssetId && !row?.media?.id) return null;
        return {
          id: scene.id,
          mediaAssetId: scene.mediaAssetId || row.media?.id,
          startMs: scene.startMs,
          endMs: scene.endMs,
          timelineStartMs: scene.timelineStartMs,
          originalFilename: row.media?.originalFilename || row.media?.filename || scene.originalFilename,
          mediaFilename: row.media?.filename,
          media: row.media
        };
      }).filter(Boolean);
    }
    return [];
  }
  function indexFilename(byFilename, name, id) {
    const key = normalizeFilenameKey(name);
    if (key) byFilename[key] = id;
  }
  function buildMediaCatalogFromCutDetail(detail) {
    const byId = {};
    const byFilename = {};
    const scenes = normalizeCutDetailScenes(detail);
    for (const scene of scenes) {
      const id = scene?.mediaAssetId || scene?.media?.id;
      if (!id) continue;
      byId[id] = true;
      const names = [
        scene.originalFilename,
        scene.mediaFilename,
        scene.media?.originalFilename,
        scene.media?.filename,
        scene.filename
      ];
      for (const n of names) indexFilename(byFilename, n, id);
    }
    return { byId, byFilename };
  }
  function buildMediaCatalogFromMediaList(items) {
    const byId = {};
    const byFilename = {};
    for (const item of items || []) {
      const id = item?.id || item?.mediaAssetId;
      if (!id) continue;
      byId[id] = true;
      for (const n of [item.originalFilename, item.filename, item.name]) {
        indexFilename(byFilename, n, id);
      }
    }
    return { byId, byFilename };
  }
  function mergeMediaCatalogs(...catalogs) {
    const byId = {};
    const byFilename = {};
    for (const c of catalogs) {
      Object.assign(byId, c?.byId || {});
      Object.assign(byFilename, c?.byFilename || {});
    }
    return { byId, byFilename };
  }
  function diffV1Timelines(currentScenes, mappedClips) {
    const current = (currentScenes || []).map((s) => ({
      mediaAssetId: s.mediaAssetId,
      startMs: s.startMs,
      endMs: s.endMs,
      timelineStartMs: s.timelineStartMs ?? 0
    }));
    const next = (mappedClips || []).map((c) => ({
      mediaAssetId: c.mediaAssetId,
      startMs: c.startMs,
      endMs: c.endMs,
      timelineStartMs: c.timelineStartMs ?? 0
    }));
    const sameLength = current.length === next.length;
    let changed = current.length !== next.length;
    const pairChanges = [];
    const n = Math.min(current.length, next.length);
    for (let i = 0; i < n; i += 1) {
      const a = current[i];
      const b = next[i];
      if (a.mediaAssetId !== b.mediaAssetId || a.startMs !== b.startMs || a.endMs !== b.endMs || a.timelineStartMs !== b.timelineStartMs) {
        changed = true;
        pairChanges.push(i);
      }
    }
    return {
      currentCount: current.length,
      nextCount: next.length,
      changed,
      sameLength,
      changedIndexes: pairChanges,
      summary: changed ? `V1: ${current.length} \u2192 ${next.length} Clips` + (pairChanges.length ? ` \xB7 ${pairChanges.length} ge\xE4ndert` : "") : "V1 unver\xE4ndert"
    };
  }
  function newSceneId() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i += 1) bytes[i] = Math.random() * 256 | 0;
    }
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  var MIN_PUSHBACK_CLIP_MS = 500;
  function mappedClipsToRestoreScenes(mappedClips, newId = newSceneId) {
    let clampedCount = 0;
    const scenes = (mappedClips || []).map((clip, position) => {
      const startMs = Math.max(0, Math.floor(Number(clip.startMs) || 0));
      let endMs = Math.max(0, Math.floor(Number(clip.endMs) || 0));
      if (endMs - startMs < MIN_PUSHBACK_CLIP_MS) {
        endMs = startMs + MIN_PUSHBACK_CLIP_MS;
        clampedCount += 1;
      }
      const timelineStartMs = Math.max(0, Math.floor(Number(clip.timelineStartMs) || 0));
      return {
        id: newId(),
        position,
        mediaAssetId: clip.mediaAssetId,
        startMs,
        endMs,
        timelineStartMs
      };
    });
    return { scenes, clampedCount };
  }
  function formatPushbackDiffMessage(diff, ignored, unmappedCount, clampedCount = 0) {
    const lines = [diff.summary];
    if (unmappedCount) lines.push(`Unmapped: ${unmappedCount} Clip(s)`);
    if (clampedCount) lines.push(`Hinweis: ${clampedCount} Clip(s) auf \u2265${MIN_PUSHBACK_CLIP_MS}ms angehoben`);
    if (ignored?.length) lines.push(`Ignoriert: ${ignored.join(", ")}`);
    return lines.join("\n");
  }
  function formatUnmappedHint(unmapped) {
    if (!unmapped?.length) return "";
    const names = unmapped.slice(0, 4).map((c) => c.filename || c.name || c.fileId || "?").join(", ");
    const more = unmapped.length > 4 ? ` (+${unmapped.length - 4})` : "";
    return ` (${names}${more})`;
  }

  // src/cut-pushback.js
  async function previewCutPushback(input) {
    const { settings, cut, platformProjectId, hostInfo: hostInfo2, signal } = input;
    if (isAfterEffectsHost(hostInfo2) || hostInfo2?.id === "AEFT") {
      return {
        ok: false,
        mode: "unsupported",
        message: "Cut aktualisieren nur in Premiere Pro."
      };
    }
    if (!platformProjectId || !cut?.id) {
      return { ok: false, mode: "unsupported", message: "Collection/Cut fehlt." };
    }
    const captured = await captureActiveSequenceXml();
    if (!captured.ok || !captured.xml) {
      return {
        ok: false,
        mode: captured.mode || "unsupported",
        message: captured.message || "Sequenz-Capture fehlgeschlagen."
      };
    }
    const detail = await getCutDetail(settings, cut.id, platformProjectId, signal);
    const mediaItems = await listWorkspaceMedia(settings, platformProjectId, signal).catch(() => []);
    const catalog = mergeMediaCatalogs(
      buildMediaCatalogFromCutDetail(detail),
      buildMediaCatalogFromMediaList(mediaItems)
    );
    const parsed = parsePremiereTimelineXml(captured.xml);
    if (!parsed.v1.length) {
      return {
        ok: false,
        mode: "apply_rejected",
        message: "Keine V1-Clips in der Sequenz-XML gefunden" + (parsed.ignored?.length ? ` (${parsed.ignored.join(", ")})` : "") + ".",
        ignored: parsed.ignored,
        unmapped: [],
        captureMode: captured.mode
      };
    }
    const { mapped, unmapped } = mapClipsToMedia(parsed.v1, catalog);
    if (!mapped.length) {
      return {
        ok: false,
        mode: "apply_rejected",
        message: `Keine V1-Clips auf Collection-Medien mappbar${formatUnmappedHint(unmapped)}. Premiere schreibt oft file-1 statt file-{uuid} \u2014 Filename muss zur Mediathek passen.`,
        ignored: parsed.ignored,
        unmapped,
        captureMode: captured.mode
      };
    }
    if (unmapped.length) {
      return {
        ok: false,
        mode: "apply_rejected",
        message: `${unmapped.length} Clip(s) ohne mediaAssetId \u2014 Apply blockiert${formatUnmappedHint(unmapped)}.`,
        ignored: parsed.ignored,
        unmapped,
        mapped,
        captureMode: captured.mode
      };
    }
    const scenes = normalizeCutDetailScenes(detail);
    const diff = diffV1Timelines(scenes, mapped);
    const { scenes: restoreScenes, clampedCount } = mappedClipsToRestoreScenes(mapped);
    const message = formatPushbackDiffMessage(diff, parsed.ignored, 0, clampedCount);
    return {
      ok: true,
      mode: "preview_diff",
      message,
      diff,
      ignored: parsed.ignored,
      mapped,
      restoreScenes,
      clampedCount,
      captureMode: captured.mode,
      sequenceName: captured.sequenceName || null,
      needsParityRefresh: (parsed.ignored || []).length > 0 || clampedCount > 0,
      cutId: cut.id,
      platformProjectId
    };
  }
  async function applyCutPushback(input) {
    const { settings, cutId, platformProjectId, restoreScenes, signal } = input;
    if (!restoreScenes?.length) {
      return { ok: false, mode: "apply_rejected", message: "Keine Scenes zum Restore." };
    }
    const result = await restoreCutFromPushback(
      settings,
      cutId,
      platformProjectId,
      restoreScenes,
      signal
    );
    return {
      ok: true,
      mode: "apply_replace",
      message: "Cut aktualisiert.",
      result
    };
  }

  // src/cut-link-store.js
  var KEY = "videon.adobe.cutSequenceLinks";
  function readCutLinks() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }
  function writeCutLinks(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
  }
  function saveCutSequenceLink(link) {
    if (!link?.cutId || !link?.platformProjectId) return null;
    const map = readCutLinks();
    const key = `${link.platformProjectId}:${link.cutId}`;
    map[key] = {
      cutId: link.cutId,
      platformProjectId: link.platformProjectId,
      sequenceName: link.sequenceName || null,
      exportId: link.exportId || null,
      openedAt: link.openedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
    writeCutLinks(map);
    return map[key];
  }

  // src/collections.js
  function normalizeCollections(payload) {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const out = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!id || !name) continue;
      out.push({
        id,
        name,
        status: typeof item.status === "string" ? item.status : "active"
      });
    }
    return out;
  }

  // src/hit-model.js
  function formatSceneHitClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function sceneHitTimingLabel(hit) {
    if (hit.startMs != null && hit.endMs != null) {
      return `${formatSceneHitClock(hit.startMs)}\u2013${formatSceneHitClock(hit.endMs)}`;
    }
    if (hit.startMs != null) return formatSceneHitClock(hit.startMs);
    return null;
  }
  function sceneHitDurationLabel(hit) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs < hit.startMs) return null;
    return formatSceneHitClock(hit.endMs - hit.startMs);
  }
  function formatRank(rank) {
    const n = Number(rank);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toFixed(2);
  }
  function buildHitHref(hit) {
    if (!hit?.mediaAssetId || !hit?.platformProjectId) return null;
    const params = new URLSearchParams({ platformProjectId: hit.platformProjectId });
    if (hit.startMs != null && hit.startMs >= 0) params.set("t", String(Math.floor(hit.startMs)));
    if (hit.sceneKey?.trim()) params.set("scene", hit.sceneKey.trim());
    return `/media/${encodeURIComponent(hit.mediaAssetId)}?${params.toString()}`;
  }
  function normalizeSearchHit(raw) {
    const mediaAssetId = String(raw.mediaAssetId || "");
    const platformProjectId = String(raw.platformProjectId || "");
    const startMs = raw.startMs == null ? null : Number(raw.startMs);
    const endMs = raw.endMs == null ? null : Number(raw.endMs);
    const sceneKey = raw.sceneKey == null ? null : String(raw.sceneKey);
    const rank = raw.rank == null ? null : Number(raw.rank);
    const hit = {
      id: String(raw.id || `${mediaAssetId}:${sceneKey || "asset"}`),
      mediaAssetId,
      platformProjectId,
      sceneKey,
      mediaFilename: String(raw.mediaFilename || raw.filename || "Untitled"),
      startMs: Number.isFinite(startMs) ? startMs : null,
      endMs: Number.isFinite(endMs) ? endMs : null,
      searchText: String(raw.searchText || "").slice(0, 400),
      projectName: raw.projectName == null ? null : String(raw.projectName),
      rank: Number.isFinite(rank) ? rank : null,
      href: raw.href ? String(raw.href) : null
    };
    if (!hit.href) hit.href = buildHitHref(hit);
    return hit;
  }
  function dedupeSearchHits(hits2) {
    const byKey = /* @__PURE__ */ new Map();
    for (const hit of hits2) {
      if (!hit?.mediaAssetId) continue;
      const key = `${hit.mediaAssetId}::${hit.sceneKey || ""}::${hit.startMs ?? ""}::${hit.endMs ?? ""}`;
      const prev = byKey.get(key);
      if (!prev || (hit.rank ?? 0) > (prev.rank ?? 0)) byKey.set(key, hit);
    }
    return [...byKey.values()];
  }

  // src/index.js
  var PANEL_VERSION = "0.1.22";
  var PREVIEW_CONCURRENCY = 2;
  var els = {};
  function queryEls() {
    return {
      panelVersion: document.getElementById("panel-version"),
      settingsToggle: document.getElementById("settings-toggle"),
      settingsPanel: document.getElementById("settings-panel"),
      productBaseUrl: document.getElementById("product-base-url"),
      apiToken: document.getElementById("api-token"),
      collectionSelect: document.getElementById("collection-select"),
      collectionSelectMain: document.getElementById("collection-select-main"),
      defaultProjectId: document.getElementById("default-project-id"),
      binName: document.getElementById("bin-name"),
      compName: document.getElementById("comp-name"),
      premiereBinLabel: document.getElementById("premiere-bin-label"),
      aeCompLabel: document.getElementById("ae-comp-label"),
      settingsSave: document.getElementById("settings-save"),
      testConnection: document.getElementById("test-connection"),
      reloadCollections: document.getElementById("reload-collections"),
      cacheStats: document.getElementById("cache-stats"),
      cacheRefresh: document.getElementById("cache-refresh"),
      cacheClear: document.getElementById("cache-clear"),
      settingsStatus: document.getElementById("settings-status"),
      bootStatus: document.getElementById("boot-status"),
      searchInput: document.getElementById("search-input"),
      searchBtn: document.getElementById("search-btn"),
      banner: document.getElementById("banner"),
      resultsList: document.getElementById("results-list"),
      resultsCount: document.getElementById("results-count"),
      selectAllBtn: document.getElementById("select-all-btn"),
      selectNoneBtn: document.getElementById("select-none-btn"),
      insertBar: document.getElementById("insert-bar"),
      hostBadge: document.getElementById("host-badge"),
      premiereInsertOpts: document.getElementById("premiere-insert-opts"),
      aeInsertOpts: document.getElementById("ae-insert-opts"),
      appendSequence: document.getElementById("append-sequence"),
      aeSequential: document.getElementById("ae-sequential"),
      aeGapFrames: document.getElementById("ae-gap-frames"),
      dryRunBtn: document.getElementById("dry-run-btn"),
      insertBtn: document.getElementById("insert-btn"),
      selectedCount: document.getElementById("selected-count"),
      progress: document.getElementById("progress"),
      progressBar: document.getElementById("progress-bar"),
      modeScenesBtn: document.getElementById("mode-scenes-btn"),
      modeCutsBtn: document.getElementById("mode-cuts-btn"),
      scenesMode: document.getElementById("scenes-mode"),
      cutsMode: document.getElementById("cuts-mode"),
      cutsBanner: document.getElementById("cuts-banner"),
      cutsList: document.getElementById("cuts-list"),
      cutsCount: document.getElementById("cuts-count"),
      cutsRefreshBtn: document.getElementById("cuts-refresh-btn"),
      pushbackConfirm: document.getElementById("pushback-confirm"),
      pushbackDiff: document.getElementById("pushback-diff"),
      pushbackApplyBtn: document.getElementById("pushback-apply-btn"),
      pushbackRefreshBtn: document.getElementById("pushback-refresh-btn"),
      pushbackCancelBtn: document.getElementById("pushback-cancel-btn")
    };
  }
  var REQUIRED_EL_IDS = [
    "settings-toggle",
    "settings-panel",
    "settings-save",
    "test-connection",
    "settings-status",
    "product-base-url",
    "api-token",
    "search-input",
    "search-btn"
  ];
  function missingRequiredEls() {
    return REQUIRED_EL_IDS.filter((id) => !document.getElementById(id));
  }
  var hits = [];
  var selected = /* @__PURE__ */ new Set();
  var blobUrls = [];
  var collections = [];
  var searchAbort = null;
  var cutsAbort = null;
  var openCutAbort = null;
  var panelMode = "scenes";
  var cuts = [];
  var openCutBusy = false;
  var pendingPushback = null;
  var hostInfo = { id: "PPRO", source: "default" };
  var aeCursorSec = 0;
  function showBanner(message, tone = "") {
    const target = panelMode === "cuts" ? els.cutsBanner : els.banner;
    if (!target) return;
    target.hidden = !message;
    target.textContent = message || "";
    target.className = `banner${tone ? ` ${tone}` : ""}`;
  }
  function setPanelMode(mode) {
    panelMode = mode === "cuts" ? "cuts" : "scenes";
    els.modeScenesBtn?.classList.toggle("is-active", panelMode === "scenes");
    els.modeCutsBtn?.classList.toggle("is-active", panelMode === "cuts");
    els.scenesMode?.classList.toggle("hidden", panelMode !== "scenes");
    els.cutsMode?.classList.toggle("hidden", panelMode !== "cuts");
    if (panelMode === "cuts") {
      searchAbort?.abort();
      openCutAbort?.abort();
      openCutBusy = false;
      void refreshCutsList();
    } else {
      cutsAbort?.abort();
      openCutAbort?.abort();
      openCutBusy = false;
      hidePushbackConfirm();
    }
  }
  function applyHostChrome() {
    const ae = isAfterEffectsHost(hostInfo);
    els.premiereBinLabel?.classList.toggle("hidden", ae);
    els.aeCompLabel?.classList.toggle("hidden", !ae);
    els.premiereInsertOpts?.classList.toggle("hidden", ae);
    els.aeInsertOpts?.classList.toggle("hidden", !ae);
    if (els.hostBadge) {
      els.hostBadge.hidden = false;
      els.hostBadge.textContent = ae ? `Host: After Effects (${hostInfo.source})` : `Host: Premiere Pro (${hostInfo.source})`;
    }
  }
  function updateCacheStatsLabel(stats) {
    if (!els.cacheStats) return;
    const s = stats || getCacheStats();
    els.cacheStats.textContent = `${s.count} Datei(en) \xB7 ${formatCacheBytes(s.bytes)}`;
  }
  async function refreshCacheUi(showStatus = false) {
    try {
      const stats = await refreshCacheStats();
      updateCacheStatsLabel(stats);
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = `Cache: ${stats.count} \xB7 ${formatCacheBytes(stats.bytes)}`;
      }
    } catch (error) {
      updateCacheStatsLabel(getCacheStats());
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  }
  async function loadPosterForHit(settings, hit, signal) {
    const key = posterCacheKey(hit);
    try {
      const cached = await readCachedPosterBlob(key);
      if (cached) return cached;
    } catch {
    }
    const blob = await fetchFrameBlob(settings, hit, signal);
    if (!blob) return null;
    void materializePoster({ cacheKey: key, blob, filename: "poster.jpg" });
    return blob;
  }
  function revokeBlobs() {
    while (blobUrls.length) {
      const url = blobUrls.pop();
      try {
        URL.revokeObjectURL(url);
      } catch {
      }
    }
  }
  async function openExternal(href) {
    try {
      const uxp = await loadNativeModule("uxp");
      if (uxp?.shell?.openExternal) {
        await uxp.shell.openExternal(href);
        return;
      }
    } catch {
    }
    try {
      window.open(href, "_blank");
    } catch {
      showBanner(href, "ok");
    }
  }
  function fillCollectionSelect(select, selectedId) {
    if (!select) return;
    const current = selectedId || "";
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "\u2014 alle zug\xE4nglichen \u2014";
    select.append(all);
    for (const item of collections) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.status && item.status !== "active" ? `${item.name} (${item.status})` : item.name;
      select.append(opt);
    }
    select.value = collections.some((c) => c.id === current) ? current : "";
  }
  function syncCollectionUi(selectedId) {
    fillCollectionSelect(els.collectionSelect, selectedId);
    fillCollectionSelect(els.collectionSelectMain, selectedId);
    if (els.defaultProjectId) els.defaultProjectId.value = selectedId || "";
  }
  function applySettingsToForm(settings) {
    els.productBaseUrl.value = settings.productBaseUrl || "";
    els.apiToken.value = settings.apiToken || "";
    if (els.binName) els.binName.value = settings.binName || "VIDEON";
    if (els.compName) els.compName.value = settings.compName || "VIDEON";
    if (els.aeSequential) els.aeSequential.checked = settings.aeSequential !== false;
    if (els.aeGapFrames) els.aeGapFrames.value = String(settings.aeGapFrames ?? 0);
    syncCollectionUi(settings.defaultPlatformProjectId || "");
  }
  function readFormSettings() {
    const fromSelect = els.collectionSelectMain?.value?.trim() || els.collectionSelect?.value?.trim() || els.defaultProjectId.value.trim();
    return {
      productBaseUrl: els.productBaseUrl.value.trim(),
      apiToken: els.apiToken.value.trim(),
      defaultPlatformProjectId: fromSelect,
      binName: els.binName?.value.trim() || "VIDEON",
      compName: els.compName?.value.trim() || "VIDEON",
      aeSequential: els.aeSequential ? els.aeSequential.checked : true,
      aeGapFrames: els.aeGapFrames ? Math.max(0, Number(els.aeGapFrames.value) || 0) : 0
    };
  }
  function onCollectionChange(event) {
    const id = event.target.value;
    if (els.collectionSelect) els.collectionSelect.value = id;
    if (els.collectionSelectMain) els.collectionSelectMain.value = id;
    if (els.defaultProjectId) els.defaultProjectId.value = id;
    saveSettings({ defaultPlatformProjectId: id });
    if (panelMode === "cuts") void refreshCutsList();
  }
  function showCutsBanner(message, tone = "") {
    if (!els.cutsBanner) return;
    els.cutsBanner.hidden = !message;
    els.cutsBanner.textContent = message || "";
    els.cutsBanner.className = `banner${tone ? ` ${tone}` : ""}`;
  }
  function updateCutRowStatus(cutId, text, isError = false) {
    let card = null;
    for (const node of els.cutsList?.querySelectorAll(".cut-card") || []) {
      if (node.getAttribute("data-cut-id") === cutId) {
        card = node;
        break;
      }
    }
    if (!card) return;
    let status = card.querySelector(".cut-card-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "cut-card-status";
      card.append(status);
    }
    status.textContent = text || "";
    status.classList.toggle("is-error", Boolean(isError));
    status.hidden = !text;
    card.classList.toggle("is-busy", Boolean(text) && !isError && openCutBusy);
  }
  function buildCutCard(cut) {
    const card = document.createElement("article");
    card.className = "cut-card";
    card.setAttribute("data-cut-id", cut.id);
    const title = document.createElement("div");
    title.className = "cut-card-title";
    title.textContent = cut.name;
    const meta = document.createElement("div");
    meta.className = "cut-card-meta";
    const parts = [canvasLabel(cut)];
    if (cut.sceneCount != null) parts.push(`${cut.sceneCount} Szenen`);
    parts.push(formatUpdatedAt(cut.updatedAt));
    meta.textContent = parts.join(" \xB7 ");
    const actions = document.createElement("div");
    actions.className = "cut-card-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "primary";
    openBtn.textContent = "In Premiere \xF6ffnen";
    on(openBtn, "click", (event) => {
      event.stopPropagation?.();
      void startOpenCut(cut, true);
    });
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "ghost";
    refreshBtn.textContent = "Premiere aktualisieren";
    on(refreshBtn, "click", (event) => {
      event.stopPropagation?.();
      void startOpenCut(cut, true);
    });
    const cacheBtn = document.createElement("button");
    cacheBtn.type = "button";
    cacheBtn.className = "ghost";
    cacheBtn.textContent = "ZIP cachen";
    on(cacheBtn, "click", (event) => {
      event.stopPropagation?.();
      void startOpenCut(cut, false);
    });
    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.className = "ghost";
    pushBtn.textContent = "Cut aktualisieren";
    on(pushBtn, "click", (event) => {
      event.stopPropagation?.();
      void startCutPushback(cut);
    });
    actions.append(openBtn, refreshBtn, pushBtn, cacheBtn);
    card.append(title, meta, actions);
    return card;
  }
  function renderCutsList() {
    if (!els.cutsList) return;
    if (els.cutsCount) els.cutsCount.textContent = String(cuts.length);
    if (!cuts.length) {
      els.cutsList.innerHTML = '<p class="empty">Keine Cuts in dieser Collection.</p>';
      return;
    }
    els.cutsList.innerHTML = "";
    for (const cut of cuts) els.cutsList.append(buildCutCard(cut));
  }
  async function refreshCutsList() {
    const settings = saveSettings(readFormSettings());
    const platformProjectId = settings.defaultPlatformProjectId || "";
    if (!platformProjectId) {
      cuts = [];
      if (els.cutsCount) els.cutsCount.textContent = "0";
      if (els.cutsList) {
        els.cutsList.innerHTML = '<p class="empty">Collection pinnen (nicht \u201Ealle\u201C), dann Cuts laden.</p>';
      }
      showCutsBanner("F\xFCr Cuts eine Collection w\xE4hlen.", "error");
      return;
    }
    if (!settings.apiToken) {
      showCutsBanner("API Token in den Einstellungen setzen.", "error");
      return;
    }
    cutsAbort?.abort();
    cutsAbort = new AbortController();
    const { signal } = cutsAbort;
    showCutsBanner("Cuts laden\u2026");
    try {
      cuts = await listCuts(settings, platformProjectId, signal);
      if (signal.aborted) return;
      renderCutsList();
      showCutsBanner(cuts.length ? `${cuts.length} Cut(s)` : "Keine Cuts.", cuts.length ? "ok" : "");
    } catch (error) {
      if (signal.aborted) return;
      const msg = error instanceof Error ? error.message : String(error);
      showCutsBanner(msg, "error");
    }
  }
  async function startOpenCut(cut, handoff) {
    if (openCutBusy) {
      showCutsBanner("Bitte warten \u2014 Open Cut l\xE4uft bereits.", "error");
      return;
    }
    const settings = saveSettings(readFormSettings());
    const platformProjectId = settings.defaultPlatformProjectId || "";
    if (!platformProjectId) {
      showCutsBanner("Collection pinnen.", "error");
      return;
    }
    if (isAfterEffectsHost(hostInfo)) {
      showCutsBanner("Open Cut ist nur in Premiere Pro verf\xFCgbar.", "error");
      return;
    }
    openCutBusy = true;
    openCutAbort?.abort();
    openCutAbort = new AbortController();
    const { signal } = openCutAbort;
    const result = await runOpenCut({
      settings,
      cut,
      platformProjectId,
      hostInfo,
      signal,
      handoff,
      onPhase: (_phase, label) => {
        updateCutRowStatus(cut.id, label, false);
        showCutsBanner(`${cut.name}: ${label}`);
      }
    });
    openCutBusy = false;
    if (result.ok) {
      if (handoff && platformProjectId) {
        saveCutSequenceLink({
          cutId: cut.id,
          platformProjectId,
          sequenceName: result.sequenceName || cut.name,
          exportId: result.exportId || null,
          openedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      updateCutRowStatus(cut.id, result.message || "Fertig", false);
      showCutsBanner(result.message || "Fertig", "ok");
    } else {
      updateCutRowStatus(cut.id, result.message || "Fehler", true);
      showCutsBanner(result.message || "Fehler", "error");
    }
  }
  function hidePushbackConfirm() {
    pendingPushback = null;
    els.pushbackConfirm?.classList.add("hidden");
    if (els.pushbackDiff) els.pushbackDiff.textContent = "";
  }
  function showPushbackConfirm(preview) {
    pendingPushback = preview;
    if (els.pushbackDiff) els.pushbackDiff.textContent = preview.message || "";
    els.pushbackConfirm?.classList.remove("hidden");
  }
  async function startCutPushback(cut) {
    if (openCutBusy) {
      showCutsBanner("Bitte warten\u2026", "error");
      return;
    }
    const settings = saveSettings(readFormSettings());
    const platformProjectId = settings.defaultPlatformProjectId || "";
    if (!platformProjectId) {
      showCutsBanner("Collection pinnen.", "error");
      return;
    }
    if (isAfterEffectsHost(hostInfo)) {
      showCutsBanner("Cut aktualisieren nur in Premiere.", "error");
      return;
    }
    openCutBusy = true;
    hidePushbackConfirm();
    showCutsBanner(`${cut.name}: Sequenz lesen\u2026`);
    updateCutRowStatus(cut.id, "Pushback\u2026", false);
    try {
      const preview = await previewCutPushback({
        settings,
        cut,
        platformProjectId,
        hostInfo
      });
      openCutBusy = false;
      if (!preview.ok) {
        updateCutRowStatus(cut.id, preview.message || "Fehler", true);
        showCutsBanner(preview.message || "Fehler", "error");
        return;
      }
      if (!preview.diff?.changed) {
        updateCutRowStatus(cut.id, "Bereits gleich", false);
        showCutsBanner("Cut entspricht der Sequenz (V1).", "ok");
        return;
      }
      showPushbackConfirm(preview);
      showCutsBanner("Diff pr\xFCfen und \xFCbernehmen.", "ok");
      updateCutRowStatus(cut.id, preview.diff.summary, false);
    } catch (error) {
      openCutBusy = false;
      const msg = error instanceof Error ? error.message : String(error);
      updateCutRowStatus(cut.id, msg, true);
      showCutsBanner(msg, "error");
    }
  }
  async function confirmPushback(withParityRefresh) {
    if (!pendingPushback?.restoreScenes?.length) {
      hidePushbackConfirm();
      return;
    }
    const preview = pendingPushback;
    const settings = saveSettings(readFormSettings());
    openCutBusy = true;
    showCutsBanner("Cut wird geschrieben\u2026");
    try {
      const applied = await applyCutPushback({
        settings,
        cutId: preview.cutId,
        platformProjectId: preview.platformProjectId,
        restoreScenes: preview.restoreScenes
      });
      hidePushbackConfirm();
      if (!applied.ok) {
        openCutBusy = false;
        showCutsBanner(applied.message || "Apply fehlgeschlagen", "error");
        return;
      }
      const cut = cuts.find((c) => c.id === preview.cutId) || {
        id: preview.cutId,
        name: preview.cutId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (withParityRefresh || preview.needsParityRefresh) {
        showCutsBanner("Cut OK \u2014 Premiere wird neu geladen\u2026", "ok");
        openCutBusy = false;
        await startOpenCut({ ...cut, name: cut.name || preview.sequenceName || cut.id }, true);
        showCutsBanner(
          "Cut aktualisiert. Premiere neu geladen \u2014 beide Seiten gleich (Cut-Modell).",
          "ok"
        );
        return;
      }
      openCutBusy = false;
      updateCutRowStatus(preview.cutId, "Cut aktualisiert", false);
      showCutsBanner("Cut entspricht der Sequenz.", "ok");
    } catch (error) {
      openCutBusy = false;
      hidePushbackConfirm();
      showCutsBanner(error instanceof Error ? error.message : String(error), "error");
    }
  }
  function updateSelectionChrome() {
    els.selectedCount.textContent = String(selected.size);
    els.insertBar.classList.toggle("hidden", selected.size === 0);
    const hasHits = hits.length > 0;
    els.selectAllBtn.hidden = !hasHits;
    els.selectNoneBtn.hidden = !hasHits;
  }
  function setBusy(busy) {
    els.searchBtn.disabled = busy;
    els.dryRunBtn.disabled = busy;
    els.insertBtn.disabled = busy;
    for (const btn of els.resultsList?.querySelectorAll(".hit-insert-btn") || []) {
      btn.disabled = busy;
    }
  }
  function findHitCard(hitId) {
    if (!els.resultsList) return null;
    for (const node of els.resultsList.querySelectorAll(".hit-card") || []) {
      if (node.getAttribute("data-hit-id") === hitId) return node;
    }
    return null;
  }
  async function mapPool(items, concurrency, worker) {
    const list = [...items];
    const limit = Math.max(1, concurrency);
    const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (list.length) {
        const item = list.shift();
        if (item === void 0) return;
        await worker(item);
      }
    });
    await Promise.all(runners);
  }
  function authErrorHint(message) {
    const text = String(message || "");
    if (/service_unauthorized/i.test(text) || /Authentication required/i.test(text) || /Invalid or missing API token/i.test(text)) {
      return `${text} \u2014 Token unbekannt (nach Restart/Deploy neu in VIDEON Settings erzeugen, videon_\u2026 hier einf\xFCgen). Owner kommt automatisch aus dem Token.`;
    }
    return text;
  }
  async function refreshCollections(showStatus = true) {
    const settings = saveSettings(readFormSettings());
    if (!settings.apiToken) {
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = "Token setzen, dann Collections laden.";
      }
      return;
    }
    if (!looksLikeApiToken(settings.apiToken)) {
      const msg = "Token-Format pr\xFCfen: videon_ + 64 Hex-Zeichen";
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = msg;
      }
      showBanner(msg, "error");
      return;
    }
    if (showStatus) {
      els.settingsStatus.hidden = false;
      els.settingsStatus.textContent = "Collections\u2026";
    }
    try {
      const payload = await listCollections(settings);
      collections = normalizeCollections(payload);
      syncCollectionUi(settings.defaultPlatformProjectId);
      if (showStatus) {
        els.settingsStatus.textContent = `${collections.length} Collection(s)`;
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const msg = authErrorHint(raw);
      if (showStatus) {
        els.settingsStatus.textContent = msg;
      }
      showBanner(msg, "error");
    }
  }
  function buildHitRow(settings, hit, posterUrl) {
    const row = document.createElement("article");
    row.className = `hit-card${selected.has(hit.id) ? " selected" : ""}`;
    row.setAttribute("data-hit-id", hit.id);
    const media = document.createElement("div");
    media.className = "hit-card-media";
    const img = document.createElement("img");
    img.className = "hit-card-thumb";
    img.alt = hit.mediaFilename || "Szene";
    if (posterUrl) {
      img.src = posterUrl;
    } else {
      img.classList.add("hit-ph");
    }
    const video = document.createElement("video");
    video.className = "hit-card-preview";
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
    video.style.display = "none";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "hit-card-check";
    check.checked = selected.has(hit.id);
    check.title = "Ausw\xE4hlen";
    on(check, "click", (event) => {
      event.stopPropagation?.();
    });
    on(check, "change", () => {
      if (check.checked) selected.add(hit.id);
      else selected.delete(hit.id);
      row.classList.toggle("selected", check.checked);
      updateSelectionChrome();
    });
    const timing = sceneHitTimingLabel(hit);
    const duration = sceneHitDurationLabel(hit);
    if (duration || timing) {
      const badge = document.createElement("span");
      badge.className = "hit-card-badge";
      badge.textContent = duration ? `\u0394 ${duration}` : timing;
      media.append(badge);
    }
    media.append(img, video, check);
    const body = document.createElement("div");
    body.className = "hit-card-body";
    const title = document.createElement("div");
    title.className = "hit-title";
    title.textContent = hit.mediaFilename || "Clip";
    title.title = hit.mediaFilename || "";
    const meta = document.createElement("div");
    meta.className = "hit-meta";
    const rank = formatRank(hit.rank);
    meta.textContent = [hit.projectName, timing, hit.sceneKey, rank ? `rank ${rank}` : null].filter(Boolean).join(" \xB7 ");
    const snippet = document.createElement("div");
    snippet.className = "hit-snippet";
    snippet.textContent = hit.searchText || "";
    snippet.title = hit.searchText || "";
    const actions = document.createElement("div");
    actions.className = "hit-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "ghost tiny";
    open.textContent = "In VIDEON";
    on(open, "click", (event) => {
      event.stopPropagation?.();
      const href = absoluteProductHref(settings, hit.href);
      if (!href) {
        showBanner("Kein Deep Link am Treffer.", "error");
        return;
      }
      void openExternal(href);
    });
    const insertOne = document.createElement("button");
    insertOne.type = "button";
    insertOne.className = "primary tiny hit-insert-btn";
    insertOne.textContent = "+";
    insertOne.title = "In Premiere / AE einf\xFCgen";
    on(insertOne, "click", (event) => {
      event.stopPropagation?.();
      void runInsert([hit.id]);
    });
    actions.append(open, insertOne);
    body.append(title, meta, snippet, actions);
    row.append(media, body);
    on(row, "click", (event) => {
      const target = event.target;
      if (target === check || target === open || target === insertOne || target && open.contains?.(target) || target && insertOne.contains?.(target)) {
        return;
      }
      check.checked = !check.checked;
      if (check.checked) selected.add(hit.id);
      else selected.delete(hit.id);
      row.classList.toggle("selected", check.checked);
      updateSelectionChrome();
    });
    return row;
  }
  function applyPosterToCard(hitId, posterUrl) {
    if (!posterUrl) return;
    const card = findHitCard(hitId);
    if (!card) return;
    const img = card.querySelector("img.hit-card-thumb");
    if (!img) return;
    img.src = posterUrl;
    img.classList.remove("hit-ph");
  }
  function applyPreviewToCard(hitId, previewSrcOrList) {
    const candidates = Array.isArray(previewSrcOrList) ? previewSrcOrList.filter(Boolean) : previewSrcOrList ? [previewSrcOrList] : [];
    if (!candidates.length) return;
    const card = findHitCard(hitId);
    if (!card) return;
    const video = card.querySelector("video.hit-card-preview");
    const img = card.querySelector("img.hit-card-thumb");
    if (!video) return;
    let attempt = 0;
    let settled = false;
    const hideVideo = () => {
      video.style.display = "none";
      video.classList.remove("is-visible");
      if (img) img.classList.remove("hit-thumb-under");
    };
    const startPlayback = () => {
      if (settled) return;
      settled = true;
      video.style.display = "block";
      video.classList.add("is-visible");
      if (img) img.classList.add("hit-thumb-under");
      try {
        void video.play?.();
      } catch (error) {
        console.warn("[VIDEON] video.play threw", hitId, error);
        settled = false;
        tryNext();
      }
    };
    const tryNext = () => {
      if (attempt >= candidates.length) {
        hideVideo();
        console.warn("[VIDEON] video: all src candidates failed", hitId, candidates);
        return;
      }
      const src = candidates[attempt];
      attempt += 1;
      settled = false;
      console.info("[VIDEON] video try src", hitId, src);
      try {
        video.pause?.();
      } catch {
      }
      video.src = src;
      try {
        video.load?.();
      } catch {
      }
      setTimeout(() => {
        if (!settled && video.readyState >= 2) startPlayback();
      }, 450);
    };
    video.onerror = () => {
      console.warn(
        "[VIDEON] video error",
        hitId,
        video.error?.message || video.error,
        "src=",
        video.src
      );
      if (settled) {
        hideVideo();
        return;
      }
      tryNext();
    };
    video.onloadeddata = () => startPlayback();
    video.oncanplay = () => startPlayback();
    tryNext();
  }
  async function loadPreviewForHit(settings, hit, signal) {
    const key = previewCacheKey(hit);
    try {
      const cached = await readCachedPreviewBlob(key);
      if (cached) {
        const materialized2 = await materializePreview({
          cacheKey: key,
          blob: cached,
          filename: "preview.mp4"
        });
        if (materialized2?.url) {
          if (materialized2.via === "blob") blobUrls.push(materialized2.url);
          return materialized2;
        }
      }
    } catch {
    }
    const blob = await fetchPreviewBlob(settings, hit, signal);
    if (!blob) return null;
    const materialized = await materializePreview({
      cacheKey: key,
      blob,
      filename: "preview.mp4"
    });
    if (materialized?.via === "blob" && materialized.url) blobUrls.push(materialized.url);
    return materialized;
  }
  async function renderHits(settings, signal) {
    revokeBlobs();
    els.resultsCount.textContent = String(hits.length);
    if (!hits.length) {
      els.resultsList.innerHTML = '<p class="empty">Keine Treffer.</p>';
      updateSelectionChrome();
      return;
    }
    els.resultsList.innerHTML = "";
    const fragment = document.createDocumentFragment?.() || null;
    const nodes = hits.map((hit) => buildHitRow(settings, hit, null));
    if (fragment) {
      for (const node of nodes) fragment.append(node);
      els.resultsList.append(fragment);
    } else {
      for (const node of nodes) els.resultsList.append(node);
    }
    updateSelectionChrome();
    void Promise.all(
      hits.map(async (hit) => {
        if (signal?.aborted) return;
        try {
          const blob = await loadPosterForHit(settings, hit, signal);
          if (!blob || signal?.aborted) return;
          const url = URL.createObjectURL(blob);
          blobUrls.push(url);
          applyPosterToCard(hit.id, url);
        } catch {
        }
      })
    );
    void mapPool(hits, PREVIEW_CONCURRENCY, async (hit) => {
      if (signal?.aborted) return;
      try {
        const materialized = await loadPreviewForHit(settings, hit, signal);
        if (!materialized?.url || signal?.aborted) return;
        applyPreviewToCard(hit.id, materialized.urls?.length ? materialized.urls : materialized.url);
      } catch (error) {
        console.warn("[VIDEON] preview load failed", hit.id, error);
      }
    });
  }
  async function runSearch() {
    const settings = saveSettings(readFormSettings());
    const q = els.searchInput.value.trim();
    if (!q) {
      showBanner("Suchbegriff eingeben.", "error");
      return;
    }
    if (!settings.apiToken) {
      showBanner("API Token in den Einstellungen setzen.", "error");
      els.settingsPanel.classList.remove("hidden");
      return;
    }
    if (!looksLikeApiToken(settings.apiToken)) {
      showBanner("Token sieht ung\xFCltig aus (erwartet videon_\u2026).", "error");
    }
    searchAbort?.abort();
    searchAbort = new AbortController();
    const { signal } = searchAbort;
    showBanner("Suche\u2026");
    selected.clear();
    setBusy(true);
    saveLastQuery(q);
    try {
      const payload = await searchMedia(settings, q, 40, signal);
      hits = dedupeSearchHits(
        (payload.items || []).map(normalizeSearchHit).filter((h) => h.mediaAssetId)
      );
      await renderHits(settings, signal);
      const scope = payload.scope ? ` \xB7 ${payload.scope}` : "";
      showBanner(
        hits.length ? `${hits.length} Treffer${scope}` : "Keine Treffer",
        hits.length ? "ok" : ""
      );
    } catch (error) {
      if (error?.name === "AbortError") return;
      hits = [];
      await renderHits(settings, signal);
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }
  async function runDryDownload() {
    const settings = saveSettings(readFormSettings());
    const chosen = hits.filter((h) => selected.has(h.id));
    if (!chosen.length) return;
    els.progress.classList.remove("hidden");
    els.progressBar.style.width = "0%";
    setBusy(true);
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        const hit = chosen[i];
        showBanner(`Download-Check ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const download = await requestAdobeDownload(settings, hit);
        if (!download?.downloadUrl || !download?.cacheKey) {
          throw new Error("Download-Response unvollst\xE4ndig");
        }
        try {
          await materializeDownload({
            cacheKey: download.cacheKey,
            downloadUrl: download.downloadUrl,
            filename: download.filename
          });
          showBanner(`Download + Cache OK: ${download.filename}`, "ok");
          void refreshCacheUi(false);
        } catch (cacheError) {
          console.warn("[VIDEON] cache optional for dry-run", cacheError);
          showBanner(
            `Download OK (${download.kind}, ${download.bytes || "?"} B) \u2014 Cache: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
            "ok"
          );
        }
        els.progressBar.style.width = `${Math.round((i + 1) / chosen.length * 100)}%`;
      }
    } catch (error) {
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add("hidden"), 800);
    }
  }
  async function runInsert(hitIds) {
    const settings = saveSettings(readFormSettings());
    const idSet = hitIds?.length ? new Set(hitIds) : selected;
    const chosen = hits.filter((h) => idSet.has(h.id));
    if (!chosen.length) return;
    els.progress.classList.remove("hidden");
    els.progressBar.style.width = "0%";
    setBusy(true);
    const notes = [];
    const ae = isAfterEffectsHost(hostInfo);
    if (ae) aeCursorSec = 0;
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        const hit = chosen[i];
        showBanner(`Lade ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const download = await requestAdobeDownload(settings, hit);
        const filePath = await materializeDownload({
          cacheKey: download.cacheKey,
          downloadUrl: download.downloadUrl,
          filename: download.filename
        });
        showBanner(`Import ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const result = ae ? await insertHitIntoAfterEffects({
          filePath,
          compName: settings.compName,
          hit,
          sequential: settings.aeSequential !== false,
          gapFrames: settings.aeGapFrames,
          startAtSec: aeCursorSec,
          allowPlan: hostInfo.source === "preview"
        }) : await insertHitIntoPremiere({
          filePath,
          binName: settings.binName,
          hit,
          appendToSequence: els.appendSequence?.checked
        });
        if (!result.ok) throw new Error(result.message);
        if (ae && result.plan && settings.aeSequential !== false) {
          const duration = result.plan.durationSec != null ? result.plan.durationSec : Math.max(0, ((hit.endMs ?? 0) - (hit.startMs ?? 0)) / 1e3) || 1;
          const gapSec = (Number(settings.aeGapFrames) || 0) / 25;
          aeCursorSec = result.plan.compTimeSec + duration + gapSec;
        }
        notes.push(result.message);
        els.progressBar.style.width = `${Math.round((i + 1) / chosen.length * 100)}%`;
      }
      void refreshCacheUi(false);
      showBanner(notes[notes.length - 1] || `${chosen.length} Clip(s) verarbeitet.`, "ok");
    } catch (error) {
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add("hidden"), 800);
    }
  }
  function on(el, eventName, handler) {
    if (!el) return;
    const wrapped = (event) => {
      try {
        handler(event);
      } catch (error) {
        console.error("[VIDEON] handler", eventName, error);
        showBanner(error instanceof Error ? error.message : String(error), "error");
      }
    };
    const key = `on${eventName}`;
    try {
      el[key] = wrapped;
      return;
    } catch (assignError) {
      console.warn("[VIDEON] on* assign failed", eventName, assignError);
    }
    try {
      if (typeof el.addEventListener === "function") {
        el.addEventListener(eventName, wrapped);
      }
    } catch (listenError) {
      console.error("[VIDEON] addEventListener failed", eventName, listenError);
      showBanner(
        `Event-Bind fehlgeschlagen (${eventName}): ${listenError instanceof Error ? listenError.message : String(listenError)}`,
        "error"
      );
    }
  }
  function runTestConnection() {
    void (async () => {
      const settings = saveSettings(readFormSettings());
      if (els.settingsStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = `Teste\u2026 (v${PANEL_VERSION})`;
      }
      try {
        if (!settings.apiToken) {
          throw new Error("Kein API Token \u2014 in Settings einf\xFCgen (videon_\u2026)");
        }
        if (!looksLikeApiToken(settings.apiToken)) {
          throw new Error("Token-Format pr\xFCfen: videon_ + 64 Hex-Zeichen");
        }
        const ok = await testHealth(settings);
        if (!ok) {
          if (els.settingsStatus) {
            els.settingsStatus.textContent = `Health fehlgeschlagen (v${PANEL_VERSION})`;
          }
          return;
        }
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `Health OK \u2014 Token verify\u2026 (v${PANEL_VERSION})`;
        }
        const verified = await verifyApiToken(settings);
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `Token OK \xB7 owner ${verified.ownerId} (v${PANEL_VERSION})`;
        }
        await refreshCollections(true);
      } catch (error) {
        const msg = authErrorHint(error instanceof Error ? error.message : String(error));
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `${msg} (v${PANEL_VERSION})`;
        }
        showBanner(msg, "error");
      }
    })();
  }
  function bindPanel() {
    on(els.modeScenesBtn, "click", () => setPanelMode("scenes"));
    on(els.modeCutsBtn, "click", () => setPanelMode("cuts"));
    on(els.cutsRefreshBtn, "click", () => {
      void refreshCutsList();
    });
    on(els.pushbackApplyBtn, "click", () => {
      void confirmPushback(false);
    });
    on(els.pushbackRefreshBtn, "click", () => {
      void confirmPushback(true);
    });
    on(els.pushbackCancelBtn, "click", () => {
      hidePushbackConfirm();
      showCutsBanner("Pushback abgebrochen.");
    });
    on(els.settingsToggle, "click", () => {
      els.settingsPanel?.classList.toggle("hidden");
      if (els.settingsPanel && !els.settingsPanel.classList.contains("hidden")) void refreshCacheUi(false);
    });
    on(els.settingsSave, "click", () => {
      const draft = readFormSettings();
      const urlCheck = normalizeProductBaseUrl(draft.productBaseUrl);
      if (!urlCheck.ok) {
        if (els.settingsStatus) {
          els.settingsStatus.hidden = false;
          els.settingsStatus.textContent = urlCheck.error;
        }
        return;
      }
      const settings = saveSettings({ ...draft, productBaseUrl: urlCheck.value });
      applySettingsToForm(settings);
      if (els.settingsStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = looksLikeApiToken(settings.apiToken) ? "Gespeichert." : "Gespeichert \u2014 Token-Format pr\xFCfen (videon_\u2026).";
      }
    });
    on(els.testConnection, "click", () => {
      runTestConnection();
    });
    on(els.reloadCollections, "click", () => {
      void refreshCollections(true);
    });
    on(els.cacheRefresh, "click", () => {
      void refreshCacheUi(true);
    });
    on(els.cacheClear, "click", () => {
      void (async () => {
        if (els.settingsStatus) {
          els.settingsStatus.hidden = false;
          els.settingsStatus.textContent = "Cache wird geleert\u2026";
        }
        try {
          const result = await clearCache();
          const openCut = await clearOpenCutCache().catch(() => ({ deleted: 0 }));
          updateCacheStatsLabel({ count: 0, bytes: 0 });
          if (els.settingsStatus) {
            els.settingsStatus.textContent = `Cache geleert (${result.deleted} Media + ${openCut.deleted || 0} Open-Cut)`;
          }
        } catch (error) {
          if (els.settingsStatus) {
            els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
          }
        }
      })();
    });
    on(els.collectionSelect, "change", onCollectionChange);
    on(els.collectionSelectMain, "change", onCollectionChange);
    on(els.selectAllBtn, "click", () => {
      for (const hit of hits) selected.add(hit.id);
      for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
        input.checked = true;
      }
      for (const card of els.resultsList?.querySelectorAll(".hit-card") || []) {
        card.classList.add("selected");
      }
      updateSelectionChrome();
    });
    on(els.selectNoneBtn, "click", () => {
      selected.clear();
      for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
        input.checked = false;
      }
      for (const card of els.resultsList?.querySelectorAll(".hit-card") || []) {
        card.classList.remove("selected");
      }
      updateSelectionChrome();
    });
    on(els.searchBtn, "click", () => {
      void runSearch();
    });
    on(els.searchInput, "keydown", (event) => {
      if (event.key === "Enter") void runSearch();
    });
    on(els.dryRunBtn, "click", () => {
      void runDryDownload();
    });
    on(els.insertBtn, "click", () => {
      void runInsert();
    });
  }
  function bootPanel() {
    els = queryEls();
    if (els.panelVersion) els.panelVersion.textContent = `v${PANEL_VERSION}`;
    const missing = missingRequiredEls();
    if (missing.length) {
      const msg = `Panel-DOM unvollst\xE4ndig (${missing.join(", ")}). Bundle neu bauen / Plugin neu laden.`;
      console.error("[VIDEON]", msg);
      if (els.bootStatus) {
        els.bootStatus.hidden = false;
        els.bootStatus.textContent = msg;
      }
      return false;
    }
    try {
      bindPanel();
    } catch (error) {
      const msg = `Boot-Bind fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      console.error("[VIDEON]", msg, error);
      if (els.bootStatus) {
        els.bootStatus.hidden = false;
        els.bootStatus.textContent = msg;
      }
      return false;
    }
    applySettingsToForm(loadSettings());
    if (els.searchInput) els.searchInput.value = loadLastQuery();
    updateCacheStatsLabel(getCacheStats());
    void refreshCacheUi(false);
    void detectHostApp().then((info) => {
      hostInfo = info;
      applyHostChrome();
    });
    if (loadSettings().apiToken) {
      void refreshCollections(false);
    }
    if (els.bootStatus) {
      els.bootStatus.hidden = false;
      els.bootStatus.textContent = `Bereit \xB7 v${PANEL_VERSION}`;
      setTimeout(() => {
        if (els.bootStatus && els.bootStatus.textContent === `Bereit \xB7 v${PANEL_VERSION}`) {
          els.bootStatus.hidden = true;
          els.bootStatus.textContent = "";
        }
      }, 2500);
    }
    return true;
  }
  function scheduleBoot(attempt = 0) {
    try {
      if (bootPanel()) return;
    } catch (error) {
      console.error("[VIDEON] bootPanel threw", error);
      const boot = document.getElementById("boot-status");
      if (boot) {
        boot.hidden = false;
        boot.textContent = `Boot-Crash: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (attempt >= 40) {
      console.error("[VIDEON] Panel boot failed after retries");
      const boot = document.getElementById("boot-status");
      if (boot) {
        boot.hidden = false;
        boot.textContent = `Boot fehlgeschlagen nach Retries \xB7 v${PANEL_VERSION}`;
      }
      return;
    }
    setTimeout(() => scheduleBoot(attempt + 1), 50);
  }
  scheduleBoot();
})();
