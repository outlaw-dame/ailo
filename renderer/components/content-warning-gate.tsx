import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Callout, Text } from "@glaze/core/components";

interface ContentWarningGateProps {
  warning: string;
  children: React.ReactNode;
}

export function ContentWarningGate({ warning, children }: ContentWarningGateProps) {
  const [revealed, setRevealed] = React.useState(false);

  if (revealed) {
    return (
      <div className="flex flex-col gap-3">
        <Callout
          color="yellow"
          icon={<AlertTriangle />}
          actions={
            <Button size="small" variant="transparent" onClick={() => setRevealed(false)}>
              Hide
            </Button>
          }
        >
          Content warning: {warning}
        </Callout>
        {children}
      </div>
    );
  }

  return (
    <div className="rounded-control border border-secondary bg-well px-5 py-6 flex flex-col items-start gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-support-yellow" />
        <Text variant="strong">Content warning</Text>
      </div>
      <Text color="secondary">{warning}</Text>
      <Button size="small" variant="filled" onClick={() => setRevealed(true)}>
        Show content
      </Button>
    </div>
  );
}
