import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { queryApi } from '../api/client';
import { ttsSpeaker } from '../utils/ttsSpeaker';

export function QueryBar() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState('');
  const currentIncident = useAppStore((state) => state.currentIncident);
  const setLastQueryResult = useAppStore((state) => state.setLastQueryResult);
  const lastQueryResult = useAppStore((state) => state.lastQueryResult);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);
  const isSpeaking = useAppStore((state) => state.isSpeaking);
  const setIsSpeaking = useAppStore((state) => state.setIsSpeaking);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceQuery();
    };
  }, []);

  const handleQuery = async (questionText?: string) => {
    const q = (questionText || query).trim();
    if (!currentIncident || !q) return;

    setLoading(true);
    setVoiceInterim('');
    try {
      const response = await queryApi.query(currentIncident.id, {
        speaker_name: 'User',
        text: q,
      });

      const answer = response.data.answer;
      setLastQueryResult({
        question: q,
        answer: answer,
        sources: response.data.grounded_node_ids || [],
      });
      setQuery('');

      // Studio-Grade Neural Voice Audio Output
      if (ttsEnabled && answer) {
        ttsSpeaker.speak(answer, {
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    } catch (error) {
      console.error('Failed to query:', error);
      setLastQueryResult({
        question: q,
        answer: 'Sorry, I could not process that query. Please ensure an incident is active and try again.',
        sources: [],
      });
    } finally {
      setLoading(false);
    }
  };

  // Start always-live voice query listening
  const startVoiceQuery = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition requires Chrome or Edge browser.');
      return;
    }

    if (recognitionRef.current) {
      stopVoiceQuery();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalText = transcript.trim();
          if (finalText.length > 2) {
            setVoiceInterim('');
            handleQuery(finalText);
          }
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setVoiceInterim(interim);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      console.warn('Voice query recognition error:', event.error);
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setVoiceListening(true);

    try {
      recognition.start();
    } catch (e) {
      console.warn('Failed to start voice query:', e);
    }
  };

  const stopVoiceQuery = () => {
    isListeningRef.current = false;
    setVoiceListening(false);
    setVoiceInterim('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
  };

  const stopSpeaking = () => {
    ttsSpeaker.stop();
    setIsSpeaking(false);
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur border-t border-slate-700 px-4 py-3">
      {/* Main Query Input Row */}
      <div className="flex items-center gap-2">
        {/* Always-Live Voice Query Button */}
        <button
          onClick={voiceListening ? stopVoiceQuery : startVoiceQuery}
          disabled={!currentIncident}
          title={voiceListening ? 'Stop listening' : 'Ask SIGNAL anything by voice — always live'}
          className={`px-3 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all border shadow-sm ${
            voiceListening
              ? 'bg-red-600 hover:bg-red-700 text-white border-red-400 ring-2 ring-red-400/40 animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400/60 hover:scale-105'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="text-sm">{voiceListening ? '🔴' : '🎙️'}</span>
          <span className="hidden sm:inline">{voiceListening ? 'Listening...' : 'Ask Live'}</span>
        </button>

        {/* Text Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder={
              voiceListening
                ? '🎙️ Listening... speak your question now'
                : currentIncident
                ? "Ask SIGNAL anything... (e.g., 'What is the root cause?', 'Who owns the database?', 'What actions are pending?')"
                : 'Create or select an incident first...'
            }
            value={voiceInterim || query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVoiceInterim('');
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
            disabled={!currentIncident || loading}
            className={`w-full bg-slate-900 text-white px-4 py-2.5 rounded-lg border text-sm focus:outline-none disabled:opacity-50 transition-all ${
              voiceListening
                ? 'border-emerald-500/60 bg-emerald-950/30 italic text-emerald-200 placeholder-emerald-400/60'
                : 'border-slate-600 focus:border-blue-500 placeholder-slate-500'
            }`}
          />
          {voiceInterim && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </div>

        {/* Send Button */}
        <button
          onClick={() => handleQuery()}
          disabled={!currentIncident || loading || (!query.trim() && !voiceInterim)}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm"
        >
          {loading ? '⏳ Thinking...' : '🚀 Ask'}
        </button>

        {/* TTS Toggle */}
        <button
          onClick={() => {
            if (isSpeaking) stopSpeaking();
            setTtsEnabled(!ttsEnabled);
          }}
          title={ttsEnabled ? 'Voice answers ON — SIGNAL will speak' : 'Voice answers OFF — text only'}
          className={`px-3 py-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
            ttsEnabled
              ? 'bg-blue-600/30 text-blue-300 border-blue-500/60 hover:bg-blue-600/50'
              : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
          }`}
        >
          <span>{ttsEnabled ? '🔊' : '🔇'}</span>
          <span className="hidden sm:inline">{ttsEnabled ? 'Voice ON' : 'Voice OFF'}</span>
        </button>

        {/* Speaking Indicator & Stop Button */}
        {isSpeaking && (
          <button
            onClick={stopSpeaking}
            className="flex items-center gap-2 px-3 py-2.5 bg-purple-600/90 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold animate-pulse border border-purple-400 shadow-md"
            title="Click to interrupt SIGNAL"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>SIGNAL speaking... (Stop)</span>
          </button>
        )}
      </div>

      {/* Answer Response Card */}
      {lastQueryResult && (
        <div className="mt-3 bg-slate-900 rounded-xl p-4 border border-slate-700 shadow-inner">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <p className="text-slate-400 text-xs font-medium truncate">{lastQueryResult.question}</p>
                {ttsEnabled && (
                  <span className="text-[10px] text-blue-400 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-700/50 whitespace-nowrap flex-shrink-0">
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
