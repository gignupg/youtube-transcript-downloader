const statusEl = document.getElementById("status");
const dialog = document.getElementById("dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogMessage = document.getElementById("dialog-message");
const actions = document.getElementById("actions");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");

let transcriptText = "";

function showDialog(title, message) {
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  dialog.showModal();
}

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(transcriptText);
  statusEl.textContent = "Transcript copied to clipboard.";
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([transcriptText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `youtube-transcript-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

async function fetchTranscript(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const waitFor = async (fn, timeout = 8000) => {
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

      const toSeconds = (value) => {
        const parts = value.split(":").map(Number);
        return parts.reverse().reduce((total, part, index) => total + part * 60 ** index, 0);
      };

      const ordered = [...segments.values()].sort((a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp));
      if (!ordered.length) {
        return { ok: false, message: "Transcript opened, but no segments were found." };
      }

      const lines = [];
      let currentSection = null;
      ordered.forEach((segment) => {
        if (segment.section && segment.section !== currentSection) {
          currentSection = segment.section;
          lines.push("", `## ${currentSection}`);
        }
        lines.push(`[${segment.timestamp}] ${segment.text}`);
      });

      return {
        ok: true,
        count: ordered.length,
        text: lines.join("\n").trim() + "\n",
      };
    },
  });

  return results?.[0]?.result ?? { ok: false, message: "Could not run on this page." };
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    statusEl.textContent = "No active tab.";
    showDialog("Error", "No active tab found.");
    return;
  }

  if (!/^https:\/\/(www\.)?youtube\.com\/watch/.test(tab.url ?? "")) {
    statusEl.textContent = "Open a YouTube video first.";
    showDialog("Not a video", "Open a YouTube video page and try again.");
    return;
  }

  let result = { ok: false, message: "Unknown error." };
  try {
    result = await fetchTranscript(tab.id);
  } catch (error) {
    result = { ok: false, message: String(error?.message ?? error) };
  }

  if (!result.ok) {
    statusEl.textContent = "Could not get transcript.";
    showDialog("Something went wrong", result.message);
    return;
  }

  transcriptText = result.text;
  actions.hidden = false;
  statusEl.textContent = "Transcript ready.";
  showDialog("Transcript ready", `${result.count} segments (${result.text.length} characters) grabbed from the page.`);
}

document.addEventListener("DOMContentLoaded", main);
