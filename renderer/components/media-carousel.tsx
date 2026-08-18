import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@glaze/core/components";

import type { MastodonMediaAttachment } from "../lib/types";
import { mediaMimeType, supportedMediaKind } from "../lib/media-attachments";
import { VideoPlayer } from "./video-player";

function MediaItem({ attachment, onOpenExternal }: {
  attachment: MastodonMediaAttachment;
  onOpenExternal?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const kind = supportedMediaKind(attachment.type);
  const description = attachment.description?.trim() || "";
  if (kind === "image") {
    return <img src={attachment.url || attachment.previewUrl || ""} alt={description}
      title={description || undefined} className="max-h-[28rem] w-full object-contain" loading="lazy" />;
  }
  if (kind === "gif") {
    return <VideoPlayer src={attachment.url} poster={attachment.previewUrl} mimeType={mediaMimeType(attachment.mimeType, attachment.url)}
      description={description || t("media.animatedGifFallback")} autoPlay loop muted onOpenExternal={onOpenExternal} />;
  }
  if (kind === "video") {
    return <VideoPlayer src={attachment.url} poster={attachment.previewUrl} mimeType={mediaMimeType(attachment.mimeType, attachment.url)}
      description={description || t("media.videoFallback")} onOpenExternal={onOpenExternal} />;
  }
  return <audio src={attachment.url} aria-label={description || t("media.audioFallback")} className="w-full px-3 py-8" controls preload="metadata" />;
}

export function MediaCarousel({ attachments, onOpenExternal }: {
  attachments: MastodonMediaAttachment[];
  onOpenExternal?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const media = React.useMemo(() => attachments.filter((item) => supportedMediaKind(item.type)), [attachments]);
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex((current) => Math.min(current, Math.max(media.length - 1, 0))), [media.length]);
  if (!media.length) return null;
  const selected = media[index];
  const multiple = media.length > 1;
  const move = (delta: number) => setIndex((current) => (current + delta + media.length) % media.length);

  return (
    <section aria-label={t("media.carouselAriaLabel", { count: media.length })}
      className="relative overflow-hidden rounded-control border border-secondary bg-black/90"
      tabIndex={multiple ? 0 : undefined}
      onKeyDown={(event) => {
        if (!multiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
      }}>
      <div key={selected.id || `${selected.url}-${index}`} className="flex min-h-40 items-center justify-center">
        <MediaItem attachment={selected} onOpenExternal={onOpenExternal} />
      </div>
      {multiple ? <>
        <Button type="button" variant="filled" size="small" iconOnly aria-label={t("media.prevAriaLabel")}
          className="absolute left-2 top-1/2 -translate-y-1/2 shadow" onClick={(event) => { event.stopPropagation(); move(-1); }}><ChevronLeft /></Button>
        <Button type="button" variant="filled" size="small" iconOnly aria-label={t("media.nextAriaLabel")}
          className="absolute right-2 top-1/2 -translate-y-1/2 shadow" onClick={(event) => { event.stopPropagation(); move(1); }}><ChevronRight /></Button>
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white">
          <Text variant="mini" className="text-white" aria-live="polite">{t("media.position", { current: index + 1, total: media.length })}</Text>
        </div>
      </> : null}
    </section>
  );
}
