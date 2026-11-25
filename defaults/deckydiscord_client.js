// Injected into Vesktop's Discord page over DevTools. Exposes a small API on
// window.DECKYDISCORD that the plugin backend calls with Runtime.evaluate.
// Vesktop ships Vencord, so Discord's internal stores are reachable through
// Vencord.Webpack. Store usage follows Steamcord (BSD-3-Clause).
(() => {
    const VERSION = 2;
    if (window.DECKYDISCORD && window.DECKYDISCORD.version === VERSION) return;

    const wp = () => (window.Vencord && window.Vencord.Webpack) || null;
    const common = () => (wp() && wp().Common) || {};
    const store = (name) => {
        try { return wp().findStore(name); } catch (_) { return null; }
    };
    const byProps = (...props) => {
        try { return wp().findByProps(...props); } catch (_) { return null; }
    };
    const flux = () => common().FluxDispatcher || byProps("dispatch", "subscribe", "register");

    const avatarOf = (u, size) => {
        if (!u) return null;
        try {
            if (typeof u.getAvatarURL === "function") return u.getAvatarURL(null, size || 64, false);
        } catch (_) {}
        return u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=${size || 64}` : null;
    };
    const nameOf = (u, guildId) => {
        if (!u) return "Unknown";
        try {
            const nick = guildId && common().GuildMemberStore?.getNick?.(guildId, u.id);
            if (nick) return nick;
        } catch (_) {}
        return u.globalName || u.global_name || u.username || "Unknown";
    };

    // Discord only enables mic capture after a user interaction, which a hidden
    // window never gets: force the engine on (otherwise nobody hears you).
    const forceEngine = () => {
        try {
            const eng = store("MediaEngineStore")?.getMediaEngine?.();
            if (!eng) return;
            eng.interacted = true;
            if (typeof eng.setAudioEnabled === "function") eng.setAudioEnabled(true);
        } catch (_) {}
    };
    setInterval(forceEngine, 3000);

    // Login page: mirror Discord's own QR code (an <svg>) so the panel can show it.
    const findQR = () => {
        for (const s of document.querySelectorAll("svg")) {
            const r = s.getBoundingClientRect();
            if (r.width < 100 || r.width > 320 || Math.abs(r.width - r.height) > 30) continue;
            let len = 0;
            for (const p of s.querySelectorAll("path, rect")) len += (p.getAttribute("d") || "").length;
            if (len > 3000) {
                const c = s.cloneNode(true);
                c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                // white background so it scans on the dark panel
                c.setAttribute("style", "background:#fff");
                const xml = new XMLSerializer().serializeToString(c);
                return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
            }
        }
        return null;
    };
    const captchaVisible = () => {
        for (const f of document.querySelectorAll("iframe")) {
            if (!/hcaptcha\.com|recaptcha|arkoselabs\.com/i.test(f.src || "")) continue;
            const r = f.getBoundingClientRect();
            const cs = getComputedStyle(f);
            if (r.width >= 80 && r.height >= 40 && cs.visibility !== "hidden" && cs.display !== "none") return true;
        }
        return false;
    };

    const voiceMembers = (channelId, guildId) => {
        const VSS = store("VoiceStateStore");
        const SS = store("SpeakingStore");
        const US = common().UserStore;
        const states = VSS?.getVoiceStatesForChannel?.(channelId) || {};
        return Object.values(states).map(vs => {
            const u = US?.getUser?.(vs.userId);
            return {
                id: vs.userId,
                name: nameOf(u, guildId),
                avatar: avatarOf(u, 32),
                muted: !!(vs.mute || vs.selfMute),
                deafened: !!(vs.deaf || vs.selfDeaf),
                speaking: !!SS?.isSpeaking?.(vs.userId),
                streaming: !!vs.selfStream,
            };
        });
    };

    const channelLabel = (ch) => {
        if (!ch) return "Unknown";
        if (ch.name) return ch.name;
        const US = common().UserStore;
        const ids = ch.recipients || ch.rawRecipients?.map(r => r.id) || [];
        const names = ids.map(id => nameOf(US?.getUser?.(id))).filter(Boolean);
        return names.join(", ") || "Direct call";
    };

    // Logged in, but Discord never left the (now blank) login page.
    const loginStuck = () => {
        try {
            return location.pathname.startsWith("/login")
                && !!store("AuthenticationStore")?.isAuthenticated?.()
                && !common().UserStore?.getCurrentUser?.();
        } catch (_) { return false; }
    };

    const api = {
        version: VERSION,
        loginStuck,

        state() {
            const US = common().UserStore;
            if (!wp() || !US || typeof US.getCurrentUser !== "function") return { phase: "loading" };
            const me = US.getCurrentUser();
            if (!me && loginStuck()) return { phase: "loading", message: "Logging in…" };
            if (!me) {
                return { phase: "login", qr: findQR(), captcha: captchaVisible(),
                         scanned: !!document.querySelector('img[src*="avatars"]') };
            }
            const MES = store("MediaEngineStore");
            const SCS = store("SelectedChannelStore");
            const voiceId = SCS?.getVoiceChannelId?.() || null;
            let voice = null;
            if (voiceId) {
                const ch = common().ChannelStore?.getChannel?.(voiceId);
                const guildId = ch?.guild_id || null;
                const guild = guildId ? common().GuildStore?.getGuild?.(guildId) : null;
                voice = {
                    channelId: voiceId,
                    channelName: channelLabel(ch),
                    guildId,
                    guildName: guild?.name || null,
                    members: voiceMembers(voiceId, guildId),
                };
            }
            return {
                phase: "ready",
                user: { id: me.id, name: nameOf(me), username: me.username, avatar: avatarOf(me, 64) },
                muted: !!MES?.isSelfMute?.(),
                deafened: !!MES?.isSelfDeaf?.(),
                voice,
            };
        },

        guilds() {
            const GS = common().GuildStore;
            const GCS = store("GuildChannelStore");
            const SGS = store("SortedGuildStore");
            if (typeof GS?.getGuilds !== "function" || typeof GCS?.getChannels !== "function")
                throw new Error("Discord is still loading");
            const all = GS.getGuilds();
            const ids = SGS?.getFlattenedGuildIds?.() ?? Object.keys(all);
            const out = [];
            for (const id of ids) {
                const g = all[id];
                if (!g) continue;
                try {
                    const voice = (GCS.getChannels(g.id)?.VOCAL || []).map(e => {
                        const ch = e.channel || e;
                        if (!ch?.id) return null;
                        return { id: String(ch.id), name: String(ch.name || ""), members: voiceMembers(ch.id, g.id) };
                    }).filter(Boolean);
                    const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null;
                    out.push({ id: String(g.id), name: String(g.name), icon, channels: voice });
                } catch (_) {}
            }
            return out;
        },

        join(channelId, guildId) {
            forceEngine();
            const actions = byProps("selectVoiceChannel", "disconnect");
            if (actions && typeof actions.selectVoiceChannel === "function") actions.selectVoiceChannel(channelId);
            else flux().dispatch({ type: "VOICE_CHANNEL_SELECT", channelId, guildId: guildId || null });
            return true;
        },

        leave() {
            const actions = byProps("selectVoiceChannel", "disconnect");
            if (actions && typeof actions.disconnect === "function") actions.disconnect();
            else flux().dispatch({ type: "VOICE_CHANNEL_SELECT", channelId: null, guildId: null });
            return true;
        },

        toggleMute() {
            const a = byProps("toggleSelfMute", "toggleSelfDeaf");
            if (a) a.toggleSelfMute();
            else flux().dispatch({ type: "AUDIO_TOGGLE_SELF_MUTE", context: "default", syncRemote: true });
            return !!store("MediaEngineStore")?.isSelfMute?.();
        },

        toggleDeafen() {
            const a = byProps("toggleSelfMute", "toggleSelfDeaf");
            if (a) a.toggleSelfDeaf();
            else flux().dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF", context: "default", syncRemote: true });
            return !!store("MediaEngineStore")?.isSelfDeaf?.();
        },

        logout() {
            const auth = byProps("logout", "loginToken");
            if (auth && typeof auth.logout === "function") auth.logout();
            else { localStorage.removeItem("token"); location.reload(); }
            return true;
        },
    };

    window.DECKYDISCORD = api;
})();
