import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Utterance } from '../types';

export function TimelinePanel() {
  const timeline = useAppStore((state) => state.timeline);
  const setLastQueryResult = useAppStore((state) => state.setLastQueryResult);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const getBadgeDetails = (type?: string) => {
    switch (type) {
      case 'fact':
        return { label: 'FACT', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '✅' };
      case 'hypothesis':
        return { label: 'HYPOTHESIS', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '💡' };
      case 'decision':
        return { label: 'DECISION', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40', icon: '🎯' };
      case 'action':
        return { label: 'ACTION', bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: '⚡' };
      case 'question':
        return { label: 'QUESTION', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '❓' };
      case 'off_topic':
        return { label: 'OFF-TOPIC', bg: 'bg-slate-700 text-slate-400 border-slate-600', icon: '💬' };
      default:
        return { label: 'NOTE', bg: 'bg-slate-700 text-slate-300 border-slate-600', icon: '📝' };
    }
  };

  const filtered = timeline.filter((item) => {
    if (filter !== 'all' && item.parser_type !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.text.toLowerCase().includes(q) ||
        item.speaker_name.toLowerCase().includes(q) ||
        (item.topic && item.topic.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header with Title and Filters */}
      <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">⏱️</span>
            <h3 className="text-sm font-semibold text-white">Incident Chronology</h3>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {filtered.length} / {timeline.length}
            </span>
          </div>
          
          <input
            type="text"
            placeholder="Filter events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-700 text-white text-xs px-2.5 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500 w-36"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'fact', label: 'Facts' },
            { id: 'hypothesis', label: 'Hypotheses' },
            { id: 'decision', label: 'Decisions' },
            { id: 'action', label: 'Actions' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`text-xs px-2.5 py-1 rounded font-medium border transition-colors ${
                filter === tab.id
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-700/60 text-slate-300 border-slate-600 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical Timeline List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filtered.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-12 flex flex-col items-center gap-2">
            <span className="text-3xl">⏳</span>
            <p>No timeline events match the current filter.</p>
            <p className="text-xs text-slate-500">Speak in the Voice Room or send an utterance in Transcript.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
            {filtered.map((event: Utterance, idx: number) => {
              const badge = getBadgeDetails(event.parser_type);
              return (
                <div key={event.id || idx} className="relative group">
                  {/* Timeline Dot Node */}
                  <span className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-slate-900 border-2 border-blue-500 group-hover:scale-125 transition-transform" />

                  {/* Card Container */}
                  <div className="bg-slate-800/90 hover:bg-slate-800 rounded-lg p-3 border border-slate-700 transition-colors shadow-sm space-y-2">
                    {/* Card Top Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-xs tracking-wide">
                          {event.speaker_name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border flex items-center gap-1 ${badge.bg}`}>
                          <span>{badge.icon}</span>
                          <span>{badge.label}</span>
                        </span>
                        {event.topic && event.topic !== 'general' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300 font-mono">
                            #{event.topic}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    {/* Utterance Content */}
                    <p className="text-slate-200 text-sm leading-relaxed">
                      {event.text}
                    </p>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                      <div className="flex items-center gap-2">
                        {event.confidence && (
                          <span className={`capitalize ${
                            event.confidence === 'high' ? 'text-emerald-400' :
                            event.confidence === 'medium' ? 'text-amber-400' : 'text-slate-400'
                          }`}>
                            Confidence: {event.confidence}
                          </span>
                        )}
                        {event.polarity && (
                          <span className={event.polarity === 'negative' ? 'text-red-400' : 'text-emerald-400'}>
                            • {event.polarity}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setLastQueryResult({
                            question: `Timeline Context: ${event.text}`,
                            answer: `Event recorded at ${new Date(event.timestamp).toLocaleTimeString()} by ${event.speaker_name}. Classified as ${event.parser_type?.toUpperCase()} relating to domain #${event.topic || 'general'}.`,
                            sources: [event.id || 0]
                          });
                        }}
                        className="text-slate-400 hover:text-blue-400 text-xs flex items-center gap-1 transition-colors"
                        title="Inspect details in Query Bar"
                      >
                        <span>🔍 Inspect</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
