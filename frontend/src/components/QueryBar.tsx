import { useState } from 'react';

import { useAppStore } from '../store';
import { queryApi } from '../api/client';

export function QueryBar() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const currentIncident = useAppStore((state) => state.currentIncident);
  const setLastQueryResult = useAppStore((state) => state.setLastQueryResult);
  const lastQueryResult = useAppStore((state) => state.lastQueryResult);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);
  const isSpeaking = useAppStore((state) => state.isSpeaking);
  const setIsSpeaking = useAppStore((state) => state.setIsSpeaking);

  const handleQuery = async () => {
    if (!currentIncident || !query.trim()) return;
    
    setLoading(true);
    try {
      const response = await queryApi.query(currentIncident.id, {
        speaker_name: 'User',
        text: query,
      });
      
      const answer = response.data.answer;
      setLastQueryResult({
        question: query,
        answer: answer,
        sources: response.data.grounded_node_ids || [],
      });
      setQuery('');

      // If TTS enabled, speak answer
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && ttsEnabled && answer) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(answer);
        utter.onstart = () => setIsSpeaking(true);
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      }
    } catch (error) {
      console.error('Failed to query:', error);
    } finally {
      setLoading(false);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="bg-slate-800 border-t border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Ask SIGNAL... (e.g., 'Signal, what is our status?' or 'Signal, who owns the database?')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
          disabled={!currentIncident || loading}
          className="flex-1 bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 text-sm"
        />
        <button
          onClick={handleQuery}
          disabled={!currentIncident || loading || !query.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-5 py-2 rounded font-medium text-sm transition-colors"
        >
          {loading ? 'Asking...' : 'Ask'}
        </button>

        {/* TTS Toggle Button */}
        <button
          onClick={() => {
            if (isSpeaking) stopSpeaking();
            setTtsEnabled(!ttsEnabled);
          }}
          title={ttsEnabled ? 'Mute Voice Audio (TTS Enabled)' : 'Unmute Voice Audio (TTS Muted)'}
          className={`px-3 py-2 rounded text-sm font-semibold border flex items-center gap-1.5 transition-colors ${
            ttsEnabled
              ? 'bg-blue-600/30 text-blue-300 border-blue-500/60 hover:bg-blue-600/50'
              : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
          }`}
        >
          <span>{ttsEnabled ? '🔊' : '🔇'}</span>
          <span className="hidden sm:inline text-xs">{ttsEnabled ? 'Voice ON' : 'Voice OFF'}</span>
        </button>

        {/* Live Speaking Indicator & Interrupt Button */}
        {isSpeaking && (
          <button
            onClick={stopSpeaking}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600/90 hover:bg-purple-700 text-white rounded text-xs font-semibold animate-pulse border border-purple-400"
            title="Click to interrupt speech"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            <span>SIGNAL speaking... (Stop)</span>
          </button>
        )}
      </div>

      {lastQueryResult && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-400 text-xs font-medium">{lastQueryResult.question}</p>
                {ttsEnabled && (
                  <span className="text-[10px] text-blue-400 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-700/50">
                    Voice Response
                  </span>
                )}
              </div>
              <p className="text-white text-sm leading-relaxed">{lastQueryResult.answer}</p>
              {lastQueryResult.sources && lastQueryResult.sources.length > 0 && (
                <p className="text-slate-500 text-xs mt-2">
                  Sources: {lastQueryResult.sources.length} grounded node(s)
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
