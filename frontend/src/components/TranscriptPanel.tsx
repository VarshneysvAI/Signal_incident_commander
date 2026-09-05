import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { utterancesApi } from '../api/client';

const SRE_QUICK_PRESETS = [
  { label: 'Latency Spike (Fact)', speaker: 'Alice', text: 'We verified that checkout API latency spiked to 4500ms after the v2.4 deploy.' },
  { label: 'Redis Hypothesis', speaker: 'Bob', text: 'Maybe the redis cluster is evicting session keys under heavy traffic.' },
  { label: 'Cache Restart (Action)', speaker: 'Bob', text: 'I will restart the cache replicas and monitor memory.' },
  { label: 'Rollback Decision', speaker: 'Alice', text: "Let's roll back the deployment to v2.3 to restore service." },
  { label: 'Status Query', speaker: 'Dave', text: 'Signal, what is the current root cause hypothesis?' },
];

export function TranscriptPanel() {
  const [speakerName, setSpeakerName] = useState('Alice');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const timeline = useAppStore((state) => state.timeline);
  const currentIncident = useAppStore((state) => state.currentIncident);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  const handleAddUtterance = async (customSpeaker?: string, customText?: string) => {
    if (!currentIncident) return;
    const sName = (customSpeaker || speakerName).trim() || 'Unknown';
    const sText = (customText || text).trim();
    if (!sText) return;

    setSending(true);
    try {
      await utterancesApi.add(currentIncident.id, { speaker_name: sName, text: sText });
      if (!customText) setText('');
    } catch (error) {
      console.error('Failed to add utterance:', error);
    } finally {
      setSending(false);
    }
  };

  const getTypeBadgeColor = (parserType?: string) => {
    switch (parserType) {
      case 'fact': return 'bg-green-600/30 text-green-300 border-green-500/50';
      case 'hypothesis': return 'bg-yellow-600/30 text-yellow-300 border-yellow-500/50';
      case 'decision': return 'bg-blue-600/30 text-blue-300 border-blue-500/50';
      case 'action': return 'bg-orange-600/30 text-orange-300 border-orange-500/50';
      case 'question': return 'bg-purple-600/30 text-purple-300 border-purple-500/50';
      default: return 'bg-slate-700 text-slate-400 border-slate-600';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <h3 className="text-sm font-semibold text-white">Live Utterances & Ingestion</h3>
        </div>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
          {timeline.length} utterances
        </span>
      </div>

      {/* Quick Presets Bar */}
      <div className="bg-slate-800/60 px-4 py-2 border-b border-slate-700 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap mr-1">⚡ Quick Inject:</span>
        {SRE_QUICK_PRESETS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handleAddUtterance(preset.speaker, preset.text)}
            className="text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-0.5 rounded whitespace-nowrap border border-slate-600 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Utterances List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {timeline.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-12 flex flex-col items-center gap-2">
            <span className="text-3xl">🎙️</span>
            <p>No utterances recorded yet.</p>
            <p className="text-xs text-slate-500">Click a Quick Inject button above or type an utterance below.</p>
          </div>
        ) : (
          timeline.map((utterance) => (
            <div key={utterance.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700 space-y-1.5 hover:border-slate-600 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-xs tracking-wide">{utterance.speaker_name}</span>
                  {utterance.parser_type && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getTypeBadgeColor(utterance.parser_type)}`}>
                      {utterance.parser_type}
                    </span>
                  )}
                  {utterance.topic && utterance.topic !== 'general' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300 font-mono">
                      #{utterance.topic}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {new Date(utterance.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{utterance.text}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="border-t border-slate-700 p-3.5 space-y-2.5 bg-slate-800">
        {/* Speaker Picker Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] text-slate-400 font-semibold mr-1">Speaker:</span>
          {['Alice', 'Bob', 'Carol', 'Dave'].map((name) => (
            <button
              key={name}
              onClick={() => setSpeakerName(name)}
              className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                speakerName === name
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
              }`}
            >
              {name}
            </button>
          ))}
          <input
            type="text"
            placeholder="Other..."
            value={!['Alice', 'Bob', 'Carol', 'Dave'].includes(speakerName) ? speakerName : ''}
            onChange={(e) => setSpeakerName(e.target.value)}
            className="bg-slate-700 text-white px-2 py-0.5 rounded border border-slate-600 text-xs w-20 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Text Input Row */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={`Type ${speakerName}'s utterance here...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddUtterance()}
            className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm placeholder-slate-400"
          />
          <button
            onClick={() => handleAddUtterance()}
            disabled={sending || !text.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white px-4 py-2 rounded text-sm font-semibold transition-colors flex items-center gap-1"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
