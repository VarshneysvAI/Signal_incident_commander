import React, { useState } from 'react';
import { useVoiceCommander, SpeakerProfile } from '../hooks/useVoiceCommander';
import { useAppStore } from '../store';
import { ChaosEngineModal } from './ChaosEngineModal';

interface VoiceHUDProps {
  voiceCommander: ReturnType<typeof useVoiceCommander>;
}

export function VoiceHUD({ voiceCommander }: VoiceHUDProps) {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const isSpeaking = useAppStore((state) => state.isSpeaking);
  const [showPresets, setShowPresets] = useState(false);
  const [showChaosModal, setShowChaosModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newAvatar, setNewAvatar] = useState('👩‍💻');

  const {
    responders,
    addResponder,
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

  const handleAddCustomResponder = () => {
    if (!newName.trim()) return;
    addResponder({
      name: newName.trim(),
      role: newRole.trim() || 'Incident Responder',
      avatar: newAvatar,
      uid: Math.floor(1000 + Math.random() * 8999),
    });
    setNewName('');
    setNewRole('');
    setShowAddModal(false);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-700/80 px-6 py-2.5 shadow-md">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left Side: Voice Connect Button & Persona Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
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
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 overflow-x-auto max-w-xl">
            <span className="text-[10px] text-slate-400 font-semibold px-1.5 whitespace-nowrap">Speaking as:</span>
            {responders.map((profile: SpeakerProfile) => (
              <button
                key={profile.name}
                onClick={() => setSelectedSpeaker(profile)}
                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
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

            {/* Add Custom Responder Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-2 py-1 rounded text-xs text-blue-400 hover:text-white hover:bg-slate-700 font-bold transition-colors"
              title="Add any custom engineer or responder persona"
            >
              + Add
            </button>
          </div>

          {/* Live Mic Volume Level Meter */}
          {isListening && (
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Mic</span>
              <div className="w-14 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.max(8, volumeLevel)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center / Right: Live Transcript Bubble & Guidance */}
        <div className="flex-1 max-w-lg mx-2">
          {interimTranscript ? (
            <div className="bg-emerald-950/70 border border-emerald-500/60 rounded-lg px-3 py-1.5 flex items-center gap-2 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs text-white font-medium italic truncate">
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
              <div className="flex items-center gap-1.5 text-slate-300 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-semibold">Listening:</span>
                <span className="text-slate-400 truncate">
                  Speak naturally or say "Name: phrase" (e.g. "Bob: I restarted DB")
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono hidden xl:inline">
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

        {/* Right: Chaos / Stress Engine & Quick Presets */}
        <div className="flex items-center gap-2">
          {/* Brutal Stress Test / Chaos Button */}
          <button
            onClick={() => setShowChaosModal(true)}
            className="text-xs bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white font-bold px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5 transition-all hover:scale-105"
            title="Launch multi-engineer stress test war rooms and AI Chaos"
          >
            <span>⚡</span>
            <span>Brutal Stress Test</span>
          </button>

          {/* Quick Presets Dropdown */}
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition-colors"
          >
            <span>Presets</span>
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

      {/* Add Responder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <h4 className="text-sm font-bold text-white">Add Incident Responder</h4>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Responder Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Vikram, Sarah, Devansh"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">Role / Job Title:</label>
                <input
                  type="text"
                  placeholder="e.g. Core Banking Lead, DevOps SRE"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">Avatar:</label>
                <div className="flex gap-2 text-lg">
                  {['👩‍💼', '👨‍💻', '👩‍🔧', '👨‍💼', '👩‍💻', '👨‍🔬', '🕵️', '🧑‍🚀'].map((em) => (
                    <button
                      key={em}
                      onClick={() => setNewAvatar(em)}
                      className={`p-1.5 rounded-lg border ${newAvatar === em ? 'border-blue-500 bg-blue-600/30' : 'border-slate-700'}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomResponder}
                disabled={!newName.trim()}
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-bold rounded-lg"
              >
                Add Responder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chaos Engine Modal */}
      <ChaosEngineModal
        isOpen={showChaosModal}
        onClose={() => setShowChaosModal(false)}
        onAddResponder={addResponder}
      />
    </div>
  );
}
