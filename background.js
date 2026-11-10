function flash(text) {
  return chrome.action.setBadgeText({ text }).then(() => {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
  });
}

function safeFileName(title, channel) {
  const clean = (value) =>
    (value ?? "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parts = [clean(title)];
  if (clean(channel)) parts.push(clean(channel));

  let name = parts.join(" - ").slice(0, 150).trim();
  return name || "youtube-transcript";
}

async function grabTranscript() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (fn, timeout = 10000) => {
    const start = Date.now();
    let value = fn();
    while (!value && Date.now() - start < timeout) {
      await sleep(100);
      value = fn();
    }
    return value;
  };

  const expander = document.querySelector("ytd-text-inline-expander");
  const moreButton = expander?.querySelector("#expand") ?? document.querySelector("#expand");
  if (moreButton && !moreButton.hidden) {
    moreButton.scrollIntoView({ block: "center" });
    moreButton.click();
  }

  const transcriptButton = await waitFor(() =>
    document.querySelector(
      'ytd-video-description-transcript-section-renderer #primary-button button, button[aria-label="Show transcript"]'
    )
  );
  if (!transcriptButton) {
    return { ok: false, message: "Could not find the 'Show transcript' button." };
  }

  transcriptButton.scrollIntoView({ block: "center" });
  await sleep(100);
  transcriptButton.click();

  const container = await waitFor(
    () => document.querySelector("ytd-transcript-segment-list-renderer #segments-container"),
    10000
  );
  if (!container) {
    return { ok: false, message: "Transcript panel did not open." };
  }

  let scroller = null;
  let node = container;
  while (node && node !== document.body) {
    const overflow = getComputedStyle(node).overflowY;
    if (node.scrollHeight > node.clientHeight + 20 && /auto|scroll/.test(overflow)) {
      scroller = node;
      break;
    }
    node = node.parentElement;
  }

  const segments = new Map();
  const harvest = () => {
    container.querySelectorAll("ytd-transcript-segment-renderer").forEach((segment) => {
      const timestamp = segment.querySelector(".segment-timestamp")?.textContent.trim();
      const text = segment.querySelector(".segment-text")?.textContent.trim();
      if (!timestamp || !text) return;

      let previous = segment.previousElementSibling;
      let section = "";
      while (previous) {
        if (previous.tagName.toLowerCase() === "ytd-transcript-section-header-renderer") {
          section = previous.querySelector("#header")?.getAttribute("aria-label") ?? "";
          break;
        }
        previous = previous.previousElementSibling;
      }

      segments.set(`${timestamp}|${text}`, { timestamp, text, section });
    });
  };

  if (scroller) {
    let position = 0;
    while (position <= scroller.scrollHeight) {
      scroller.scrollTop = position;
      await sleep(120);
      harvest();
      position += Math.max(200, Math.floor(scroller.clientHeight * 0.8));
      if (position > scroller.scrollHeight + 4000) break;
    }
  } else {
    container.querySelectorAll("ytd-transcript-segment-renderer").forEach((segment) => {
      segment.scrollIntoView({ block: "nearest" });
    });
    await sleep(300);
  }
  harvest();

  if (!segments.size) {
    return { ok: false, message: "Transcript opened, but no segments were found." };
  }

  const toSeconds = (value) =>
    value
      .split(":")
      .map(Number)
      .reverse()
      .reduce((total, part, index) => total + part * 60 ** index, 0);

  const ordered = [...segments.values()].sort(
    (a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp)
  );

  const lines = [];
  let currentSection = null;
  ordered.forEach((segment) => {
    if (segment.section && segment.section !== currentSection) {
      currentSection = segment.section;
      lines.push("", `## ${currentSection}`);
    }
    lines.push(`[${segment.timestamp}] ${segment.text}`);
  });

  const title = document
    .querySelector("ytd-watch-metadata #title h1 yt-formatted-string")
    ?.getAttribute("title");

  const channel = document
    .querySelector("ytd-video-owner-renderer ytd-channel-name #text")
    ?.getAttribute("title");

  return {
    ok: true,
    count: ordered.length,
    title,
    channel,
    text: lines.join("\n").trim() + "\n",
  };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  if (!/^https:\/\/(www\.)?youtube\.com\/watch/.test(tab.url ?? "")) {
    await flash("!");
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: grabTranscript,
    });

    const payload = results?.[0]?.result;
    if (!payload?.ok) throw new Error(payload?.message ?? "Unknown error");

    const url = `data:text/plain;charset=utf-8,${encodeURIComponent(payload.text)}`;
    const filename = `YouTube Transcripts/${safeFileName(payload.title, payload.channel)}.txt`;

    await chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
    await flash("ok");
  } catch (error) {
    console.error("Transcript download failed:", error);
    await flash("!");
  }
});
