import * as React from "react";
import { ExternalLink, Play, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Text } from "@glaze/core/components";

import { mediaFormatLabel } from "../lib/media-attachments";

export function VideoPlayer({
  src,
  poster,
  mimeType,
  description,
  autoPlay = false,
  loop = false,
  muted = false,
  onOpenExternal,
}: {
  src: string;
  poster?: string | null;
  mimeType: string | null;
  description: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  onOpenExternal?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [started, setStarted] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const shouldAutoPlay = autoPlay && !reducedMotion;
  const play = async () => {
    try {
      await videoRef.current?.play();
      setStarted(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  const format = mediaFormatLabel(mimeType);

  return <div className="relative flex min-h-40 w-full items-center justify-center bg-black">
    <video ref={videoRef} poster={poster || undefined} aria-label={description || t("media.videoFallback")}
      title={description || undefined} className="max-h-[28rem] w-full object-contain"
      controls={started || shouldAutoPlay} preload="metadata" playsInline
      autoPlay={shouldAutoPlay} loop={loop} muted={muted || shouldAutoPlay}
      onPlay={() => setStarted(true)} onError={() => setFailed(true)}>
      <source src={src} type={mimeType || undefined} />
    </video>
    {format ? <Badge className="pointer-events-none absolute left-2 top-2 bg-black/70 text-white">{format}</Badge> : null}
    {!started && !failed ? <Button type="button" variant="filled" size="large"
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/75 text-white shadow-lg"
      aria-label={description ? t("media.videoAriaLabelWithDesc", { description }) : t("media.videoAriaLabel")} onClick={() => void play()}>
      <Play /> {t("media.videoPlay")}
    </Button> : null}
    {failed ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center text-white">
      <TriangleAlert className="size-5" />
      <Text variant="small" className="text-white">{t("media.videoDecodeError")}</Text>
      {onOpenExternal ? <Button type="button" size="small" variant="filled" onClick={() => onOpenExternal(src)}>
        <ExternalLink /> {t("media.openMedia")}
      </Button> : null}
    </div> : null}
  </div>;
}
