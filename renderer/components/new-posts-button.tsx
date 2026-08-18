import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@glaze/core/components";

/** Phanpy-style "N new posts" affordance shown instead of silently inserting
 * freshly-arrived posts above whatever the reader is currently looking at. */
export function NewPostsButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      size="small"
      variant="accent"
      className="sticky top-0 z-10 self-center"
      onClick={onClick}
    >
      <ArrowUp />
      {t("fediverse.newPosts", { count })}
    </Button>
  );
}
