import { useState, useEffect } from "react";
import type { ProxyProfile } from "../../types/proxy";

declare const chrome: any;

interface ProxyManagerProps {
  isExtension: boolean;
  onLogMessage?: (level: string, message: string) => void;
}

const DEFAULT_COLOR = "#3b82f6";
const PRESET_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#6366f1"];

export default function ProxyManager({ isExtension, onLogMessage }: ProxyManagerProps) {
  const [profiles, setProfiles] = useState<ProxyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("direct");
  const [editingProfile, setEditingProfile] = useState<ProxyProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load Proxy State from extension background or mock
  const fetchProxyState = () => {
    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "GET_PROXY_STATE" }, (res: any) => {
        if (res) {
          setProfiles(res.profiles || []);
          setActiveProfileId(res.activeProfileId || "direct");
        }
      });
    } else {
      // Mock profiles for web dev mode
      const mockProfiles: ProxyProfile[] = [
        { id: "direct", name: "Direct Connection", mode: "direct", color: "#10b981" },
        { id: "system", name: "System Default Proxy", mode: "system", color: "#6366f1" },
        {
          id: "vproxy_auto_pac",
          name: "vproxy AutoProxy PAC",
          mode: "pac_script",
          pacType: "url",
          pacUrl: "http://127.0.0.1:26888/proxy.pac",
          color: "#8b5cf6",
          isVproxy: true
        },
        {
          id: "mock_socks5",
          name: "Local SOCKS5 Proxy",
          mode: "fixed_servers",
          scheme: "socks5",
          host: "127.0.0.1",
          port: 1080,
          bypassList: ["localhost", "127.0.0.1", "<-loopback>"],
          color: "#3b82f6"
        }
      ];
      setProfiles(mockProfiles);
      setActiveProfileId("direct");
    }
  };

  useEffect(() => {
    fetchProxyState();

    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      const listener = (message: any) => {
        if (message.type === "PROXY_PROFILES_UPDATED") {
          setProfiles(message.profiles || []);
          if (message.activeProfileId) {
            setActiveProfileId(message.activeProfileId);
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    }
  }, [isExtension]);

  const handleSetActiveProfile = (profileId: string) => {
    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "SET_ACTIVE_PROXY", profileId }, (res: any) => {
        if (res && res.success) {
          setActiveProfileId(profileId);
          onLogMessage?.("system", `Switched to proxy profile: ${res.activeProfile?.name || profileId}`);
        } else {
          onLogMessage?.("error", `Failed to set proxy profile: ${res?.error || "Unknown error"}`);
        }
      });
    } else {
      setActiveProfileId(profileId);
      onLogMessage?.("system", `Mock Mode: Switched active proxy profile to ${profileId}`);
    }
  };

  const [toastMsg, setToastMsg] = useState<string>("");

  const handleTriggerVproxySync = () => {
    setIsSyncing(true);
    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "TRIGGER_VPROXY_SYNC" }, (res: any) => {
        setIsSyncing(false);
        const msg = res?.status || "vproxy sync request dispatched.";
        onLogMessage?.("system", msg);
        setToastMsg("✅ vproxy rules synced successfully!");
        setTimeout(() => setToastMsg(""), 3000);
        fetchProxyState();
      });
    } else {
      setTimeout(() => {
        setIsSyncing(false);
        onLogMessage?.("system", "Mock Mode: Triggered vproxy sync check.");
        setToastMsg("✅ Mock vproxy sync completed!");
        setTimeout(() => setToastMsg(""), 3000);
      }, 500);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingProfile({
      id: `profile_${Date.now()}`,
      name: "",
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      mode: "fixed_servers",
      scheme: "socks5",
      host: "127.0.0.1",
      port: 1080,
      bypassList: ["localhost", "127.0.0.1"],
      pacType: "url",
      pacUrl: "",
      pacScript: "function FindProxyForURL(url, host) {\n  return 'DIRECT';\n}"
    });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (profile: ProxyProfile) => {
    setEditingProfile({
      ...profile,
      bypassList: profile.bypassList ? [...profile.bypassList] : []
    });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const handleSaveProfile = () => {
    if (!editingProfile) return;

    if (!editingProfile.name.trim()) {
      setErrorMsg("Profile name is required.");
      return;
    }

    if (editingProfile.mode === "fixed_servers") {
      if (!editingProfile.host?.trim()) {
        setErrorMsg("Proxy Host is required.");
        return;
      }
      const portNum = Number(editingProfile.port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setErrorMsg("Proxy Port must be between 1 and 65535.");
        return;
      }
    } else if (editingProfile.mode === "pac_script") {
      if (editingProfile.pacType === "url" && !editingProfile.pacUrl?.trim()) {
        setErrorMsg("PAC Script URL is required.");
        return;
      }
      if (editingProfile.pacType === "script" && !editingProfile.pacScript?.trim()) {
        setErrorMsg("PAC Inline Script content is required.");
        return;
      }
    }

    const payload = {
      ...editingProfile,
      name: editingProfile.name.trim(),
      host: editingProfile.host?.trim(),
      pacUrl: editingProfile.pacUrl?.trim(),
      bypassList: (editingProfile.bypassList || [])
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    };

    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "SAVE_PROXY_PROFILE", profile: payload }, (res: any) => {
        if (res && res.success) {
          setProfiles(res.profiles);
          setIsModalOpen(false);
          onLogMessage?.("system", `Proxy profile '${payload.name}' saved successfully.`);
        } else {
          setErrorMsg(res?.error || "Failed to save proxy profile.");
        }
      });
    } else {
      const idx = profiles.findIndex((p) => p.id === payload.id);
      let newProfiles = [...profiles];
      if (idx >= 0) {
        newProfiles[idx] = payload;
      } else {
        newProfiles.push(payload);
      }
      setProfiles(newProfiles);
      setIsModalOpen(false);
      onLogMessage?.("system", `Mock Mode: Saved proxy profile '${payload.name}'`);
    }
  };

  const handleDeleteProfile = (profileId: string, profileName: string) => {
    if (profileId === "direct" || profileId === "system") {
      alert("Built-in system default profiles cannot be deleted.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete profile "${profileName}"?`)) {
      return;
    }

    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "DELETE_PROXY_PROFILE", profileId }, (res: any) => {
        if (res && res.success) {
          setProfiles(res.profiles);
          setActiveProfileId(res.activeProfileId);
          onLogMessage?.("system", `Proxy profile '${profileName}' deleted.`);
        } else {
          alert(res?.error || "Failed to delete proxy profile.");
        }
      });
    } else {
      const newProfiles = profiles.filter((p) => p.id !== profileId);
      setProfiles(newProfiles);
      if (activeProfileId === profileId) {
        setActiveProfileId("direct");
      }
      onLogMessage?.("system", `Mock Mode: Deleted proxy profile '${profileName}'`);
    }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const getBadgeLabel = (profile?: ProxyProfile) => {
    if (!profile) return "DIRECT";
    if (profile.mode === "direct") return "DIRECT";
    if (profile.mode === "system") return "SYSTEM";
    if (profile.mode === "fixed_servers") {
      return (profile.scheme || "http").toUpperCase();
    }
    if (profile.mode === "pac_script") {
      return profile.pacType === "script" ? "PAC-SCRIPT" : "PAC-URL";
    }
    return "UNKNOWN";
  };

  const getProfileSummary = (profile?: ProxyProfile) => {
    if (!profile || profile.mode === "direct") return "No proxy used. Direct connection.";
    if (profile.mode === "system") return "Using system wide proxy settings.";
    if (profile.mode === "fixed_servers") {
      return `${(profile.scheme || "http").toUpperCase()}://${profile.host}:${profile.port}`;
    }
    if (profile.mode === "pac_script") {
      return profile.pacType === "script" ? "Custom Inline PAC JS" : `PAC URL: ${profile.pacUrl}`;
    }
    return "";
  };

  return (
    <div className="proxy-manager-container">
      {toastMsg && (
        <div style={{
          backgroundColor: '#10b981', color: '#ffffff', padding: '8px 12px', borderRadius: '6px',
          fontSize: '12px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)', transition: 'all .3s ease'
        }}>
          {toastMsg}
        </div>
      )}

      {/* Active Profile Status Header */}
      <div className="panel-card active-proxy-card">
        <div className="card-header">
          <h2 className="card-title">Active Proxy Mode</h2>
          <span
            className="proxy-badge"
            style={{ backgroundColor: activeProfile?.color || DEFAULT_COLOR }}
          >
            {getBadgeLabel(activeProfile)}
          </span>
        </div>
        <div className="active-details">
          <div className="active-title">{activeProfile?.name || "Direct Connection"}</div>
          <div className="active-subtext">{getProfileSummary(activeProfile)}</div>
        </div>
      </div>

      {/* Proxy Profiles Section */}
      <div className="panel-card">
        <div className="card-header">
          <h2 className="card-title">Proxy Profiles</h2>
          <div className="header-actions">
            <button
              onClick={handleTriggerVproxySync}
              className={`vproxy-sync-btn ${isSyncing ? "syncing" : ""}`}
              title="Sync proxies from local vproxy service"
            >
              🔄 vproxy Sync
            </button>
            <button onClick={handleOpenCreateModal} className="add-profile-btn">
              + New Profile
            </button>
          </div>
        </div>

        <div className="profiles-list">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            const isBuiltin = profile.id === "direct" || profile.id === "system";

            return (
              <div
                key={profile.id}
                className={`profile-item ${isActive ? "active-item" : ""}`}
                onClick={() => handleSetActiveProfile(profile.id)}
              >
                <div className="profile-main">
                  <div className="profile-radio-container">
                    <span className={`custom-radio ${isActive ? "checked" : ""}`} />
                  </div>
                  <div className="profile-info">
                    <div className="profile-name-row">
                      <span className="profile-name">{profile.name}</span>
                      <span
                        className="profile-scheme-tag"
                        style={{ borderColor: profile.color || DEFAULT_COLOR, color: profile.color || DEFAULT_COLOR }}
                      >
                        {getBadgeLabel(profile)}
                      </span>
                      {profile.isVproxy && (
                        <span className="vproxy-tag" title="Auto synced from vproxy">
                          vproxy
                        </span>
                      )}
                    </div>
                    <div className="profile-desc">{getProfileSummary(profile)}</div>
                  </div>
                </div>

                <div className="profile-actions" onClick={(e) => e.stopPropagation()}>
                  {!isBuiltin && (
                    <>
                      <button
                        onClick={() => handleOpenEditModal(profile)}
                        className="icon-action-btn edit"
                        title="Edit Profile"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(profile.id, profile.name)}
                        className="icon-action-btn delete"
                        title="Delete Profile"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Profile Editor */}
      {isModalOpen && editingProfile && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingProfile.id.startsWith("profile_") ? "Create Proxy Profile" : "Edit Proxy Profile"}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>

            {errorMsg && <div className="modal-error-box">{errorMsg}</div>}

            <div className="modal-body">
              {/* Profile Name & Color */}
              <div className="form-row flex-row">
                <div className="form-group flex-1">
                  <label>Profile Name</label>
                  <input
                    type="text"
                    placeholder="e.g. My SOCKS5 Proxy"
                    value={editingProfile.name}
                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  />
                </div>
                <div className="form-group color-group">
                  <label>Badge Color</label>
                  <div className="color-picker-row">
                    {PRESET_COLORS.map((c) => (
                      <span
                        key={c}
                        className={`color-dot ${editingProfile.color === c ? "selected" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setEditingProfile({ ...editingProfile, color: c })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Proxy Type / Mode Selector */}
              <div className="form-group">
                <label>Proxy Protocol / Mode</label>
                <div className="mode-selector-grid">
                  <button
                    type="button"
                    className={`mode-btn ${
                      editingProfile.mode === "fixed_servers" && editingProfile.scheme === "socks5" ? "active" : ""
                    }`}
                    onClick={() =>
                      setEditingProfile({
                        ...editingProfile,
                        mode: "fixed_servers",
                        scheme: "socks5"
                      })
                    }
                  >
                    SOCKS5
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${
                      editingProfile.mode === "fixed_servers" && editingProfile.scheme === "http" ? "active" : ""
                    }`}
                    onClick={() =>
                      setEditingProfile({
                        ...editingProfile,
                        mode: "fixed_servers",
                        scheme: "http"
                      })
                    }
                  >
                    HTTP Connect
                  </button>

                  <button
                    type="button"
                    className={`mode-btn ${
                      editingProfile.mode === "fixed_servers" && editingProfile.scheme === "https" ? "active" : ""
                    }`}
                    onClick={() =>
                      setEditingProfile({
                        ...editingProfile,
                        mode: "fixed_servers",
                        scheme: "https"
                      })
                    }
                  >
                    HTTPS Connect
                  </button>

                  <button
                    type="button"
                    className={`mode-btn ${
                      editingProfile.mode === "pac_script" && editingProfile.pacType === "url" ? "active" : ""
                    }`}
                    onClick={() =>
                      setEditingProfile({
                        ...editingProfile,
                        mode: "pac_script",
                        pacType: "url"
                      })
                    }
                  >
                    PAC Remote URL
                  </button>

                  <button
                    type="button"
                    className={`mode-btn ${
                      editingProfile.mode === "pac_script" && editingProfile.pacType === "script" ? "active" : ""
                    }`}
                    onClick={() =>
                      setEditingProfile({
                        ...editingProfile,
                        mode: "pac_script",
                        pacType: "script"
                      })
                    }
                  >
                    PAC Inline Script
                  </button>
                </div>
              </div>

              {/* Fixed Server Form Inputs (SOCKS5 / HTTP / HTTPS) */}
              {editingProfile.mode === "fixed_servers" && (
                <>
                  <div className="form-row flex-row">
                    <div className="form-group flex-2">
                      <label>Proxy Server Host</label>
                      <input
                        type="text"
                        placeholder="e.g. 127.0.0.1 or proxy.example.com"
                        value={editingProfile.host || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, host: e.target.value })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label>Port</label>
                      <input
                        type="number"
                        placeholder="1080"
                        value={editingProfile.port || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, port: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Bypass List (One per line)</label>
                    <textarea
                      rows={3}
                      placeholder="localhost&#10;127.0.0.1&#10;&lt;-loopback&gt;"
                      value={(editingProfile.bypassList || []).join("\n")}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          bypassList: e.target.value.split("\n")
                        })
                      }
                    />
                  </div>
                </>
              )}

              {/* PAC Remote URL Form Input */}
              {editingProfile.mode === "pac_script" && editingProfile.pacType === "url" && (
                <div className="form-group">
                  <label>PAC Script URL</label>
                  <input
                    type="url"
                    placeholder="e.g. http://example.com/proxy.pac"
                    value={editingProfile.pacUrl || ""}
                    onChange={(e) => setEditingProfile({ ...editingProfile, pacUrl: e.target.value })}
                  />
                </div>
              )}

              {/* PAC Inline Script Form Input */}
              {editingProfile.mode === "pac_script" && editingProfile.pacType === "script" && (
                <div className="form-group">
                  <label>Inline PAC JavaScript Code</label>
                  <textarea
                    rows={6}
                    className="code-textarea"
                    placeholder="function FindProxyForURL(url, host) {&#10;  if (shExpMatch(host, '*.example.com')) return 'PROXY 127.0.0.1:8080';&#10;  return 'DIRECT';&#10;}"
                    value={editingProfile.pacScript || ""}
                    onChange={(e) => setEditingProfile({ ...editingProfile, pacScript: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="save-btn" onClick={handleSaveProfile}>
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
