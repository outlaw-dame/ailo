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
        "[&_h1]:text-heading1 [&_h1]:font-normal [&_h1]:mb-3 [&_h1]:mt-6",
        "[&_h2]:text-heading2 [&_h2]:font-normal [&_h2]:mb-2 [&_h2]:mt-5",
        "[&_h3]:text-large-strong [&_h3]:mb-2 [&_h3]:mt-4",
        "[&_p]:text-regular [&_p]:leading-relaxed [&_p]:mb-3",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3",
        "[&_li]:mb-1",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-separator [&_blockquote]:pl-3 [&_blockquote]:text-secondary [&_blockquote]:my-3",
        "[&_code]:text-small-mono [&_code]:bg-control-subtle [&_code]:px-1 [&_code]:rounded-sm",
        "[&_pre]:bg-well [&_pre]:rounded-control [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_img]:max-w-full [&_img]:rounded-control [&_img]:my-3",
        "[&_hr]:border-separator [&_hr]:my-6",
        className ?? "",
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
