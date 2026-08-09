import { PenLine } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@glaze/core/components";
import { cn } from "@glaze/core/utils";

/**
 * Floating action button anchored over a scrollable feed. Fades and lifts out
 * of the way while the user is scrolling, and settles back in once they stop.
 */
export function FloatingComposeButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-end pr-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            iconOnly
            variant="accent"
            size="large"
            aria-label="Compose"
            tabIndex={visible ? 0 : -1}
            onClick={onClick}
            className={cn(
              "pointer-events-auto shadow-lg transition-all duration-200 ease-out",
              visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
            )}
          >
            <PenLine />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Compose</TooltipContent>
      </Tooltip>
    </div>
  );
}
