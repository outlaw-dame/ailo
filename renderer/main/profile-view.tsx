import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, CalendarDays, Github, Globe2, Link2, Unplug } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  FieldGroup,
  FieldSet,
  Input,
  ScrollArea,
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

export function ProfileView() {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.profile.get(),
  });
  const githubQuery = useQuery({
    queryKey: ["github", "status"],
    queryFn: () => api.github.status(),
  });
  const solidQuery = useQuery({
    queryKey: ["solid", "status"],
    queryFn: () => api.solid.status(),
  });
  const fediQuery = useQuery({
    queryKey: ["fedipod", "status"],
    queryFn: () => api.fedipod.status(),
  });
  const reposQuery = useQuery({
    queryKey: ["github", "repos"],
    queryFn: () => api.github.listRepos(),
    enabled: Boolean(githubQuery.data?.connected),
  });

  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [calComPath, setCalComPath] = React.useState("");
  const [solidIssuer, setSolidIssuer] = React.useState("https://login.inrupt.com");
  const [solidPodRoot, setSolidPodRoot] = React.useState("");
  const [repoName, setRepoName] = React.useState("knot-notes");
  const [fediBaseUrl, setFediBaseUrl] = React.useState("http://localhost:8030");
  const [fediToken, setFediToken] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const url = fediQuery.data?.baseUrl;
    if (url) setFediBaseUrl(url);
  }, [fediQuery.data?.baseUrl]);

  React.useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || hydrated) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
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
        calComPath: normalizeCalPath(calComPath),
        solidIssuer: solidIssuer.trim() || "https://login.inrupt.com",
        solidPodRoot: solidPodRoot.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save profile"),
  });

  const githubConnect = useMutation({
    mutationFn: () => api.github.connect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("GitHub connected");
    },
    onError: (error: Error) => toast.error(error.message || "GitHub connection failed"),
  });

  const githubDisconnect = useMutation({
    mutationFn: () => api.github.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("GitHub disconnected");
    },
    onError: (error: Error) => toast.error(error.message || "Could not disconnect GitHub"),
  });

  const createRepo = useMutation({
    mutationFn: () => api.github.createRepo(repoName || "knot-notes", false),
    onSuccess: async (repo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(`Created ${repo.fullName}`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not create repository"),
  });

  const setRepo = useMutation({
    mutationFn: (fullName: string) => api.github.setRepo(fullName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("Repository selected");
    },
    onError: (error: Error) => toast.error(error.message || "Could not select repository"),
  });

  const solidConnect = useMutation({
    mutationFn: () => api.solid.connect(solidIssuer),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solid"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success(`Connected as ${result.webId}`);
    },
    onError: (error: Error) => toast.error(error.message || "Solid connection failed"),
  });

  const solidDisconnect = useMutation({
    mutationFn: () => api.solid.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solid"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("Solid disconnected");
    },
    onError: (error: Error) => toast.error(error.message || "Could not disconnect Solid"),
  });

  const fediConnect = useMutation({
    mutationFn: () => api.fedipod.connect(fediBaseUrl.trim(), fediToken.trim()),
    onSuccess: async (result) => {
      setFediToken("");
      await queryClient.invalidateQueries({ queryKey: ["fedipod"] });
      toast.success(`Connected as @${result.account.acct || result.account.username}`);
    },
    onError: (error: Error) => toast.error(error.message || "FediPod connection failed"),
  });

  const fediDisconnect = useMutation({
    mutationFn: () => api.fedipod.disconnect(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fedipod"] });
      toast.success("FediPod disconnected");
    },
    onError: (error: Error) => toast.error(error.message || "Could not disconnect FediPod"),
  });

  const calPath = normalizeCalPath(calComPath);
  const calEmbedUrl = calPath ? `https://cal.com/${calPath}?embed=true&theme=auto` : null;

  const github = githubQuery.data;
  const solid = solidQuery.data;
  const fedi = fediQuery.data;

  return (
    <ScrollArea title="You" subtitle="Identity, destinations, and booking" className="h-full">
      <div className="px-8 py-6 max-w-3xl flex flex-col gap-8 pb-16">
        <section className="flex flex-col gap-3">
          <div>
            <Text variant="heading2">Masthead</Text>
            <Text color="secondary" className="mt-1">
              The quiet byline behind the knowledge you share.
            </Text>
          </div>
          <FieldGroup>
            <Field label="Display name" orientation="vertical">
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ada Lovelace"
              />
            </Field>
            <Field label="Bio" orientation="vertical">
              <Textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="I write about the open web and careful systems."
                size="large"
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              variant="accent"
              size="small"
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              Save profile
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">Solid Pod</Text>
            {solid?.connected ? (
              <Badge color="green">Connected</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
          <Text color="secondary">
            Sign in with your WebID. Published notes are saved as Markdown files in your Pod.
          </Text>
          <FieldGroup>
            <Field
              label="Identity provider"
              description="Inrupt, solidcommunity.net, or your own Solid-OIDC issuer."
              orientation="vertical"
            >
              <Input
                value={solidIssuer}
                onChange={(event) => setSolidIssuer(event.target.value)}
                placeholder="https://login.inrupt.com"
              />
            </Field>
            <Field
              label="Pod root (optional)"
              description="Leave blank to auto-detect storage from your WebID profile."
              orientation="vertical"
            >
              <Input
                value={solidPodRoot}
                onChange={(event) => setSolidPodRoot(event.target.value)}
                placeholder="https://storage.inrupt.com/…/"
              />
            </Field>
          </FieldGroup>
          {solid?.webId ? (
            <Text variant="small" color="tertiary" className="truncate" title={solid.webId}>
              WebID · {solid.webId}
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
                Disconnect
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
                Connect Pod
              </Button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AtSign className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">FediPod</Text>
            {fedi?.connected ? (
              <Badge color="green">Connected</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
          <Text color="secondary">
            Connect your running FediPod agent — a personal ActivityPub server backed by your Solid
            Pod. Knot reads your home timeline and shares stories to the Fediverse.
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
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <>
              <FieldGroup>
                <Field
                  label="FediPod URL"
                  description="Where your FediPod agent is running. Default is http://localhost:8030."
                  orientation="vertical"
                >
                  <Input
                    value={fediBaseUrl}
                    onChange={(event) => setFediBaseUrl(event.target.value)}
                    placeholder="http://localhost:8030"
                  />
                </Field>
                <Field
                  label="Access token"
                  description="A Mastodon-compatible access token from your FediPod instance."
                  orientation="vertical"
                >
                  <Input
                    type="password"
                    value={fediToken}
                    onChange={(event) => setFediToken(event.target.value)}
                    placeholder="Paste your access token"
                  />
                </Field>
              </FieldGroup>
              <div>
                <Button
                  size="small"
                  variant="accent"
                  disabled={fediConnect.isPending || !fediBaseUrl.trim() || !fediToken.trim()}
                  onClick={() => fediConnect.mutate()}
                >
                  <Link2 />
                  Connect FediPod
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Github className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">GitHub</Text>
            {github?.connected ? (
              <Badge color="green">Connected</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
          <Text color="secondary">
            Create or choose a repository. Each published note becomes a Markdown commit.
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

              <FieldSet title="Publishing repository">
                <Field label="Create new" orientation="vertical">
                  <div className="flex items-center gap-2 w-full">
                    <Input
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      placeholder="knot-notes"
                      className="flex-1"
                    />
                    <Button
                      size="small"
                      variant="accent"
                      disabled={createRepo.isPending || !repoName.trim()}
                      onClick={() => createRepo.mutate()}
                    >
                      Create
                    </Button>
                  </div>
                </Field>
                <Field
                  label="Or choose existing"
                  description={
                    github.repo ? `Active: ${github.repo}` : "No repository selected yet."
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
                    <option value="">Select a repository…</option>
                    {(reposQuery.data ?? []).map((repo) => (
                      <option key={repo.fullName} value={repo.fullName}>
                        {repo.fullName}
                        {repo.private ? " (private)" : ""}
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
                  Disconnect
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
              Connect GitHub
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-secondary shrink-0" />
            <Text variant="heading2">Cal.com</Text>
          </div>
          <Text color="secondary">
            Let readers book a session to keep the conversation going. Paste your Cal.com username
            or event path.
          </Text>
          <FieldGroup>
            <Field
              label="Booking path"
              description='Examples: "ada" or "ada/30min" or a full cal.com URL.'
              orientation="vertical"
            >
              <Input
                value={calComPath}
                onChange={(event) => setCalComPath(event.target.value)}
                placeholder="you/30min"
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
              Save booking link
            </Button>
          </div>

          {calEmbedUrl ? (
            <div className="rounded-control border border-secondary overflow-hidden bg-well">
              <div className="px-3 py-2 border-b border-separator flex items-center justify-between gap-2">
                <Text variant="small-strong">Book a session</Text>
                <Text variant="mini" color="tertiary" className="truncate">
                  cal.com/{calPath}
                </Text>
              </div>
              <iframe
                title="Cal.com scheduler"
                src={calEmbedUrl}
                className="w-full h-[640px] bg-transparent border-0"
                loading="lazy"
                allow="camera; microphone; fullscreen; payment"
              />
            </div>
          ) : (
            <div className="rounded-control border border-dashed border-secondary px-4 py-8 text-center">
              <Text color="tertiary">Add a Cal.com path to embed your scheduler here.</Text>
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
