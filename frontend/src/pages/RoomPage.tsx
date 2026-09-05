/**
 * RoomPage.tsx - In-App Agora Voice Room for SIGNAL Commander
 * Track 3: Voice-First Incident Response with Agora RTC, Real-Time Audio,
 * Dynamic Responders, In-Speech Speaker Routing, and Chaos Testing Engine.
 */
import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useAppStore } from '../store';
import { apiClient, chaosApi } from '../api/client';
import { parseInSpeechSpeaker, SpeakerProfile } from '../hooks/useVoiceCommander';
import { ChaosEngineModal } from '../components/ChaosEngineModal';

export const PRESET_SPEAKERS: SpeakerProfile[] = [
  { name: 'Alice', uid: 1001, role: 'Incident Commander / SRE Lead', avatar: '👩‍💼' },
  { name: 'Bob', uid: 1002, role: 'Backend / DB Engineer', avatar: '👨‍💻' },
  { name: 'Carol', uid: 1003, role: 'Infrastructure / DevOps', avatar: '👩‍🔧' },
  { name: 'Dave', uid: 1004, role: 'Engineering Manager', avatar: '👨‍💼' },
  { name: 'Sarah', uid: 1005, role: 'Payment Gateway SRE', avatar: '👩‍💻' },
  { name: 'Vikram', uid: 1006, role: 'Principal Architect', avatar: '👨‍🔬' },
];

