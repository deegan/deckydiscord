import {
  ButtonItem,
  Field,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import {
  FaDiscord,
  FaMicrophone,
  FaMicrophoneSlash,
  FaHeadphones,
  FaPhoneSlash,
  FaVolumeUp,
  FaChevronLeft,
} from "react-icons/fa";

interface Member {
  id: string;
  name: string;
  avatar: string | null;
  muted: boolean;
  deafened: boolean;
  speaking?: boolean;
  streaming?: boolean;
}

interface VoiceState {
  channelId: string;
  channelName: string;
  guildId: string | null;
  guildName: string | null;
  members: Member[];
}

interface State {
  phase: string; // loading | login | ready | starting | installing | error | no_backend | conflict
  message?: string;
  qr?: string | null;
  captcha?: boolean;
  scanned?: boolean;
  user?: { id: string; name: string; username: string; avatar: string | null };
  muted?: boolean;
  deafened?: boolean;
  voice?: VoiceState | null;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  channels: { id: string; name: string; members: Member[] }[];
}

interface ActionResult {
  ok: boolean;
  error?: string;
  result?: unknown;
}

interface UpdateInfo {
  ok: boolean;
  current: string;
  latest?: string;
  available?: boolean;
  artifact?: string;
  sha256?: string;
  error?: string;
}

// Decky's own backend (not part of @decky/api): asks the user, then downloads,
// verifies the hash and replaces the plugin as root.
declare const DeckyBackend: { call: (route: string, ...args: unknown[]) => Promise<unknown> };
const INSTALL_TYPE_UPDATE = 2;

const getState = callable<[], State>("get_state");
const getGuilds = callable<[], { ok: boolean; guilds?: Guild[]; error?: string }>("get_guilds");
const joinVoice = callable<[string, string], ActionResult>("join_voice");
const leaveVoice = callable<[], ActionResult>("leave_voice");
const toggleMute = callable<[], ActionResult>("toggle_mute");
const toggleDeafen = callable<[], ActionResult>("toggle_deafen");
const logout = callable<[], ActionResult>("logout");
const checkUpdate = callable<[boolean], UpdateInfo>("check_update");
const restartDiscord = callable<[], ActionResult>("restart_discord");

// Decky unmounts the panel whenever Quick Access closes, so keep view state at
// module level to reopen where the user left off.
let lastState: State = { phase: "starting", message: "Connecting…" };
let lastGuilds: Guild[] = [];
let openGuildId: string | null = null;

async function run(action: () => Promise<ActionResult>, failTitle: string) {
  try {
    const r = await action();
    if (!r.ok) toaster.toast({ title: failTitle, body: r.error || "Unknown error" });
  } catch (e) {
    toaster.toast({ title: failTitle, body: String(e) });
  }
}

const Avatar = ({ src, size = 24, ring = false }: { src: string | null; size?: number; ring?: boolean }) =>
  src ? (
    <img
      src={src}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        boxShadow: ring ? "0 0 0 2px #23a55a" : undefined,
      }}
    />
  ) : (
    <FaDiscord size={size} style={{ flexShrink: 0 }} />
  );

const MemberRow = ({ m }: { m: Member }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
    <Avatar src={m.avatar} ring={m.speaking} />
    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
    {m.streaming && <span style={{ color: "#f23f43", fontSize: 10, fontWeight: 700 }}>LIVE</span>}
    {m.deafened ? <FaHeadphones color="#f23f43" /> : m.muted ? <FaMicrophoneSlash color="#f23f43" /> : null}
  </div>
);

