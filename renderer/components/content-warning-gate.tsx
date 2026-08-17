import * as React from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@glaze/core/components";

interface ContentWarningGateProps {
  warning: string;
  children: React.ReactNode;
}

export function ContentWarningGate({ warning, children }: ContentWarningGateProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = React.useState(false);

  if (revealed) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 rounded-card bg-well px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-support-yellow" />
            <Text variant="small" color="secondary" className="truncate">
              {t("contentWarning.labelWithWarning", { warning })}
            </Text>
          </div>
          <Button size="small" variant="transparent" onClick={() => setRevealed(false)}>
            <EyeOff />
            {t("contentWarning.hide")}
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card bg-well">
      <div className="knot-mesh-2 pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative flex flex-col items-start gap-4 px-6 py-8 sm:px-8">
        <div className="flex size-10 items-center justify-center rounded-full bg-control-subtle">
          <AlertTriangle className="size-5 text-support-yellow" />
        </div>
        <div className="flex max-w-md flex-col gap-2">
          <Text variant="heading2">{t("contentWarning.beforeYouContinue")}</Text>
          <Text color="secondary" className="text-pretty">
            {warning}
          </Text>
        </div>
        <Button size="small" variant="accent" onClick={() => setRevealed(true)}>
          <Eye />
          {t("contentWarning.showStory")}
        </Button>
      </div>
    </div>
  );
}