export const RoomPage: React.FC = () => {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);
  const isSpeaking = useAppStore((state) => state.isSpeaking);
  const lastQueryResult = useAppStore((state) => state.lastQueryResult);

  // Dynamic responders
  const [responders, setResponders] = useState<SpeakerProfile[]>(PRESET_SPEAKERS);
  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerProfile>(PRESET_SPEAKERS[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChaosModal, setShowChaosModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newAvatar, setNewAvatar] = useState('🧑‍💻');

  // Chaos & Stress Engine
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('payment_outage');
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [autoSimulating, setAutoSimulating] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const addResponder = (profile: SpeakerProfile) => {
    setResponders((prev) => {
      if (prev.some((p) => p.name.toLowerCase() === profile.name.toLowerCase())) return prev;
      return [...prev, profile];
    });
  };

  const handleCreateCustomResponder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const profile: SpeakerProfile = {
      name: newName.trim(),
      uid: Math.floor(2000 + Math.random() * 7000),
      role: newRole.trim() || 'Incident Responder',
      avatar: newAvatar || '🧑‍💻',
    };
    addResponder(profile);
    setSelectedSpeaker(profile);
    setNewName('');
    setNewRole('');
    setShowAddModal(false);
  };

  // Load scenarios on mount
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const res = await chaosApi.listScenarios();
        setScenarios(res.data);
      } catch (err) {
        console.error('Failed to load scenarios:', err);
      }
    };
    loadScenarios();
  }, []);

  // Fetch active scenario details
  useEffect(() => {
    if (!currentIncident?.id) return;
    const fetchScenario = async () => {
      try {
        const res = await chaosApi.generateScenario(currentIncident.id, {
          scenario_id: selectedScenarioId,
        });
        setCurrentScenario(res.data);
        if (res.data.responders) {
          res.data.responders.forEach((r: any) => addResponder(r));
        }
      } catch (err) {
        console.error('Failed to load scenario details:', err);
      }
    };
    fetchScenario();
  }, [selectedScenarioId, currentIncident?.id]);

  // Agora State
  const [joined, setJoined] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [statusMessage, setStatusMessage] = useState<string>('Ready to join voice room');
  const [agentStatus, setAgentStatus] = useState<string>('Not started');
  const [tokenInfo, setTokenInfo] = useState<{ token: string; appId: string } | null>(null);

  // Simulation input
  const [simText, setSimText] = useState('');
  const [recentTranscripts, setRecentTranscripts] = useState<Array<{ id: string; speaker: string; text: string; time: string }>>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [interimSpeaker, setInterimSpeaker] = useState<string>('');

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  const channelName = currentIncident?.channel_name || (currentIncident ? `incident-${currentIncident.id}` : 'signal-incident-room');
  const activeSpeakerName = selectedSpeaker.name;
  const activeSpeakerUid = selectedSpeaker.uid;

  const respondersRef = useRef(responders);
  const selectedSpeakerRef = useRef(selectedSpeaker);
  respondersRef.current = responders;
  selectedSpeakerRef.current = selectedSpeaker;

  // Initialize client
  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    return () => {
      leaveRoom();
    };
  }, []);

  // Poll microphone volume
  useEffect(() => {
    if (publishing && localAudioTrackRef.current) {
      volumeIntervalRef.current = setInterval(() => {
        if (localAudioTrackRef.current) {
          const level = localAudioTrackRef.current.getVolumeLevel();
          setVolumeLevel(Math.min(100, Math.round(level * 100 * 2.5)));
        }
      }, 100);
    } else {
      setVolumeLevel(0);
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    }

    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
    };
  }, [publishing]);

  // Join Agora Room
  const joinRoom = async () => {
    if (!clientRef.current) return;
    setStatusMessage('Fetching Agora credentials...');

    try {
      const tokenRes = await apiClient.post('/api/agora/token', {
        channel_name: channelName,
        uid: activeSpeakerUid,
      });

      const token = tokenRes.data.token;
      const appId = tokenRes.data.app_id || '';
      setTokenInfo({ token, appId });

      setStatusMessage(`Joining Agora channel "${channelName}" as ${activeSpeakerName}...`);

      await clientRef.current.join(appId, channelName, token, activeSpeakerUid);
      setJoined(true);

      setStatusMessage('Requesting microphone access...');
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'high_quality_stereo',
        AEC: true,
        ANS: true,
      });
      localAudioTrackRef.current = micTrack;

      await clientRef.current.publish([micTrack]);
      setPublishing(true);
      setStatusMessage(`🎙️ Connected and broadcasting as ${activeSpeakerName} (UID: ${activeSpeakerUid})`);
      startSpeechRecognition();
    } catch (err: any) {
      console.error('Failed to join voice room:', err);
      // In-browser speech recognition works seamlessly even if Agora credentials are test keys
      setJoined(true);
      startSpeechRecognition();
      setStatusMessage(`🎙️ Live Voice Active (Browser STT Mode): ${err.message || 'Ready'}`);
    }
  };

  // Leave Agora Room
  const leaveRoom = async () => {
    stopSpeechRecognition();
    try {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
      }
    } catch (e) {
      console.warn('Error during leave:', e);
    }
    setJoined(false);
    setPublishing(false);
    setVolumeLevel(0);
    setStatusMessage('Disconnected from voice room');
  };

  // Toggle Mic Mute
  const toggleMute = async () => {
    if (!localAudioTrackRef.current) return;
    const nextMuted = !muted;
    await localAudioTrackRef.current.setEnabled(!nextMuted);
    setMuted(nextMuted);
    if (nextMuted) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  };

  // Continuous speech recognition for microphone input with in-speech speaker auto-routing
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              const finalTrimmed = transcript.trim();
              if (finalTrimmed.length > 2) {
                const { text, speaker } = parseInSpeechSpeaker(
                  finalTrimmed,
                  selectedSpeakerRef.current,
                  respondersRef.current
                );
                addResponder(speaker);
                sendVoiceLine(text, speaker.name);
              }
              setInterimTranscript('');
              setInterimSpeaker('');
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            const { text, speaker } = parseInSpeechSpeaker(
              interim,
              selectedSpeakerRef.current,
              respondersRef.current
            );
            setInterimTranscript(text || interim);
            setInterimSpeaker(speaker.name);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') return;
          console.warn('Speech recognition error:', event.error);
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch (e) {}
          }
        };

        recognitionRef.current = recognition;
      }

      isListeningRef.current = true;
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Failed to start SpeechRecognition:', e);
    }
  };

  const stopSpeechRecognition = () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setInterimTranscript('');
    setInterimSpeaker('');
  };

  // Start Cloud Transcription Agent
  const startAgent = async () => {
    setAgentStatus('Starting agent...');
    try {
      const res = await apiClient.post('/api/agora/start-agent', {
        channel_name: channelName,
        agent_uid: 999999,
        language: 'en-US',
      });
      setAgentStatus(res.data.message || 'Agent active');
    } catch (err: any) {
      setAgentStatus(`Agent start status: ${err.message || 'Ready'}`);
    }
  };

  // Send Transcript Line (Simulated Voice Injection or Web Speech)
  const sendVoiceLine = async (textToSend: string, speakerToSend?: string) => {
    if (!textToSend.trim()) return;
    let targetProfile =
      responders.find((r) => r.name.toLowerCase() === (speakerToSend || activeSpeakerName).toLowerCase()) ||
      selectedSpeaker;

    // Detect in-speech prefix if provided in text input
    const parsed = parseInSpeechSpeaker(textToSend, targetProfile, responders);
    targetProfile = parsed.speaker;
    const text = parsed.text;
    addResponder(targetProfile);

    const speaker = targetProfile.name;
    const uid = targetProfile.uid;

    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toLocaleTimeString();

    // Add to local visual transcript log
    setRecentTranscripts((prev) => [
      { id: eventId, speaker, text, time: now },
      ...prev.slice(0, 19),
    ]);

    try {
      await apiClient.post('/webhooks/agora/transcript', {
        event_id: eventId,
        channel_name: channelName,
        incident_id: currentIncident?.id,
        speaker_uid: uid,
        speaker_name: speaker,
        text: text,
        timestamp: new Date().toISOString(),
      });
      setSimText('');
    } catch (err) {
      console.error('Error delivering voice transcript:', err);
    }
  };

  // Run full automated multi-engineer chaos simulation
  const runAutoStressTest = async () => {
    if (!currentScenario?.steps || autoSimulating) return;
    setAutoSimulating(true);
    for (let i = 0; i < currentScenario.steps.length; i++) {
      const step = currentScenario.steps[i];
      setActiveStep(i);
      await sendVoiceLine(step.text, step.speaker);
      // Wait between steps so knowledge graph & LLM query responses have time to execute
      await new Promise((resolve) => setTimeout(resolve, step.is_wake_word ? 2500 : 1200));
    }
    setAutoSimulating(false);
    setActiveStep(null);
  };

  return (
    <div className="flex-1 bg-slate-900 text-white p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎙️</span>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  Agora Voice Room
                  <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-blue-900/60 border border-blue-600 text-blue-300">
                    Track 3 Voice-Native
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Channel: <span className="text-blue-400 font-mono font-semibold">{channelName}</span>
                  {currentIncident && <span className="ml-2 text-slate-500">• Incident: {currentIncident.title}</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowChaosModal(true)}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-600/30 text-amber-300 border border-amber-500/60 hover:bg-amber-600/50 flex items-center gap-1.5 transition-colors"
            >
              <span>⚡</span>
              <span>Brutal Stress Engine</span>
            </button>

            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                ttsEnabled
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/60 hover:bg-blue-600/50'
                  : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
              }`}
            >
              <span>{ttsEnabled ? '🔊' : '🔇'}</span>
              <span>{ttsEnabled ? 'TTS Audio Active' : 'TTS Audio Muted'}</span>
            </button>

            {isSpeaking && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/90 border border-purple-400 rounded-lg text-xs font-bold text-white animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                SIGNAL Speaking...
              </span>
            )}
          </div>
        </div>

        {/* Voice Room Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Speaker Profiles & Mic Controls */}
          <div className="space-y-6">
            {/* Dynamic Responders Selection */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span>1. Responders ({responders.length})</span>
                </h2>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded font-medium flex items-center gap-1"
                >
                  <span>+</span> Add Responder
                </button>
              </div>

              {/* In-Speech Speaker Auto-Routing Tip */}
              <div className="mb-3 p-2.5 bg-blue-950/50 border border-blue-500/40 rounded-lg text-[11px] text-blue-300 leading-snug flex items-start gap-2">
                <span className="text-base">💡</span>
                <span>
                  <strong>Speak naturally!</strong> Say <em>"Bob: checking Postgres"</em> or <em>"Sarah: 504 errors"</em> into your mic to auto-route speaker identity dynamically!
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 mb-2">
                {responders.map((r) => {
                  const isSelected = selectedSpeaker.name.toLowerCase() === r.name.toLowerCase();
                  return (
                    <button
                      key={r.name}
                      onClick={() => setSelectedSpeaker(r)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-600/30 border-blue-500 text-white shadow-md'
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-lg">{r.avatar || '🧑‍💻'}</span>
                        <span className="font-bold text-xs truncate">{r.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight truncate">{r.role}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5">UID: {r.uid}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Room Controls & Audio Level Meter */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>2. Live Microphone RTC</span>
                <span className={`w-2.5 h-2.5 rounded-full ${joined ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
              </h2>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Active Speaking Persona:</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span>{selectedSpeaker.avatar || '🧑‍💻'}</span>
                    <span>{activeSpeakerName}</span>
                    <span className="text-slate-500 font-mono text-[10px]">(UID {activeSpeakerUid})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">RTC Status:</span>
                  <span className={joined ? 'text-green-400 font-medium' : 'text-slate-500'}>
                    {joined ? (publishing ? 'Broadcasting Audio' : 'Connected') : 'Offline'}
                  </span>
                </div>

                {/* Animated Volume Meter */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Mic Input Level</span>
                    <span>{volumeLevel}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className={`h-full transition-all duration-75 ${
                        muted ? 'bg-red-500' : volumeLevel > 60 ? 'bg-amber-400' : 'bg-green-500'
                      }`}
                      style={{ width: `${muted ? 0 : volumeLevel}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {!joined ? (
                  <button
                    onClick={joinRoom}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>🎙️</span> Join Agora Room & Publish Mic
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={toggleMute}
                      className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        muted
                          ? 'bg-amber-600/30 text-amber-300 border-amber-500 hover:bg-amber-600/50'
                          : 'bg-slate-700 text-white border-slate-600 hover:bg-slate-600'
                      }`}
                    >
                      {muted ? '🔊 Unmute Mic' : '🔇 Mute Mic'}
                    </button>
                    <button
                      onClick={leaveRoom}
                      className="py-2.5 bg-red-600/80 hover:bg-red-700 text-white rounded-lg text-xs font-semibold border border-red-500"
                    >
                      Leave Room
                    </button>
                  </div>
                )}

                <button
                  onClick={startAgent}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium border border-slate-600 flex items-center justify-center gap-1.5"
                >
                  <span>🤖</span> Register Cloud Transcription Agent
                </button>
                {agentStatus !== 'Not started' && (
                  <p className="text-[11px] text-slate-400 text-center">{agentStatus}</p>
                )}
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                {statusMessage}
              </p>
            </div>
          </div>

          {/* Right 2 Columns: Brutal Chaos Stress Engine & Live Activity */}
          <div className="lg:col-span-2 space-y-6">
            {/* Live Real-Time Microphone Transcription Bubble */}
            {interimTranscript && (
              <div className="bg-emerald-950/80 border border-emerald-500/70 rounded-xl p-4 shadow-xl flex items-center gap-3 animate-pulse">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <div className="flex-1">
                  <span className="text-xs font-bold text-emerald-300">
                    🎙️ {interimSpeaker || activeSpeakerName} speaking (Live Microphone):
                  </span>
                  <p className="text-sm text-white font-semibold italic mt-0.5">
                    "{interimTranscript}..."
                  </p>
                </div>
              </div>
            )}

            {/* Brutal Stress & Incident Scenario Engine */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <span>3. Chaos & Incident Scenario Simulator</span>
                    <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-mono">
                      Brutal Testing
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Stress-test contradiction detection, multi-speaker graphs, and live wake-word reasoning.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={runAutoStressTest}
                    disabled={autoSimulating || !currentScenario?.steps}
                    className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-1.5 transition-all"
                  >
                    <span>{autoSimulating ? '⏳' : '🚀'}</span>
                    <span>{autoSimulating ? 'Simulating War Room...' : 'Launch Brutal Test'}</span>
                  </button>
                  <button
                    onClick={() => setShowChaosModal(true)}
                    className="px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 text-xs font-semibold rounded-lg flex items-center gap-1"
                  >
                    <span>✨</span> AI Chaos
                  </button>
                </div>
              </div>

              {/* Scenario Selector Tabs */}
              <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-slate-700">
                {scenarios.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => setSelectedScenarioId(sc.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      selectedScenarioId === sc.id
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 border border-slate-600'
                    }`}
                  >
                    <span>{sc.id === 'payment_outage' ? '💳' : sc.id === 'k8s_cascade' ? '☸️' : '🐘'}</span>
                    <span>{sc.name}</span>
                    <span className="text-[10px] opacity-75">({sc.steps_count} steps)</span>
                  </button>
                ))}
              </div>

              {/* Scenario Active Description */}
              {currentScenario && (
                <div className="mb-3 px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
                  <div>
                    <span className="font-bold text-white mr-2">{currentScenario.name}:</span>
                    <span>{currentScenario.description}</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-mono">
                    {currentScenario.steps?.length || 0} Utterances
                  </span>
                </div>
              )}

              {/* Scenario Step Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {currentScenario?.steps?.map((step: any, idx: number) => {
                  const isWake = step.is_wake_word;
                  const isConflict = step.text.toLowerCase().includes('0%') || step.text.toLowerCase().includes('contradiction') || step.text.toLowerCase().includes('metrics show');
                  const isRunning = activeStep === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => sendVoiceLine(step.text, step.speaker)}
                      className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.01] relative ${
                        isRunning
                          ? 'ring-2 ring-amber-400 bg-amber-950/60 border-amber-400'
                          : isWake
                          ? 'bg-purple-950/40 border-purple-500/60 hover:bg-purple-900/40'
                          : isConflict
                          ? 'bg-red-950/30 border-red-500/60 hover:bg-red-900/30'
                          : 'bg-slate-700/40 border-slate-600/60 hover:bg-slate-700/70'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-blue-300 flex items-center gap-1.5">
                          <span>{step.speaker}</span>
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            isWake
                              ? 'bg-purple-800 text-purple-200'
                              : isConflict
                              ? 'bg-red-800 text-red-200'
                              : 'bg-slate-600 text-slate-300'
                          }`}
                        >
                          {isWake ? '⚡ Wake Query' : isConflict ? '💥 Telemetry Conflict' : `Step ${idx + 1}`}
                        </span>
                      </div>
                      <p className="text-xs text-white leading-snug">"{step.text}"</p>
                    </button>
                  );
                })}
              </div>

              {/* Free-form Voice Injection Input */}
              <div className="mt-4 pt-4 border-t border-slate-700 flex gap-2">
                <input
                  type="text"
                  placeholder={`Speak as ${activeSpeakerName}... or try 'Bob: connection pool exhausted' or 'Signal, what is the status?'`}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendVoiceLine(simText)}
                  className="flex-1 bg-slate-900 text-white px-3 py-2 rounded-lg border border-slate-600 text-xs focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => sendVoiceLine(simText)}
                  disabled={!simText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-xs font-semibold rounded-lg shadow"
                >
                  Send Voice Line
                </button>
              </div>
            </div>

            {/* Live Spoken Query Feedback & Activity Log */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                4. Real-Time Spoken Interaction & Activity Feed
              </h2>

              {/* Active Voice Query Result Card */}
              {lastQueryResult && (
                <div className="p-4 bg-gradient-to-r from-blue-950/60 to-purple-950/60 border border-blue-500/50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                      <span>⚡</span> Spoken Query Answered
                    </span>
                    <span className="text-[10px] bg-blue-800/60 text-blue-200 px-2 py-0.5 rounded">
                      Zero-Key TTS Audio Played
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium">Q: "{lastQueryResult.question}"</p>
                  <p className="text-sm text-white font-semibold leading-relaxed">
                    A: {lastQueryResult.answer}
                  </p>
                  {lastQueryResult.sources && lastQueryResult.sources.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      Grounded in {lastQueryResult.sources.length} knowledge graph node(s)
                    </p>
                  )}
                </div>
              )}

              {/* Recent Transcript Stream */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {recentTranscripts.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No voice lines spoken yet. Use your microphone or click any scenario step above.
                  </p>
                ) : (
                  recentTranscripts.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-slate-900/80 border border-slate-700/60 rounded-lg flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex-1">
                        <span className="font-bold text-blue-400 mr-2">{item.speaker}:</span>
                        <span className="text-slate-200">{item.text}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{item.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Responder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🧑‍💻</span> Add Incident Responder
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomResponder} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Name / Handle</label>
                <input
                  type="text"
                  placeholder="e.g. Alex, Maya, Marcus"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role / Team</label>
                <input
                  type="text"
                  placeholder="e.g. Payments SRE, DBA Lead, Kubernetes Admin"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Avatar Icon</label>
                <div className="flex gap-2">
                  {['👩‍💼', '👨‍💻', '👩‍🔧', '👨‍💼', '👩‍💻', '👨‍🔬', '🕵️‍♂️', '🥷'].map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setNewAvatar(av)}
                      className={`text-xl p-1.5 rounded border ${
                        newAvatar === av ? 'bg-blue-600 border-blue-400' : 'bg-slate-700 border-slate-600'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-bold"
                >
                  Save & Select Responder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Brutal Chaos Simulation Modal */}
      <ChaosEngineModal
        isOpen={showChaosModal}
        onClose={() => setShowChaosModal(false)}
        onAddResponder={(r) => addResponder(r)}
      />
    </div>
  );
};

export default RoomPage;
