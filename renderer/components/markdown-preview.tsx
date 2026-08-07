import * as React from "react";

import type { ImageAltText } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";

interface MarkdownPreviewProps {
  body: string;
  altTexts?: ImageAltText[];
  className?: string;
}

export function MarkdownPreview({ body, altTexts = [], className }: MarkdownPreviewProps) {
  const html = React.useMemo(() => renderMarkdown(body, altTexts), [body, altTexts]);

  return (
    <div
      className={[
        "knot-prose min-w-0 text-primary",
        "[&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-heading1 [&_h1]:font-normal [&_h1]:text-balance",
        "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-heading2 [&_h2]:font-normal [&_h2]:text-balance",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-large-strong",
        "[&_p]:mb-4 [&_p]:text-large [&_p]:leading-[1.7] [&_p]:text-pretty",
        "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:mb-1.5 [&_li]:text-large [&_li]:leading-[1.65]",
        "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:text-secondary [&_blockquote]:italic",
        "[&_code]:rounded-sm [&_code]:bg-control-subtle [&_code]:px-1 [&_code]:text-small-mono",
        "[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:bg-well [&_pre]:p-4",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-card",
        "[&_hr]:my-10 [&_hr]:border-separator",
        "[&_em]:text-secondary",
        className ?? "",
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
