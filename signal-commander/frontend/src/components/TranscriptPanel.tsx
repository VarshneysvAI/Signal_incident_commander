import { useState } from 'react';

import { useAppStore } from '../store';
import { utterancesApi } from '../api/client';

export function TranscriptPanel() {
  const [speakerName, setSpeakerName] = useState('');
  const [text, setText] = useState('');
  const timeline = useAppStore((state) => state.timeline);
  const currentIncident = useAppStore((state) => state.currentIncident);

  const handleAddUtterance = async () => {
    if (!currentIncident || !text.trim()) return;
    
    const speaker = speakerName.trim() || 'Unknown';
    try {
      await utterancesApi.add(currentIncident.id, { speaker_name: speaker, text });
      setText('');
    } catch (error) {
      console.error('Failed to add utterance:', error);
    }
  };

  const getTypeBadgeColor = (parserType?: string) => {
    switch (parserType) {
      case 'fact': return 'bg-green-600';
      case 'hypothesis': return 'bg-yellow-600';
      case 'decision': return 'bg-blue-600';
      case 'action': return 'bg-orange-600';
      case 'question': return 'bg-purple-600';
      case 'off_topic': return 'bg-gray-600';
      default: return 'bg-slate-600';
    }
  };

  const getConfidenceColor = (confidence?: string) => {
    switch (confidence) {
      case 'high': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-orange-400';
      case 'uncertain': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">Transcript & Text Input</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {timeline.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">
            No utterances yet. Type below to add manually.
          </div>
        ) : (
          timeline.map((utterance) => (
            <div key={utterance.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{utterance.speaker_name}</span>
                  {utterance.parser_type && (
                    <span className={`px-2 py-0.5 rounded text-xs text-white ${getTypeBadgeColor(utterance.parser_type)}`}>
                      {utterance.parser_type}
                    </span>
                  )}
                </div>
                <span className={`text-xs ${getConfidenceColor(utterance.confidence)}`}>
                  {utterance.confidence}
                </span>
              </div>
              <p className="text-slate-300 text-sm">{utterance.text}</p>
              <div className="mt-2 text-xs text-slate-500">
                {new Date(utterance.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-700 p-4 space-y-3 bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Speaker name"
            value={speakerName}
            onChange={(e) => setSpeakerName(e.target.value)}
            className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type utterance here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddUtterance()}
            className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
          />
          <button
            onClick={handleAddUtterance}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
