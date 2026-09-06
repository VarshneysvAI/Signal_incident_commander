/**
 * BridgePage - Audio bridge for Google Meet/Zoom integration
 * Captures system audio, mixes presenter mic, publishes to Agora RTC,
 * routes TTS back into call, and transcribes live speech into SIGNAL's knowledge graph.
 */
import React, { useState, useEffect } from 'react';
import { useAgoraBridge } from '../hooks/useAgoraBridge';
import { apiClient } from '../api/client';
import { getAvatarForName, SpeakerProfile } from '../hooks/useVoiceCommander';

interface BridgePageProps {
  channelName: string;
}

export const BridgePage: React.FC<BridgePageProps> = ({ channelName }) => {
  const [token, setToken] = useState<string | null>(null);
  const [selectedSinkDevice, setSelectedSinkDevice] = useState<string>('');
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [appId, setAppId] = useState<string>('448514fe68b2427097e014f12cb5d64e');
  const [quickTestText, setQuickTestText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newResponderName, setNewResponderName] = useState('');
  const [newResponderRole, setNewResponderRole] = useState('Incident Responder');

  const {
    state,
    cleanChannelName,
    responders,
    activeSpeaker,
    setActiveSpeaker,
    addResponder,
    bridgeTranscripts,
    interimText,
    interimSpeaker,
    startSystemCapture,
    enablePresenterMic,
    joinAndPublish,
    sendBridgeTranscript,
    setTTSSinkDevice,
    enumerateAudioOutputs,
    stopBridge,
  } = useAgoraBridge(channelName);

  const [quickSpeaker, setQuickSpeaker] = useState(activeSpeaker.name);

  useEffect(() => {
    setQuickSpeaker(activeSpeaker.name);
  }, [activeSpeaker.name]);

  // Fetch Agora token on mount with numerical UID 9990
  useEffect(() => {
    let isMounted = true;
    const fetchToken = async () => {
      try {
        const response = await apiClient.post('/api/agora/token', {
          channel_name: cleanChannelName,
          uid: 9990,
        });
        if (isMounted) {
          setToken(response.data.token);
          if (response.data.app_id) {
            setAppId(response.data.app_id);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch Agora token:', err);
      }
    };

    if (cleanChannelName) {
      fetchToken();
    }

    return () => {
      isMounted = false;
    };
  }, [cleanChannelName]);

  // Enumerate audio devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      const devices = await enumerateAudioOutputs();
      setAudioDevices(devices);

      // Auto-detect virtual audio cable device if present
      const virtualDevice = devices.find(
        (d) =>
          d.label.toLowerCase().includes('cable') ||
          d.label.toLowerCase().includes('blackhole') ||
          d.label.toLowerCase().includes('loopback') ||
          d.label.toLowerCase().includes('virtual')
      );

      if (virtualDevice) {
        setSelectedSinkDevice(virtualDevice.deviceId);
        setTTSSinkDevice(virtualDevice.deviceId).catch(() => {});
      }
    };

    loadDevices();
  }, []);

  // Handle start capture button
  const handleStartCapture = async () => {
    try {
      await startSystemCapture();
    } catch (err: any) {
      console.error('Capture failed:', err);
    }
  };

  // Handle enable presenter mic
  const handleEnableMic = async () => {
    try {
      await enablePresenterMic();
    } catch (err: any) {
      console.error('Mic failed:', err);
    }
  };

  // Handle join and publish
  const handleJoin = async () => {
    if (!token) {
      try {
        const res = await apiClient.post('/api/agora/token', {
          channel_name: cleanChannelName,
          uid: 9990,
        });
        setToken(res.data.token);
        if (res.data.app_id) setAppId(res.data.app_id);
        await joinAndPublish(res.data.token, 9990, res.data.app_id || appId);
        return;
      } catch (err: any) {
        alert(`Agora token retrieval failed: ${err.message || 'Check backend connection'}`);
        return;
      }
    }

    try {
      await joinAndPublish(token, 9990, appId);
    } catch (err: any) {
      console.error('Join failed:', err);
    }
  };

  // Handle sink device change
  const handleSinkChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedSinkDevice(deviceId);

    try {
      await setTTSSinkDevice(deviceId);
    } catch (err: any) {
      console.error('Failed to change sink:', err);
    }
  };

  // Quick test voice utterance injection
  const handleSendQuickTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTestText.trim()) return;
    const target = responders.find((r) => r.name.toLowerCase() === quickSpeaker.toLowerCase()) || activeSpeaker;
    sendBridgeTranscript(quickTestText.trim(), target.name, target.uid, target.avatar);
    setQuickTestText('');
  };

  // Manual responder creation
  const handleAddCustomResponder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResponderName.trim()) return;
    const cleanName = newResponderName.trim().charAt(0).toUpperCase() + newResponderName.trim().slice(1);
    const newProfile: SpeakerProfile = {
      name: cleanName,
      uid: Math.floor(2000 + Math.random() * 7000),
      role: newResponderRole.trim() || 'Incident Responder',
      avatar: getAvatarForName(cleanName),
    };
    addResponder(newProfile);
    setActiveSpeaker(newProfile);
    setNewResponderName('');
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🌉</span>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  SIGNAL Bridge Mode
                  <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-blue-900/60 border border-blue-600 text-blue-300">
                    Google Meet & Zoom Multi-Speaker
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Stream Google Meet audio into Agora RTC, dynamically recognize speakers, and extract causal facts into SIGNAL.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700">
            <span className="text-slate-400">Channel:</span>
            <span className="text-blue-400 font-bold">{cleanChannelName}</span>
            <span className="text-slate-500">• UID: 9990</span>
          </div>
        </div>

        {/* Dynamic Responders in Meet Panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>1. Detected Meeting Responders ({responders.length})</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                  100% Dynamic Auto-Induction
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Participants are automatically discovered from meeting speech cues (e.g. <em>"Alice: checking logs"</em> or <em>"This is Bob from SRE"</em>).
              </p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 self-start sm:self-auto shadow"
            >
              <span>+</span> Add Participant
            </button>
          </div>

          {/* Roster Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
            {responders.map((r) => {
              const isCurrent = activeSpeaker.name.toLowerCase() === r.name.toLowerCase();
              return (
                <button
                  key={r.name}
                  onClick={() => setActiveSpeaker(r)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isCurrent
                      ? 'bg-emerald-950/70 border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg'
                      : 'bg-slate-900/60 border-slate-700 hover:bg-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xl">{r.avatar || '🧑‍💻'}</span>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black font-bold animate-pulse">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-xs text-white truncate">{r.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{r.role}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Telemetry Status Panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
            <span>2. Bridge Telemetry & Status</span>
            <span className={`w-2.5 h-2.5 rounded-full ${state.isPublishing ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-lg flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${state.isCapturing ? 'bg-emerald-400 ring-2 ring-emerald-400/40' : 'bg-slate-600'}`} />
              <div>
                <div className="text-[11px] text-slate-400">Google Meet Audio</div>
                <div className="text-xs font-bold text-white">{state.isCapturing ? 'Active (Tab Audio)' : 'Inactive'}</div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-lg flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${state.isPresenterMic ? 'bg-purple-400 ring-2 ring-purple-400/40' : 'bg-slate-600'}`} />
              <div>
                <div className="text-[11px] text-slate-400">Presenter Mic</div>
                <div className="text-xs font-bold text-white">{state.isPresenterMic ? 'Active (Local)' : 'Inactive'}</div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-lg flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${state.isPublishing ? 'bg-blue-400 ring-2 ring-blue-400/40 animate-pulse' : 'bg-slate-600'}`} />
              <div>
                <div className="text-[11px] text-slate-400">Agora RTC Stream</div>
                <div className="text-xs font-bold text-white">{state.isPublishing ? 'Broadcasting Live' : 'Offline'}</div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-lg flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${token ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <div>
                <div className="text-[11px] text-slate-400">Agora RTC Token</div>
                <div className="text-xs font-bold text-white">{token ? 'Ready' : 'Loading...'}</div>
              </div>
            </div>
          </div>

          {/* Volume Meter if active */}
          {state.isPublishing && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Broadcast Audio Level (Mixed Google Meet + Presenter Mic):</span>
                <span className="font-mono text-emerald-400">{state.volumeLevel}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-75"
                  style={{ width: `${state.volumeLevel}%` }}
                />
              </div>
            </div>
          )}

          {state.error && (
            <div className="mt-4 p-3.5 bg-red-950/60 border border-red-500/70 rounded-xl text-xs text-red-200 flex items-start gap-2.5">
              <span className="text-base">⚠️</span>
              <div>
                <p className="font-semibold text-white">Bridge Action Notice:</p>
                <p className="mt-0.5 text-red-300">{state.error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls & Setup Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls Column */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              3. Bridge Connection Controls
            </h2>

            <div className="p-3.5 bg-blue-950/40 border border-blue-500/50 rounded-xl text-xs text-blue-200 flex items-start gap-2.5">
              <span className="text-base">💡</span>
              <div>
                <p className="font-semibold text-white">How to Stream Google Meet / Zoom Audio:</p>
                <ol className="list-decimal list-inside space-y-1 mt-1 text-slate-300">
                  <li>Click <strong>"Start System Audio Capture"</strong> below.</li>
                  <li>In the Chrome dialog, switch to <strong>"Chrome Tab"</strong> tab.</li>
                  <li>Select your Google Meet tab and ensure the <strong className="text-emerald-300">"Share tab audio"</strong> checkbox is <strong>CHECKED</strong>.</li>
                  <li>Click <strong>"Join Channel & Publish"</strong> to stream into Agora RTC!</li>
                </ol>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleStartCapture}
                disabled={state.isCapturing}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition ${
                  state.isCapturing
                    ? 'bg-emerald-900/50 border border-emerald-500/50 text-emerald-300 cursor-default'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                }`}
              >
                <span>🎤</span>
                <span>{state.isCapturing ? '✓ Google Meet Tab Audio Capturing' : '1. Start System Audio Capture (Google Meet)'}</span>
              </button>

              <button
                onClick={handleEnableMic}
                disabled={state.isPresenterMic}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition ${
                  state.isPresenterMic
                    ? 'bg-purple-900/50 border border-purple-500/50 text-purple-300 cursor-default'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                }`}
              >
                <span>🎙️</span>
                <span>{state.isPresenterMic ? '✓ Presenter Microphone Active' : '2. Enable Presenter Microphone (Optional)'}</span>
              </button>

              <button
                onClick={handleJoin}
                disabled={state.isPublishing}
                className={`w-full py-3.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                  state.isPublishing
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
                }`}
              >
                <span>📡</span>
                <span>{state.isPublishing ? '✓ Broadcasting Live to Agora Channel' : '3. Join Channel & Publish (Start Bridge)'}</span>
              </button>

              <button
                onClick={stopBridge}
                disabled={!state.isCapturing && !state.isPublishing && !state.isPresenterMic}
                className="w-full py-2.5 px-4 bg-red-600/80 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold border border-red-500/60 transition"
              >
                ⏹️ Stop Bridge & Disconnect
              </button>
            </div>
          </div>

          {/* Virtual Mic & Audio Routing Column */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              4. Voice Feedback Routing (TTS Sink)
            </h2>

            <p className="text-xs text-slate-400 leading-relaxed">
              Select your virtual audio device (VB-Cable / BlackHole) to feed SIGNAL's neural voice directly back into Google Meet / Zoom.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Audio Output / Virtual Cable:
              </label>
              <select
                value={selectedSinkDevice}
                onChange={handleSinkChange}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Default System Audio Output --</option>
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Audio Device (${device.deviceId.slice(0, 8)}...)`}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-xl text-xs text-amber-200">
              <p className="font-semibold text-white mb-1">🎧 2-Way Meet Setup Guide:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                <li><strong>In Google Meet:</strong> Set Microphone to <em>VB-Cable Output</em>.</li>
                <li><strong>In SIGNAL (here):</strong> Set TTS Output to <em>VB-Cable Input</em>.</li>
                <li>When SIGNAL answers questions, its voice speaks directly into the Google Meet call!</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Live Spoken Utterance Stream & In-Bridge Testing */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>5. Live Multi-Speaker Knowledge Stream</span>
                {interimText && <span className="text-[10px] bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded animate-pulse">Transcribing...</span>}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Utterances from meeting participants are automatically attributed to their personas and processed into the causal graph.
              </p>
            </div>
          </div>

          {interimText && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/70 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold">{interimSpeaker.avatar} {interimSpeaker.name}:</span>
              <span><em>"{interimText}..."</em></span>
            </div>
          )}

          {/* Transcript Feed */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {bridgeTranscripts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                No voice utterances captured yet. Speak in Google Meet (e.g. <em>"David: CPU is 98%"</em>) or use the tester below.
              </p>
            ) : (
              bridgeTranscripts.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-900/80 border border-slate-700/60 rounded-xl flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5 flex-1">
                    <span className="text-xl">{t.avatar || getAvatarForName(t.speaker)}</span>
                    <div className="flex-1">
                      <div className="font-bold text-blue-400 flex items-center gap-2">
                        <span>{t.speaker}</span>
                        <span className="text-[10px] text-slate-500 font-normal">Google Meet Voice</span>
                      </div>
                      <p className="text-slate-200 mt-0.5 leading-relaxed">{t.text}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{t.time}</span>
                </div>
              ))
            )}
          </div>

          {/* Quick Voice Injection Bar */}
          <form onSubmit={handleSendQuickTest} className="pt-3 border-t border-slate-700 flex flex-col sm:flex-row gap-2">
            <select
              value={quickSpeaker}
              onChange={(e) => setQuickSpeaker(e.target.value)}
              className="w-full sm:w-48 bg-slate-900 text-white px-3 py-2 rounded-lg border border-slate-700 text-xs focus:outline-none focus:border-blue-500"
            >
              {responders.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.avatar} {r.name} ({r.role})
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Test voice line (e.g. 'Sarah: database latency 450ms', 'David: restarting pods')"
              value={quickTestText}
              onChange={(e) => setQuickTestText(e.target.value)}
              className="flex-1 bg-slate-900 text-white px-3 py-2 rounded-lg border border-slate-700 text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!quickTestText.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-semibold rounded-lg transition shadow"
            >
              Send Utterance
            </button>
          </form>
        </div>
      </div>

      {/* Add Responder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🧑‍💻</span> Add Google Meet Participant
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomResponder} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Participant Name / Handle</label>
                <input
                  type="text"
                  placeholder="e.g. David, Sarah, Alex"
                  value={newResponderName}
                  onChange={(e) => setNewResponderName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role / Team</label>
                <input
                  type="text"
                  placeholder="e.g. Database Lead, SRE, Payments Backend"
                  value={newResponderRole}
                  onChange={(e) => setNewResponderRole(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newResponderName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-semibold"
                >
                  Add to Call
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BridgePage;


