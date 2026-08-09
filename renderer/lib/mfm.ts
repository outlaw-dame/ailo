import { parse, type MfmNode } from "mfm-js";

const EFFECTS = new Set(["tada", "jelly", "shake", "twitch", "rainbow", "flip", "x2", "x3", "x4"]);

function escape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function safeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function children(node: MfmNode): string {
  return "children" in node && Array.isArray(node.children) ? node.children.map(renderNode).join("") : "";
}

function renderNode(node: MfmNode): string {
  switch (node.type) {
    case "text":
      return escape(node.props.text).replace(/\n/g, "<br>");
    case "unicodeEmoji":
      return escape(node.props.emoji);
    case "emojiCode":
      return `:${escape(node.props.name)}:`;
    case "bold":
      return `<strong>${children(node)}</strong>`;
    case "small":
      return `<small>${children(node)}</small>`;
    case "italic":
      return `<em>${children(node)}</em>`;
    case "strike":
      return `<del>${children(node)}</del>`;
    case "inlineCode":
      return `<code>${escape(node.props.code)}</code>`;
    case "blockCode":
      return `<pre><code${node.props.lang ? ` data-language="${escape(node.props.lang)}"` : ""}>${escape(node.props.code)}</code></pre>`;
    case "quote":
      return `<blockquote>${children(node)}</blockquote>`;
    case "center":
      return `<div class="mfm-center">${children(node)}</div>`;
    case "mathInline":
      return `<code class="mfm-math">${escape(node.props.formula)}</code>`;
    case "mathBlock":
      return `<pre class="mfm-math"><code>${escape(node.props.formula)}</code></pre>`;
    case "mention":
      return `<span class="mfm-mention">@${escape(node.props.acct)}</span>`;
    case "hashtag":
      return `<span class="mfm-hashtag">#${escape(node.props.hashtag)}</span>`;
    case "url": {
      const url = safeUrl(node.props.url);
      return url ? `<a href="${escape(url)}" rel="nofollow noopener noreferrer">${escape(node.props.url)}</a>` : escape(node.props.url);
    }
    case "link": {
      const url = safeUrl(node.props.url);
      return url ? `<a href="${escape(url)}" rel="nofollow noopener noreferrer">${children(node)}</a>` : children(node);
    }
    case "fn":
      return EFFECTS.has(node.props.name)
        ? `<span class="mfm-fn mfm-${node.props.name}">${children(node)}</span>`
        : children(node);
    case "search":
      return `<span class="mfm-search">${escape(node.props.content)}</span>`;
    case "plain":
      return children(node);
  }
}

/** Render Misskey-flavoured Markdown through the official parser and a strict HTML projection. */
export function renderMfm(source: string): string {
  try {
    return parse(source ?? "", { nestLimit: 20 }).map(renderNode).join("");
  } catch {
    return escape(source).replace(/\n/g, "<br>");
  }
}
