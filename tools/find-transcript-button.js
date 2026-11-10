// Paste into the DevTools console of a YouTube video page, then press Enter.
// Puts any transcript-button candidates on the clipboard and returns them.

(() => {
  const out = [];

  const section = document.querySelector(
    "ytd-video-description-transcript-section-renderer"
  );
  if (section) {
    out.push("=== ytd-video-description-transcript-section-renderer ===\n" + section.outerHTML);
  } else {
    out.push("=== no ytd-video-description-transcript-section-renderer found ===");
  }

  const candidates = [...document.querySelectorAll("button, [role=button], a, ytd-button-renderer, tp-yt-paper-button")]
    .filter((el) => {
      const text = (el.textContent || "").trim();
      const label = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      return /transcript/i.test(text) || /transcript/i.test(label) || /transcript/i.test(title);
    });

  out.push(`=== ${candidates.length} text/aria matches ===`);
  candidates.forEach((el, i) => {
    const path = (() => {
      const parts = [];
      let node = el;
      while (node && node !== document.body && parts.length < 8) {
        let part = node.tagName.toLowerCase();
        if (node.id) part += `#${node.id}`;
        const cls = [...(node.classList || [])].slice(0, 3).join(".");
        if (cls) part += `.${cls}`;
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(" > ");
    })();
    out.push(`--- #${i} ${path} ---\n${el.outerHTML.slice(0, 1200)}`);
  });

  const result = out.join("\n\n");
  copy(result);
  console.log(result.slice(0, 4000));
  return "copied " + result.length + " chars";
})();
