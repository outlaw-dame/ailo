import assert from "node:assert/strict";
import test from "node:test";
import { mediaFormatLabel, mediaMimeType, supportedMediaKind } from "../lib/media-attachments.js";

test("maps all supported Mastodon media types", () => {
  assert.equal(supportedMediaKind("image"), "image");
  assert.equal(supportedMediaKind("gifv"), "gif");
  assert.equal(supportedMediaKind("video"), "video");
  assert.equal(supportedMediaKind("audio"), "audio");
  assert.equal(supportedMediaKind("unknown"), null);
});

test("recognizes WebM, open Matroska/Ogg video, and WebP attachments", () => {
  assert.equal(mediaMimeType("video/webm; codecs=vp9,opus", "https://example.test/video"), "video/webm");
  assert.equal(mediaMimeType(null, "https://example.test/video.mkv?download=1"), "video/x-matroska");
  assert.equal(mediaMimeType(null, "https://example.test/clip.ogv"), "video/ogg");
  assert.equal(mediaMimeType(null, "https://example.test/photo.webp"), "image/webp");
  assert.equal(mediaFormatLabel("video/webm"), "WebM");
});

test("does not trust unsupported or non-URL media claims", () => {
  assert.equal(mediaMimeType("text/html", "javascript:alert(1)"), null);
});
