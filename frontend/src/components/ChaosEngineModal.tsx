import React, { useState, useEffect } from 'react';
import { chaosApi, utterancesApi } from '../api/client';
import { useAppStore } from '../store';

interface ChaosEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddResponder?: (responder: { name: string; role: string; avatar: string; uid: number }) => void;
}

export function ChaosEngineModal({ isOpen, onClose, onAddResponder }: ChaosEngineModalProps) {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('payment_outage');
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  // Load scenarios on mount
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const res = await chaosApi.listScenarios();
        setScenarios(res.data);
      } catch (err) {
        console.error('Failed to load chaos scenarios:', err);
      }
    };
    loadScenarios();
  }, []);

  // Fetch or generate selected scenario
  const loadScenarioDetails = async (scenarioId: string, promptText?: string) => {
    if (!currentIncident) return;
    setGenerating(true);
    try {
      const res = await chaosApi.generateScenario(currentIncident.id, {
        scenario_id: scenarioId,
        prompt: promptText || undefined,
      });
      setCurrentScenario(res.data);
      if (onAddResponder && res.data.responders) {
        res.data.responders.forEach((r: any) => onAddResponder(r));
      }
    } catch (err) {
      console.error('Failed to generate scenario:', err);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentIncident) {
      loadScenarioDetails(selectedScenarioId);
    }
  }, [isOpen, selectedScenarioId, currentIncident?.id]);

  if (!isOpen) return null;

  // Single turn injection
  const injectUtterance = async (speaker: string, text: string, idx?: number) => {
    if (!currentIncident) return;
    try {
      if (idx !== undefined) setActiveStep(idx);
      await utterancesApi.add(currentIncident.id, {
        speaker_name: speaker,
        text: text,
      });
      setTimeout(() => {
        if (idx !== undefined) setActiveStep(null);
      }, 500);
    } catch (err) {
      console.error('Failed to inject utterance:', err);
    }
  };

  // Run Brutal Auto-Simulation across all utterances
  const runAutoSimulation = async () => {
    if (!currentIncident || !currentScenario?.utterances || simulating) return;
    setSimulating(true);

    const utterances = currentScenario.utterances;
    for (let i = 0; i < utterances.length; i++) {
      setActiveStep(i);
      const u = utterances[i];
      await injectUtterance(u.speaker, u.text);
      await new Promise((r) => setTimeout(r, 650));
    }

    setActiveStep(null);
    setSimulating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 via-slate-800 to-purple-950/80 p-5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-red-600/30 rounded-xl border border-red-500/50">⚡</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Incident Chaos & Stress Engine</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-900/60 border border-red-500 text-red-300 font-semibold uppercase tracking-wider">
                  Brutal Testing
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Stress-test SIGNAL with multi-engineer war room scenarios, conflicting telemetry, and NVIDIA Nemotron.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Scenario Selection Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <span>1. Select Incident Crisis Scenario</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setSelectedScenarioId(sc.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedScenarioId === sc.id
                      ? 'bg-blue-600/30 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                      : 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-white">{sc.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{sc.description}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/60 text-[10px] text-slate-400">
                    <span className="bg-slate-700 px-1.5 py-0.5 rounded font-mono">{sc.responder_count} Responders</span>
                    <span className="bg-slate-700 px-1.5 py-0.5 rounded font-mono">{sc.utterance_count} Steps</span>
                  </div>
                </button>
              ))}

              {/* AI Generator Option */}
              <button
                onClick={() => setSelectedScenarioId('ai_generated')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedScenarioId === 'ai_generated'
                    ? 'bg-purple-600/30 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                    : 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                    <span>🤖</span> AI Custom Chaos Generator
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 font-mono">
                    Nemotron
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Prompt NVIDIA Nemotron to create an entirely custom brutal incident on demand.
                </p>
              </button>
            </div>

            {/* Custom Prompt Input if AI Generator Selected */}
            {selectedScenarioId === 'ai_generated' && (
              <div className="mt-4 p-4 bg-purple-950/30 border border-purple-800/60 rounded-xl space-y-3">
                <label className="text-xs font-semibold text-purple-200">
                  Custom Incident Domain / Prompt (e.g. "Kafka consumer lag during flash sale", "AWS RDS multi-AZ failover"):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter custom incident topic or leave blank for random chaos..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="flex-1 bg-slate-900 text-white text-xs px-3 py-2 rounded-lg border border-purple-700 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={() => loadScenarioDetails('ai_generated', customPrompt)}
                    disabled={generating}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <span>{generating ? '⏳ Generating...' : '✨ Generate Chaos'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Scenario Details & War Room Roster */}
          {currentScenario && (
            <div className="space-y-4">
              <div className="bg-slate-800/70 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-white text-sm">{currentScenario.title}</h5>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 border border-red-600 text-red-300 font-mono font-bold">
                      {currentScenario.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{currentScenario.description}</p>
                </div>

                {/* Brutal Auto-Simulation Button */}
                <button
                  onClick={runAutoSimulation}
                  disabled={simulating}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg whitespace-nowrap ${
                    simulating
                      ? 'bg-amber-600 text-white animate-pulse'
                      : 'bg-red-600 hover:bg-red-700 text-white hover:scale-105'
                  }`}
                >
                  <span>{simulating ? '⏳ Ingesting Incident War Room...' : '🚀 Launch Brutal Stress Test'}</span>
                </button>
              </div>

              {/* Responder Personas Chips */}
              <div>
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Active War Room Participants ({currentScenario.responders?.length || 0} Engineers)
                </h5>
                <div className="flex flex-wrap gap-2">
                  {currentScenario.responders?.map((resp: any) => (
                    <div
                      key={resp.name}
                      className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-2 text-xs"
                    >
                      <span className="text-base">{resp.avatar || '👤'}</span>
                      <div>
                        <div className="font-semibold text-white">{resp.name}</div>
                        <div className="text-[10px] text-slate-400">{resp.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Utterance Timeline with Spoken Guide */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    War Room Utterances ({currentScenario.utterances?.length || 0} Steps)
                  </h5>
                  <span className="text-[11px] text-blue-400">
                    💡 Tip: Speak these into your mic as "Name: text" to test live voice!
                  </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {currentScenario.utterances?.map((u: any, idx: number) => {
                    const isContradiction = u.is_contradiction;
                    const isQuery = u.expected_type === 'query';
                    const isActive = activeStep === idx;

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-blue-600/40 border-blue-400 ring-2 ring-blue-400 scale-[1.01]'
                            : isContradiction
                            ? 'bg-amber-950/30 border-amber-500/50'
                            : isQuery
                            ? 'bg-purple-950/30 border-purple-500/50'
                            : 'bg-slate-800/80 border-slate-700/80'
                        }`}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-blue-300">{u.speaker}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({u.role})</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                                isContradiction
                                  ? 'bg-amber-800 text-amber-200'
                                  : isQuery
                                  ? 'bg-purple-800 text-purple-200'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {u.label || u.expected_type}
                            </span>
                            {isContradiction && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-900/80 text-red-200 font-bold">
                                ⚠️ Triggers Contradiction
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white leading-relaxed">"{u.text}"</p>
                        </div>

                        <button
                          onClick={() => injectUtterance(u.speaker, u.text, idx)}
                          disabled={simulating}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold border border-slate-600 transition-colors whitespace-nowrap"
                        >
                          {isActive ? 'Injecting...' : 'Inject Step ▶'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800/80 px-6 py-3 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
          <span>
            Test with voice: say <strong className="text-white">"Sarah: We see 504 errors"</strong> or <strong className="text-white">"Signal, what is our status?"</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
