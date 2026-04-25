const PANEL_ID = "ytn-notes-panel";
const TRIGGER_ID = "ytn-notes-trigger";

let currentVideoId = null;
let currentAnalysis = null;

boot();

function boot() {
  installTrigger();
  observeNavigation();
  refreshForRoute();
}

function observeNavigation() {
  let lastHref = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      refreshForRoute();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function refreshForRoute() {
  if (!isWatchPage()) {
    removePanel();
    hideTrigger();
    return;
  }

  currentVideoId = getVideoId();
  currentAnalysis = null;
  showTrigger();
  updateTriggerLabel("Generate Notes");
  renderPanelSkeleton();
}

function installTrigger() {
  if (document.getElementById(TRIGGER_ID)) {
    return;
  }

  const button = document.createElement("button");
  button.id = TRIGGER_ID;
  button.className = "ytn-trigger";
  button.textContent = "Generate Notes";
  button.addEventListener("click", handleGenerateClick);
  document.body.appendChild(button);
}

async function handleGenerateClick() {
  updateTriggerLabel("Analyzing...");

  try {
    const payload = await collectVideoContext();
    const response = await chrome.runtime.sendMessage({
      type: "ytn:analyze-video",
      payload
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Analysis failed.");
    }

    currentAnalysis = response.result;
    renderAnalysis(currentAnalysis, payload);
    updateTriggerLabel("Refresh Notes");
  } catch (error) {
    renderError(error.message);
    updateTriggerLabel("Try Again");
  }
}

async function collectVideoContext() {
  const transcript = await extractTranscript();
  const title = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim();
  const channel = document.querySelector("#channel-name a")?.textContent?.trim();
  const durationText = document.querySelector(".ytp-time-duration")?.textContent?.trim();

  return {
    title,
    channel,
    durationText,
    videoId: getVideoId(),
    transcript: transcript.text,
    transcriptSegments: transcript.segments,
    chapters: extractChapters()
  };
}

async function extractTranscript() {
  const playerData = await getPlayerResponse();
  const rawTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  if (!rawTracks.length) {
    throw new Error("This video does not expose transcript captions.");
  }

  const preferredTrack = rawTracks.find((track) => track.languageCode?.startsWith("en")) || rawTracks[0];
  const transcriptUrl = `${preferredTrack.baseUrl}&fmt=json3`;
  const response = await fetch(transcriptUrl);

  if (!response.ok) {
    throw new Error("Unable to load the YouTube transcript.");
  }

  const data = await response.json();
  const segments = (data.events || [])
    .filter((event) => Array.isArray(event.segs))
    .map((event) => {
      const text = event.segs.map((seg) => seg.utf8).join("").replace(/\s+/g, " ").trim();
      const startMs = event.tStartMs || 0;
      return {
        startMs,
        label: formatTime(startMs / 1000),
        text
      };
    })
    .filter((segment) => segment.text);

  if (!segments.length) {
    throw new Error("The transcript was empty.");
  }

  return {
    text: segments.map((segment) => `[${segment.label}] ${segment.text}`).join("\n"),
    segments
  };
}

async function getPlayerResponse() {
  const directPlayerData = window.ytInitialPlayerResponse || window.ytplayer?.config?.args?.player_response;
  const parsedDirectData = safelyParseJson(directPlayerData);
  if (parsedDirectData) {
    return parsedDirectData;
  }

  const scripts = Array.from(document.scripts);
  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (match?.[1]) {
      const parsed = safelyParseJson(match[1]);
      if (parsed) {
        return parsed;
      }
    }
  }

  const htmlResponse = await fetch(location.href, { credentials: "include" });
  if (htmlResponse.ok) {
    const html = await htmlResponse.text();
    const htmlMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (htmlMatch?.[1]) {
      const parsed = safelyParseJson(htmlMatch[1]);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function safelyParseJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractChapters() {
  const chapterLinks = Array.from(document.querySelectorAll("ytd-macro-markers-list-item-renderer a, a.ytd-macro-markers-list-item-renderer"));
  const chapters = chapterLinks
    .map((link) => {
      const timeLabel = link.querySelector("#time")?.textContent?.trim() || link.textContent?.match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0];
      const title = link.querySelector("#title")?.textContent?.trim() || link.getAttribute("title") || "Untitled chapter";
      if (!timeLabel) {
        return null;
      }
      return { timeLabel, title };
    })
    .filter(Boolean);

  return dedupeChapters(chapters);
}

function dedupeChapters(chapters) {
  const seen = new Set();
  return chapters.filter((chapter) => {
    const key = `${chapter.timeLabel}-${chapter.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function renderPanelSkeleton() {
  const panel = ensurePanel();
  panel.innerHTML = `
    <div class="ytn-panel-header">
      <div>
        <p class="ytn-kicker">YouTube to Notes</p>
        <h2>Notion-style AI workspace</h2>
      </div>
      <button class="ytn-close" data-close-panel="true">Close</button>
    </div>
    <div class="ytn-empty">
      <p>Open the panel and generate a structured note page for this video.</p>
      <p class="ytn-muted">The extension will use the transcript, video metadata, and chapters when available.</p>
    </div>
  `;
  wirePanelActions(panel);
}

function renderError(message) {
  const panel = ensurePanel();
  panel.innerHTML = `
    <div class="ytn-panel-header">
      <div>
        <p class="ytn-kicker">Analysis Error</p>
        <h2>We hit a blocker</h2>
      </div>
      <button class="ytn-close" data-close-panel="true">Close</button>
    </div>
    <div class="ytn-error-card">
      <strong>${escapeHtml(message)}</strong>
      <p>Check the extension options, confirm captions exist, and try again.</p>
    </div>
  `;
  wirePanelActions(panel);
  panel.classList.add("is-open");
}

function renderAnalysis(analysis, payload) {
  const panel = ensurePanel();
  const chapterMarkup = (analysis.chapters || []).map(renderChapterCard).join("");
  const takeawayMarkup = (analysis.keyTakeaways || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const glossaryMarkup = (analysis.glossary || [])
    .map((item) => `<div class="ytn-glossary-item"><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.meaning)}</p></div>`)
    .join("");
  const actionMarkup = (analysis.actionItems || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  panel.innerHTML = `
    <div class="ytn-panel-header">
      <div>
        <p class="ytn-kicker">AI Study Page</p>
        <h2>${escapeHtml(analysis.title || payload.title || "Untitled video")}</h2>
        <p class="ytn-meta">${escapeHtml(payload.channel || "Unknown channel")} | ${escapeHtml(payload.durationText || "")}</p>
      </div>
      <div class="ytn-actions">
        <button data-copy="markdown">Copy Markdown</button>
        <button data-copy="json">Copy JSON</button>
        <button class="ytn-close" data-close-panel="true">Close</button>
      </div>
    </div>
    <section class="ytn-summary-card">
      <p class="ytn-kicker">Summary</p>
      <p>${escapeHtml(analysis.summary || "")}</p>
    </section>
    <section class="ytn-block-grid">
      <article class="ytn-card">
        <h3>Key Takeaways</h3>
        <ul>${takeawayMarkup}</ul>
      </article>
      <article class="ytn-card">
        <h3>Action Items</h3>
        <ul>${actionMarkup}</ul>
      </article>
    </section>
    <section class="ytn-chapters">
      <div class="ytn-section-title">
        <p class="ytn-kicker">Chapter Notes</p>
        <h3>Visualized breakdown</h3>
      </div>
      ${chapterMarkup}
    </section>
    <section class="ytn-card">
      <h3>Glossary</h3>
      <div class="ytn-glossary">${glossaryMarkup}</div>
    </section>
    <section class="ytn-card">
      <h3>Notion Markdown</h3>
      <pre class="ytn-markdown">${escapeHtml(analysis.notionMarkdown || "")}</pre>
    </section>
  `;

  wirePanelActions(panel, analysis);
  panel.classList.add("is-open");
}

function renderChapterCard(chapter, index) {
  const notes = (chapter.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const questions = (chapter.questions || []).map((question) => `<li>${escapeHtml(question)}</li>`).join("");
  const visualizationItems = (chapter.visualization?.items || [])
    .map((item) => `<div class="ytn-viz-item"><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p></div>`)
    .join("");

  return `
    <article class="ytn-chapter-card">
      <div class="ytn-chapter-head">
        <p class="ytn-kicker">Part ${index + 1}${chapter.startLabel ? ` | ${escapeHtml(chapter.startLabel)}` : ""}</p>
        <h4>${escapeHtml(chapter.title || `Chapter ${index + 1}`)}</h4>
      </div>
      <p class="ytn-chapter-summary">${escapeHtml(chapter.summary || "")}</p>
      <div class="ytn-block-grid">
        <div class="ytn-card">
          <h5>Notes</h5>
          <ul>${notes}</ul>
        </div>
        <div class="ytn-card ytn-visual-card">
          <p class="ytn-kicker">${escapeHtml(chapter.visualization?.type || "visual")}</p>
          <h5>${escapeHtml(chapter.visualization?.title || "Visual explanation")}</h5>
          <div class="ytn-viz-list">${visualizationItems}</div>
        </div>
      </div>
      <blockquote>${escapeHtml(chapter.quote || "")}</blockquote>
      <div class="ytn-card">
        <h5>Reflection Questions</h5>
        <ul>${questions}</ul>
      </div>
    </article>
  `;
}

function wirePanelActions(panel, analysis) {
  panel.querySelectorAll("[data-close-panel]").forEach((button) => {
    button.addEventListener("click", () => panel.classList.remove("is-open"));
  });

  panel.querySelector('[data-copy="markdown"]')?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(analysis?.notionMarkdown || "");
  });

  panel.querySelector('[data-copy="json"]')?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
  });
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.className = "ytn-panel";
    document.body.appendChild(panel);
  }
  return panel;
}

function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
}

function hideTrigger() {
  document.getElementById(TRIGGER_ID)?.classList.add("is-hidden");
}

function showTrigger() {
  document.getElementById(TRIGGER_ID)?.classList.remove("is-hidden");
}

function updateTriggerLabel(text) {
  const button = document.getElementById(TRIGGER_ID);
  if (button) {
    button.textContent = text;
  }
}

function isWatchPage() {
  return location.pathname === "/watch" && Boolean(getVideoId());
}

function getVideoId() {
  return new URL(location.href).searchParams.get("v");
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