function StatusView({ state }: { state: State }) {
  const canRestart = ["error", "starting", "loading"].includes(state.phase);
  return (
    <PanelSection title="Discord">
      <PanelSectionRow>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          {state.message || (state.phase === "loading" ? "Discord is loading…" : "Starting…")}
        </div>
      </PanelSectionRow>
      {canRestart && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => run(restartDiscord, "Restart failed")}>
            Restart Discord
          </ButtonItem>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

function LoginView({ state }: { state: State }) {
  return (
    <PanelSection title="Log in to Discord">
      <PanelSectionRow>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          {state.captcha
            ? "Discord is asking for a CAPTCHA. Log in once from Vesktop in Desktop Mode, then come back."
            : state.scanned
              ? "Scanned. Confirm the login on your phone."
              : "In the Discord mobile app: Settings → Scan QR Code, then scan this code."}
        </div>
      </PanelSectionRow>
      {state.qr && !state.scanned && (
        <PanelSectionRow>
          <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
            <img src={state.qr} style={{ width: 200, height: 200, background: "#fff", padding: 8, borderRadius: 8 }} />
          </div>
        </PanelSectionRow>
      )}
      {!state.qr && !state.scanned && !state.captcha && (
        <PanelSectionRow>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Waiting for the QR code…</div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

function CallView({ state }: { state: State }) {
  const v = state.voice!;
  return (
    <PanelSection title={v.guildName ? `${v.guildName} · Voice` : "Call"}>
      <PanelSectionRow>
        <Field label={<span><FaVolumeUp style={{ marginRight: 6 }} />{v.channelName}</span>} bottomSeparator="none" />
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {v.members.map((m) => <MemberRow key={m.id} m={m} />)}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => run(leaveVoice, "Could not disconnect")}>
          <FaPhoneSlash style={{ marginRight: 8 }} />Disconnect
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

function ServersView({ inCall }: { inCall: string | null }) {
  const [guilds, setGuilds] = useState<Guild[]>(lastGuilds);
  const [openId, setOpenId] = useState<string | null>(openGuildId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await getGuilds().catch((e) => ({ ok: false, error: String(e) }) as const);
      if (!alive) return;
      if (r.ok && "guilds" in r && r.guilds) {
        lastGuilds = r.guilds;
        setGuilds(r.guilds);
        setError(null);
      } else {
        setError(("error" in r && r.error) || "Could not load servers");
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const open = (id: string | null) => {
    openGuildId = id;
    setOpenId(id);
  };

  const guild = guilds.find((g) => g.id === openId);
  if (guild) {
    return (
      <PanelSection title={guild.name}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => open(null)}>
            <FaChevronLeft style={{ marginRight: 8 }} />All servers
          </ButtonItem>
        </PanelSectionRow>
        {guild.channels.length === 0 && (
          <PanelSectionRow>
            <div style={{ fontSize: 12, opacity: 0.7 }}>No voice channels you can see.</div>
          </PanelSectionRow>
        )}
        {guild.channels.map((c) => (
          <PanelSectionRow key={c.id}>
            <ButtonItem
              layout="below"
              disabled={inCall === c.id}
              onClick={() => run(() => joinVoice(c.id, guild.id), "Could not join")}
              description={c.members.length ? c.members.map((m) => m.name).join(", ") : undefined}
            >
              <FaVolumeUp style={{ marginRight: 8 }} />
              {c.name}
              {c.members.length ? ` (${c.members.length})` : ""}
              {inCall === c.id ? " · connected" : ""}
            </ButtonItem>
          </PanelSectionRow>
        ))}
      </PanelSection>
    );
  }

  return (
    <PanelSection title="Servers">
      {error && !guilds.length && (
        <PanelSectionRow>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{error}</div>
        </PanelSectionRow>
      )}
      {guilds.map((g) => {
        const active = g.channels.reduce((n, c) => n + c.members.length, 0);
        return (
          <PanelSectionRow key={g.id}>
            <ButtonItem
              layout="below"
              onClick={() => open(g.id)}
              description={active ? `${active} in voice` : undefined}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar src={g.icon} size={20} />
                {g.name}
              </span>
            </ButtonItem>
          </PanelSectionRow>
        );
      })}
    </PanelSection>
  );
}

function UpdateView() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (force: boolean) => {
    setBusy(true);
    try {
      setInfo(await checkUpdate(force));
    } catch (e) {
      toaster.toast({ title: "Update check failed", body: String(e) });
    }
    setBusy(false);
  };
  useEffect(() => {
    check(false);
  }, []);

  const install = async () => {
    try {
      await DeckyBackend.call(
        "utilities/install_plugin",
        info!.artifact,
        "Deckycord",
        info!.latest,
        info!.sha256,
        INSTALL_TYPE_UPDATE,
      );
    } catch (e) {
      toaster.toast({ title: "Could not start the update", body: String(e) });
    }
  };

  const available = !!info?.ok && !!info.available;
  const status = !info ? undefined
    : !info.ok ? `Check failed: ${info.error}`
    : available ? "Updating ends any active call."
    : "Up to date";
  return (
    <PanelSection title="Updates">
      <PanelSectionRow>
        <Field label="Installed" bottomSeparator="none">{info ? `v${info.current}` : "…"}</Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy}
          description={status}
          onClick={() => (available ? install() : check(true))}
        >
          {busy ? "Checking…" : available ? `Update to v${info!.latest}` : "Check for updates"}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

function Content() {
  const [state, setState] = useState<State>(lastState);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await getState();
        if (alive && s) {
          lastState = s;
          setState(s);
        }
      } catch (e) {
        if (alive) setState({ phase: "error", message: String(e) });
      }
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (state.phase === "login") return <><LoginView state={state} /><UpdateView /></>;
  if (state.phase !== "ready") return <><StatusView state={state} /><UpdateView /></>;

  return (
    <>
      <PanelSection title="Discord">
        <PanelSectionRow>
          <Field
            label={
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar src={state.user?.avatar ?? null} />
                {state.user?.name}
              </span>
            }
            bottomSeparator="none"
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => run(toggleMute, "Could not toggle mute")}>
            {state.muted ? <FaMicrophoneSlash color="#f23f43" style={{ marginRight: 8 }} /> : <FaMicrophone style={{ marginRight: 8 }} />}
            {state.muted ? "Unmute" : "Mute"}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => run(toggleDeafen, "Could not toggle deafen")}>
            <FaHeadphones color={state.deafened ? "#f23f43" : undefined} style={{ marginRight: 8 }} />
            {state.deafened ? "Undeafen" : "Deafen"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      {state.voice && <CallView state={state} />}
      <ServersView inCall={state.voice?.channelId ?? null} />
      <PanelSection title="Settings">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => run(restartDiscord, "Restart failed")}>
            Restart Discord
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => run(logout, "Logout failed")}>
            Log out
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      <UpdateView />
    </>
  );
}

export default definePlugin(() => ({
  name: "Deckycord",
  titleView: <div className={staticClasses.Title}>Deckycord</div>,
  content: <Content />,
  icon: <FaDiscord />,
}));
