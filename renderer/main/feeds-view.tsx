import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, ScrollArea } from "@glaze/core/components";
import { useTranslation } from "react-i18next";

import { FediverseComposer } from "../components/fediverse-composer";
import { FediverseCustomFeeds } from "../components/fediverse-custom-feeds";
import { api } from "../lib/api";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";

export function FeedsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ["fedipod", "status"], queryFn: api.fedipod.status });
  const capabilitiesQuery = useQuery({ queryKey: ["fedipod", "capabilities"], queryFn: () => api.fedipod.capabilities() });
  const composer = useFediverseComposerState();
  const account = status.data?.account;
  if (!status.isLoading && !status.data?.connected) {
    return <ScrollArea title={t("feeds.title")} subtitle={t("feeds.subtitleMain")} className="h-full">
      <div className="px-6 py-12"><EmptyState title={t("feeds.disconnectedTitle")} description={t("feeds.disconnectedDescription")} actions={<Button variant="accent" onClick={() => void navigate({ to: "/profile" })}>{t("feeds.disconnectedAction")}</Button>} /></div>
    </ScrollArea>;
  }
  const returnToFediverse = () => void navigate({ to: "/fediverse" });
  return <ScrollArea title={t("feeds.title")} subtitle={t("feeds.subtitleWithForYou")} className="h-full">
    <div className="mx-auto max-w-6xl px-6 py-5">
      <FediverseCustomFeeds ownAccountId={account?.id} onReply={composer.openReply} onQuote={composer.openQuote} onHashtag={returnToFediverse} />
    </div>
    <FediverseComposer
      open={composer.composerOpen}
      onOpenChange={composer.onOpenChange}
      replyTo={composer.replyTo}
      onCancelReply={composer.onCancelReply}
      quoteTarget={composer.quoteTarget}
      onCancelQuote={composer.onCancelQuote}
      capabilities={capabilitiesQuery.data}
    />
  </ScrollArea>;
}
