const statusEl = document.getElementById("status");
const dialog = document.getElementById("dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogMessage = document.getElementById("dialog-message");

function showDialog(title, message) {
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  dialog.showModal();
}

async function expandDescription(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const expander = document.querySelector("ytd-text-inline-expander");
      const button = expander?.querySelector("#expand") ?? document.querySelector("#expand");

      if (!button || button.hidden || button.getAttribute("aria-disabled") === "true") {
        return { ok: false, message: "No 'more' button found on this page." };
      }

      button.scrollIntoView({ block: "center" });
      button.click();

      const collapsedAfterClick = expander?.hasAttribute("collapsed") ?? false;
      return {
        ok: !collapsedAfterClick,
        message: collapsedAfterClick
          ? "Clicked 'more', but the description is still collapsed."
          : "Clicked 'more' — description expanded.",
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
    result = await expandDescription(tab.id);
  } catch (error) {
    result = { ok: false, message: String(error?.message ?? error) };
  }

  statusEl.textContent = result.ok ? "Description expanded." : "Could not expand description.";
  showDialog(result.ok ? "Hello world" : "Something went wrong", result.message);
}

document.addEventListener("DOMContentLoaded", main);
