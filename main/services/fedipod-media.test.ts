import assert from "node:assert/strict";
import test from "node:test";

import { mapMediaAttachment } from "./fedipod-media.js";

test("maps FediPod media MIME metadata for WebM playback and WebP posters", () => {
  const attachment = mapMediaAttachment({
      id: "m1",
      type: "video",
      url: "https://media.example/clip.webm",
      preview_url: "https://media.example/poster.webp",
      mime_type: "video/webm",
  });
  assert.equal(attachment.mimeType, "video/webm");
  assert.equal(attachment.previewUrl, "https://media.example/poster.webp");
});

test("drops malformed media MIME claims", () => {
  const attachment = mapMediaAttachment({
    id: "m1", type: "video", url: "https://media.example/clip", mime_type: "text/html\nscript",
  });
  assert.equal(attachment.mimeType, null);
});
