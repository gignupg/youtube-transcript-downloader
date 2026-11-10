const statusEl = document.getElementById("status");
const dialog = document.getElementById("dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogMessage = document.getElementById("dialog-message");

function showDialog(title, message) {
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  dialog.showModal();
}

async function openTranscript(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const clickMore = () => {
        const expander = document.querySelector("ytd-text-inline-expander");
        const button = expander?.querySelector("#expand") ?? document.querySelector("#expand");
        if (!button || button.hidden) return false;
        button.scrollIntoView({ block: "center" });
        button.click();
        return true;
      };

      const findTranscriptButton = () =>
        document.querySelector(
          'ytd-video-description-transcript-section-renderer #primary-button button, button[aria-label="Show transcript"]'
        );

      clickMore();

      let button = findTranscriptButton();
      for (let i = 0; i < 30 && !button; i++) {
        await sleep(100);
        button = findTranscriptButton();
      }

      if (!button) {
        return { ok: false, message: "Could not find the 'Show transcript' button." };
      }

      button.scrollIntoView({ block: "center" });
      await sleep(100);
      button.click();

      return { ok: true, message: "Expanded description and clicked 'Show transcript'." };
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
    result = await openTranscript(tab.id);
  } catch (error) {
    result = { ok: false, message: String(error?.message ?? error) };
  }

  statusEl.textContent = result.ok ? "Transcript opened." : "Could not open transcript.";
  showDialog(result.ok ? "Hello world" : "Something went wrong", result.message);
}

document.addEventListener("DOMContentLoaded", main);
