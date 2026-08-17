import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, CalendarDays, Copy, Github, Globe2, Link2, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
  Field,
  FieldGroup,
  FieldSet,
  Input,
  ScrollArea,
  Switch,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";

import { api } from "../lib/api";

function normalizeCalPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      return url.pathname.replace(/^\//, "").replace(/\/$/, "");
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^\//, "").replace(/\/$/, "");
}

export function ProfileView({ settingsOnly = false }: { settingsOnly?: boolean } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.profile.get(),
  });
  const githubQuery = useQuery({
    queryKey: ["github", "status"],
    queryFn: () => api.github.status(),
    enabled: settingsOnly,
  });
  const solidQuery = useQuery({
    queryKey: ["solid", "status"],
    queryFn: () => api.solid.status(),
    enabled: settingsOnly,
  });
  const fediQuery = useQuery({
    queryKey: ["fedipod", "status"],
    queryFn: () => api.fedipod.status(),
    enabled: settingsOnly,
  });
  const creatorQuery = useQuery({
    queryKey: ["fedipod", "creator-attribution"],
    queryFn: api.fedipod.creatorAttribution,
    enabled: settingsOnly && Boolean(fediQuery.data?.connected),
  });
  const reposQuery = useQuery({
    queryKey: ["github", "repos"],
    queryFn: () => api.github.listRepos(),
    enabled: settingsOnly && Boolean(githubQuery.data?.connected),
  });

  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [bannerUrl, setBannerUrl] = React.useState("");
  const [calComPath, setCalComPath] = React.useState("");
  const [solidIssuer, setSolidIssuer] = React.useState("https://login.inrupt.com");
  const [solidPodRoot, setSolidPodRoot] = React.useState("");
  const [repoName, setRepoName] = React.useState("ailo-notes");
  const [fediBaseUrl, setFediBaseUrl] = React.useState("http://localhost:8030");
  const [fediToken, setFediToken] = React.useState("");
  const [fediPassword, setFediPassword] = React.useState("");
  const [fediNeedsPassword, setFediNeedsPassword] = React.useState(false);
  const [creatorDomains, setCreatorDomains] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const url = fediQuery.data?.baseUrl;
    if (url) setFediBaseUrl(url);
  }, [fediQuery.data?.baseUrl]);

  React.useEffect(() => {
    if (creatorQuery.data) setCreatorDomains(creatorQuery.data.domains.join("\n"));
  }, [creatorQuery.data]);

  React.useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || hydrated) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setAvatarUrl(profile.avatarUrl ?? "");
    setBannerUrl(profile.bannerUrl ?? "");
    setCalComPath(profile.calComPath);
    setSolidIssuer(profile.solidIssuer || "https://login.inrupt.com");
    setSolidPodRoot(profile.solidPodRoot);
    setHydrated(true);
  }, [profileQuery.data, hydrated]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api.profile.update({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        calComPath: normalizeCalPath(calComPath),
        solidIssuer: solidIssuer.trim() || "https://login.inrupt.com",
        solidPodRoot: solidPodRoot.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("profile.saveProfileSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.saveProfileError")),
  });

  const githubConnect = useMutation({
    mutationFn: () => api.github.connect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.githubConnectSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.githubConnectError")),
  });

  const githubDisconnect = useMutation({
    mutationFn: () => api.github.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.githubDisconnectSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.githubDisconnectError")),
  });

  const createRepo = useMutation({
    mutationFn: () => api.github.createRepo(repoName || "ailo-notes", false),
    onSuccess: async (repo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.githubRepoCreated", { fullName: repo.fullName }));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.githubRepoCreateError")),
  });

  const setRepo = useMutation({
    mutationFn: (fullName: string) => api.github.setRepo(fullName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.githubRepoSelected"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.githubRepoSelectError")),
  });

  const solidConnect = useMutation({
    mutationFn: () => api.solid.connect(solidIssuer),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solid"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.solidConnectSuccess", { webId: result.webId }));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.solidConnectError")),
  });

  const solidDisconnect = useMutation({
    mutationFn: () => api.solid.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solid"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(t("profile.solidDisconnectSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.solidDisconnectError")),
  });

  const fediLogin = useMutation({
    mutationFn: () => api.fedipod.login(
      fediBaseUrl.trim(),
      fediPassword.trim() || undefined,
    ),
    onSuccess: async (result) => {
      if (result.status === "password_required") {
        setFediNeedsPassword(true);
        toast.error(t("profile.fediPasswordRequired"));
        return;
      }
      setFediPassword("");
      setFediNeedsPassword(false);
      await queryClient.invalidateQueries({ queryKey: ["fedipod"] });
      toast.success(t("profile.fediConnectSuccess", { handle: result.account.acct || result.account.username }));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.fediLoginError")),
  });

  const fediConnect = useMutation({
    mutationFn: () => api.fedipod.connect(
      fediBaseUrl.trim(),
      fediToken.trim(),
    ),
    onSuccess: async (result) => {
      setFediToken("");
      await queryClient.invalidateQueries({ queryKey: ["fedipod"] });
      toast.success(t("profile.fediConnectSuccess", { handle: result.account.acct || result.account.username }));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.fediConnectError")),
  });

  const fediDisconnect = useMutation({
    mutationFn: () => api.fedipod.disconnect(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fedipod"] });
      toast.success(t("profile.fediDisconnectSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.fediDisconnectError")),
  });

  const setCreatorAttribution = useMutation({
    mutationFn: (enabled: boolean) => api.profile.update({ fediverseCreatorEnabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message || t("profile.fediCreatorUpdateError")),
  });
  const saveCreatorDomains = useMutation({
    mutationFn: () => api.fedipod.updateCreatorAttribution(
      creatorDomains.split(/[\n,]+/).map((domain) => domain.trim()).filter(Boolean),
    ),
    onSuccess: async (result) => {
      setCreatorDomains(result.domains.join("\n"));
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "creator-attribution"] });
      toast.success(t("profile.fediCreatorDomainsSaveSuccess"));
    },
    onError: (error: Error) => toast.error(error.message || t("profile.fediCreatorDomainsError")),
  });

  const calPath = normalizeCalPath(calComPath);
  const calEmbedUrl = calPath ? `https://cal.com/${calPath}?embed=true&theme=auto` : null;

  const github = githubQuery.data;
  const solid = solidQuery.data;
  const fedi = fediQuery.data;

  const content = (
      <div className={settingsOnly ? "flex max-w-3xl flex-col gap-8" : "px-8 py-6 max-w-3xl flex flex-col gap-8 pb-16"}>
        {!settingsOnly ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Text variant="heading2">{t("profile.mastheadTitle")}</Text>
            <Text color="secondary" className="mt-1">
              {t("profile.mastheadSubtitle")}
            </Text>
          </div>

          {/* Banner + avatar preview.
              Banner uses <img> (not CSS background-image) so animated GIFs
              play correctly. object-cover replicates background-size:cover. */}
          <div className="relative rounded-control overflow-hidden border border-secondary">
            <div className="w-full h-28 bg-well flex items-center justify-center overflow-hidden">
              {bannerUrl ? (
                <img
                  src={bannerUrl}
                  alt=""
                  className="size-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <Text variant="small" color="tertiary">{t("profile.bannerPlaceholder")}</Text>
              )}
            </div>
            <div className="absolute left-4 -bottom-7">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={t("profile.avatarAlt")}
                  className="size-16 rounded-full border-2 border-background object-cover bg-well shadow-sm"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div
                  className="size-16 rounded-full border-2 border-background bg-well flex items-center justify-center shadow-sm"
                  aria-label={t("profile.avatarPlaceholderLabel")}
                  role="img"
                >
                  <Text variant="mini" color="tertiary">{t("profile.avatarPhotoLabel")}</Text>
                </div>
              )}
            </div>
          </div>

          <div className="pt-9">
            <FieldGroup>
              <Field label={t("profile.avatarUrlLabel")} description={t("profile.avatarUrlDescription")} orientation="vertical">
                <Input
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder={t("profile.avatarUrlPlaceholder")}
                  type="url"
                />
              </Field>
              <Field label={t("profile.bannerUrlLabel")} description={t("profile.bannerUrlDescription")} orientation="vertical">
                <Input
                  value={bannerUrl}
                  onChange={(event) => setBannerUrl(event.target.value)}
                  placeholder={t("profile.bannerUrlPlaceholder")}
                  type="url"
                />
              </Field>
              <Field label={t("profile.displayNameLabel")} orientation="vertical">
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t("profile.displayNamePlaceholder")}
                />
              </Field>
              <Field label={t("profile.bioLabel")} orientation="vertical">
                <Textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder={t("profile.bioPlaceholder")}
                  size="large"
                />
              </Field>
            </FieldGroup>
          </div>
          <div className="flex justify-end">
            <Button
              variant="accent"
              size="small"
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              {t("profile.saveProfile")}
            </Button>
          </div>
        </section>
        ) : null}

        {settingsOnly ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">{t("profile.solidTitle")}</Text>
            {solid?.connected ? (
              <Badge color="green">{t("common.connected")}</Badge>
            ) : (
              <Badge>{t("common.notConnected")}</Badge>
            )}
          </div>
          <Text color="secondary">
            {t("profile.solidDescription")}
          </Text>
          <FieldGroup>
            <Field
              label={t("profile.solidIdentityProviderLabel")}
              description={t("profile.solidIdentityProviderDescription")}
              orientation="vertical"
            >
              <Input
                value={solidIssuer}
                onChange={(event) => setSolidIssuer(event.target.value)}
                placeholder={t("profile.solidIssuerPlaceholder")}
              />
            </Field>
            <Field
              label={t("profile.solidPodRootLabel")}
              description={t("profile.solidPodRootDescription")}
              orientation="vertical"
            >
              <Input
                value={solidPodRoot}
                onChange={(event) => setSolidPodRoot(event.target.value)}
                placeholder={t("profile.solidPodRootPlaceholder")}
              />
            </Field>
          </FieldGroup>
          {solid?.webId ? (
            <Text variant="small" color="tertiary" className="truncate" title={solid.webId}>
              {t("profile.solidWebId", { webId: solid.webId })}
            </Text>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {solid?.connected ? (
              <Button
                size="small"
                variant="filled"
                disabled={solidDisconnect.isPending}
                onClick={() => solidDisconnect.mutate()}
              >
                <Unplug />
                {t("common.disconnect")}
              </Button>
            ) : (
              <Button
                size="small"
                variant="accent"
                disabled={solidConnect.isPending}
                onClick={() => {
                  void saveProfile.mutateAsync().finally(() => solidConnect.mutate());
                }}
              >
                <Link2 />
                {t("profile.solidConnect")}
              </Button>
            )}
          </div>
        </section>
        ) : null}

        {settingsOnly ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AtSign className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">{t("profile.fediTitle")}</Text>
            {fedi?.connected ? (
              <Badge color="green">{t("common.connected")}</Badge>
            ) : (
              <Badge>{t("common.notConnected")}</Badge>
            )}
          </div>
          <Text color="secondary">
            {t("profile.fediDescription")}
          </Text>
          {fedi?.connected && fedi.account ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {fedi.account.avatar ? (
                  <img
                    src={fedi.account.avatar}
                    alt=""
                    className="size-8 rounded-full shrink-0 object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <Text variant="strong" truncate>
                    {fedi.account.displayName}
                  </Text>
                  <Text variant="small" color="tertiary" truncate>
                    @{fedi.account.acct || fedi.account.username}
                    {fedi.baseUrl ? ` · ${fedi.baseUrl}` : ""}
                  </Text>
                </div>
              </div>
              <div>
                <Button
                  size="small"
                  variant="filled"
                  disabled={fediDisconnect.isPending}
                  onClick={() => fediDisconnect.mutate()}
                >
                  <Unplug />
                  {t("common.disconnect")}
                </Button>
              </div>

              <div className="flex flex-col gap-2 rounded-control border border-secondary px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Text variant="small-strong">{t("profile.fediCreatorTitle")}</Text>
                    <Text variant="mini" color="tertiary">
                      {t("profile.fediCreatorDescription")}
                    </Text>
                  </div>
                  <Switch
                    checked={profileQuery.data?.fediverseCreatorEnabled ?? true}
                    disabled={setCreatorAttribution.isPending}
                    onCheckedChange={(checked) => setCreatorAttribution.mutate(checked)}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-control bg-well/50 px-2.5 py-2">
                  <Text
                    variant="mini"
                    color="tertiary"
                    className="min-w-0 flex-1 truncate font-mono"
                    title={creatorQuery.data?.tag}
                  >
                    {creatorQuery.data?.tag || `Loading creator tag for @${fedi.account.acct || fedi.account.username}…`}
                  </Text>
                  <Button
                    size="small"
                    variant="transparent"
                    iconOnly
                    aria-label={t("profile.fediCreatorCopyAriaLabel")}
                    disabled={!creatorQuery.data?.tag}
                    onClick={() => {
                      const tag = creatorQuery.data?.tag;
                      if (!tag) return;
                      void navigator.clipboard.writeText(tag).then(
                        () => toast.success(t("profile.fediCreatorCopied")),
                        () => toast.error(t("profile.fediCreatorCopyError")),
                      );
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                <Text variant="mini" color="quaternary">
                  {t("profile.fediCreatorTagFootnote")}
                </Text>
                <Field
                  label={t("profile.fediCreatorDomainsLabel")}
                  description={t("profile.fediCreatorDomainsDescription")}
                  orientation="vertical"
                >
                  <Textarea
                    value={creatorDomains}
                    onChange={(event) => setCreatorDomains(event.target.value)}
                    placeholder={t("profile.fediCreatorDomainsPlaceholder")}
                  />
                </Field>
                <div className="flex items-center justify-between gap-2">
                  {creatorQuery.isError ? (
                    <Text variant="mini" color="danger">{(creatorQuery.error as Error).message}</Text>
                  ) : <span />}
                  <Button size="small" variant="accent" disabled={saveCreatorDomains.isPending}
                    onClick={() => saveCreatorDomains.mutate()}>
                    {t("profile.fediCreatorDomainsSave")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <FieldGroup>
                <Field
                  label={t("profile.fediUrlLabel")}
                  description={t("profile.fediUrlDescription")}
                  orientation="vertical"
                >
                  <Input
                    value={fediBaseUrl}
                    onChange={(event) => setFediBaseUrl(event.target.value)}
                    placeholder={t("profile.fediUrlPlaceholder")}
                  />
                </Field>
                {fediNeedsPassword ? (
                  <Field
                    label={t("profile.fediPasswordLabel")}
                    description={t("profile.fediPasswordDescription")}
                    orientation="vertical"
                  >
                    <Input
                      type="password"
                      value={fediPassword}
                      onChange={(event) => setFediPassword(event.target.value)}
                      placeholder={t("profile.fediPasswordPlaceholder")}
                      autoFocus
                    />
                  </Field>
                ) : null}
              </FieldGroup>
              <div>
                <Button
                  size="small"
                  variant="accent"
                  disabled={fediLogin.isPending || !fediBaseUrl.trim()}
                  onClick={() => fediLogin.mutate()}
                >
                  <Link2 />
                  {t("profile.fediLoginButton")}
                </Button>
              </div>
              <Text variant="small" color="tertiary">
                {t("profile.fediLoginOAuthNotePrefix")}
                <code>{t("profile.fediLoginOAuthEndpoint")}</code>
                {t("profile.fediLoginOAuthNoteSuffix")}
              </Text>

              <CollapsibleRoot>
                <CollapsibleTrigger variant="row">
                  <Text variant="small" color="secondary">
                    {t("profile.fediManualTokenToggle")}
                  </Text>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-3 pt-3">
                    <Field
                      label={t("profile.fediTokenLabel")}
                      description={t("profile.fediTokenDescription")}
                      orientation="vertical"
                    >
                      <Input
                        type="password"
                        value={fediToken}
                        onChange={(event) => setFediToken(event.target.value)}
                        placeholder={t("profile.fediTokenPlaceholder")}
                      />
                    </Field>
                    <div>
                      <Button
                        size="small"
                        variant="filled"
                        disabled={fediConnect.isPending || !fediBaseUrl.trim() || !fediToken.trim()}
                        onClick={() => fediConnect.mutate()}
                      >
                        <Link2 />
                        {t("profile.fediConnectWithToken")}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </CollapsibleRoot>
            </>
          )}
        </section>
        ) : null}

        {settingsOnly ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Github className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">{t("profile.githubTitle")}</Text>
            {github?.connected ? (
              <Badge color="green">{t("common.connected")}</Badge>
            ) : (
              <Badge>{t("common.notConnected")}</Badge>
            )}
          </div>
          <Text color="secondary">
            {t("profile.githubDescription")}
          </Text>

          {github?.connected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {github.user?.avatarUrl ? (
                  <img
                    src={github.user.avatarUrl}
                    alt=""
                    className="size-8 rounded-full shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <Text variant="strong" truncate>
                    {github.user?.name || github.user?.login}
                  </Text>
                  <Text variant="small" color="tertiary" truncate>
                    @{github.user?.login}
                    {github.repo ? ` · ${github.repo}` : ""}
                  </Text>
                </div>
              </div>

              <FieldSet title={t("profile.githubRepoSectionTitle")}>
                <Field label={t("profile.githubRepoNewLabel")} orientation="vertical">
                  <div className="flex items-center gap-2 w-full">
                    <Input
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      placeholder="ailo-notes"
                      className="flex-1"
                    />
                    <Button
                      size="small"
                      variant="accent"
                      disabled={createRepo.isPending || !repoName.trim()}
                      onClick={() => createRepo.mutate()}
                    >
                      {t("common.create")}
                    </Button>
                  </div>
                </Field>
                <Field
                  label={t("profile.githubRepoExistingLabel")}
                  description={
                    github.repo
                      ? t("profile.githubRepoExistingActiveDescription", { repo: github.repo })
                      : t("profile.githubRepoExistingNoneDescription")
                  }
                  orientation="vertical"
                >
                  <select
                    className="w-full h-8 rounded-control border border-field bg-transparent px-2 text-regular text-primary outline-none focus:border-foreground-40"
                    value={github.repo ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value) setRepo.mutate(value);
                    }}
                  >
                    <option value="">{t("profile.githubRepoSelectPlaceholder")}</option>
                    {(reposQuery.data ?? []).map((repo) => (
                      <option key={repo.fullName} value={repo.fullName}>
                        {repo.fullName}
                        {repo.private ? ` ${t("profile.githubRepoPrivate")}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldSet>

              <div>
                <Button
                  size="small"
                  variant="filled"
                  disabled={githubDisconnect.isPending}
                  onClick={() => githubDisconnect.mutate()}
                >
                  <Unplug />
                  {t("common.disconnect")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="small"
              variant="accent"
              disabled={githubConnect.isPending}
              onClick={() => githubConnect.mutate()}
            >
              <Github />
              {t("profile.githubConnect")}
            </Button>
          )}
        </section>
        ) : null}

        {!settingsOnly ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">{t("profile.calTitle")}</Text>
          </div>
          <Text color="secondary">
            {t("profile.calDescription")}
          </Text>
          <FieldGroup>
            <Field
              label={t("profile.calPathLabel")}
              description={t("profile.calPathDescription")}
              orientation="vertical"
            >
              <Input
                value={calComPath}
                onChange={(event) => setCalComPath(event.target.value)}
                placeholder={t("profile.calPathPlaceholder")}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              size="small"
              variant="filled"
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              {t("profile.calSaveButton")}
            </Button>
          </div>

          {calEmbedUrl ? (
            <div className="rounded-control border border-secondary overflow-hidden bg-well">
              <div className="px-3 py-2 border-b border-separator flex items-center justify-between gap-2">
                <Text variant="small-strong">{t("profile.calEmbedTitle")}</Text>
                <Text variant="mini" color="tertiary" className="truncate">
                  cal.com/{calPath}
                </Text>
              </div>
              <iframe
                title={t("profile.calEmbedTitle")}
                src={calEmbedUrl}
                className="w-full h-[640px] bg-transparent border-0"
                loading="lazy"
                allow="camera; microphone; fullscreen; payment"
              />
            </div>
          ) : (
            <div className="rounded-control border border-dashed border-secondary px-4 py-8 text-center">
              <Text color="tertiary">{t("profile.calEmbedEmpty")}</Text>
            </div>
          )}
        </section>
        ) : null}
      </div>
  );

  if (settingsOnly) return content;
  return (
    <ScrollArea title={t("profile.title")} subtitle={t("profile.subtitle")} className="h-full">
      {content}
    </ScrollArea>
  );
}

export function AccountSettings() {
  return <ProfileView settingsOnly />;
}
