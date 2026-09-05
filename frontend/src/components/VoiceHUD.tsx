import React, { useState } from 'react';
import { useVoiceCommander, SPEAKER_PROFILES, SpeakerProfile } from '../hooks/useVoiceCommander';
import { useAppStore } from '../store';

interface VoiceHUDProps {
  voiceCommander: ReturnType<typeof useVoiceCommander>;
}

export function VoiceHUD({ voiceCommander }: VoiceHUDProps) {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const isSpeaking = useAppStore((state) => state.isSpeaking);
  const [showPresets, setShowPresets] = useState(false);

  const {
    isListening,
    interimTranscript,
    selectedSpeaker,
    setSelectedSpeaker,
    volumeLevel,
    speechSupported,
    agoraConnected,
    statusText,
    startVoice,
    stopVoice,
    dispatchUtterance,
  } = voiceCommander;

  const quickSamples = [
    { label: 'Latency Fact', speaker: 'Alice', text: 'We verified checkout API latency spiked to 4500ms after deploy.' },
    { label: 'DB Hypothesis', speaker: 'Bob', text: 'Maybe the database connection pool is completely exhausted.' },
    { label: 'Restart Action', speaker: 'Bob', text: 'I will restart the database connection pool now.' },
    { label: 'Rollback Decision', speaker: 'Alice', text: "Let's roll back the deployment to v2.3." },
    { label: 'Ask Signal', speaker: 'Carol', text: 'Signal, what is the root cause hypothesis?' },
  ];

  return (
    <div className="bg-slate-900 border-b border-slate-700/80 px-6 py-2.5 shadow-md">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left Side: Voice Connect Button & Persona Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Main Voice Toggle Button */}
          <button
            onClick={isListening ? stopVoice : startVoice}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-400/50 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-105'
            }`}
          >
            <span className="text-sm">{isListening ? '🔴' : '🎙️'}</span>
            <span>{isListening ? 'Stop / Mute Voice' : 'Start Live Voice (Mic)'}</span>
          </button>

          {/* Active Persona Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <span className="text-[11px] text-slate-400 font-semibold px-1.5">Speaking as:</span>
            {SPEAKER_PROFILES.map((profile: SpeakerProfile) => (
              <button
                key={profile.name}
                onClick={() => setSelectedSpeaker(profile)}
                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                  selectedSpeaker.name === profile.name
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title={`${profile.role} (UID: ${profile.uid})`}
              >
                <span>{profile.avatar}</span>
                <span>{profile.name}</span>
              </button>
            ))}
          </div>

          {/* Live Mic Volume Level Meter */}
          {isListening && (
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Mic</span>
              <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.max(8, volumeLevel)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center / Right: Live Transcript Bubble & Guidance */}
        <div className="flex-1 max-w-xl mx-2">
          {interimTranscript ? (
            <div className="bg-emerald-950/70 border border-emerald-500/60 rounded-lg px-3 py-1.5 flex items-center gap-2 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-emerald-300 whitespace-nowrap">
                {selectedSpeaker.avatar} {selectedSpeaker.name} speaking:
              </span>
              <span className="text-xs text-white italic truncate">
                "{interimTranscript}..."
              </span>
            </div>
          ) : isSpeaking ? (
            <div className="bg-purple-950/70 border border-purple-500/60 rounded-lg px-3 py-1.5 flex items-center gap-2 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span className="text-xs font-bold text-purple-300">🔊 SIGNAL Incident Commander is speaking...</span>
            </div>
          ) : isListening ? (
            <div className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-semibold">Listening:</span>
                <span className="text-slate-400 truncate">
                  Speak naturally — e.g. "We verified...", "Maybe...", "I will restart..."
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono hidden lg:inline">
                {agoraConnected ? 'Agora Connected' : 'Browser STT Ready'}
              </span>
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-400 flex items-center justify-between">
              <span>Click <strong>Start Live Voice</strong> to talk directly through your microphone.</span>
              {!speechSupported && (
                <span className="text-amber-400 text-[10px]">Use Chrome/Edge for voice recognition</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Quick Simulation & Presets */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition-colors"
          >
            <span>⚡ Test Presets</span>
            <span className="text-[10px]">{showPresets ? '▲' : '▼'}</span>
          </button>

          {showPresets && (
            <div className="absolute right-6 top-28 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-80 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">One-Click Voice Ingestion</h4>
                <button onClick={() => setShowPresets(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
              </div>
              <p className="text-[11px] text-slate-400">
                Instantly inject simulated spoken utterances as if spoken by incident responders:
              </p>
              <div className="space-y-1.5">
                {quickSamples.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      dispatchUtterance(sample.text, sample.speaker);
                      setShowPresets(false);
                    }}
                    className="w-full text-left bg-slate-700/60 hover:bg-slate-700 p-2 rounded text-xs text-slate-200 transition-colors border border-slate-600/50"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-semibold text-blue-300">{sample.speaker}</span>
                      <span className="uppercase text-slate-500 font-mono">{sample.label}</span>
                    </div>
                    <p className="line-clamp-1">{sample.text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
