import { useState } from 'react';
import { useAppStore } from '../store';
import { actionsApi } from '../api/client';

export function ResponderIntelPanel() {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const graphData = useAppStore((state) => state.graphData);
  const actions = useAppStore((state) => state.actions);
  const setActions = useAppStore((state) => state.setActions);
  const timeline = useAppStore((state) => state.timeline);

  const [selectedResponder, setSelectedResponder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');

  // 1. Discover all unique responders dynamically from the graph, timeline, and actions
  const discoveredMap = new Map<string, {
    name: string;
    factsCount: number;
    hypothesesCount: number;
    actionsCount: number;
    questionsCount: number;
    contradictionsCount: number;
    nodes: any[];
    assignedActions: any[];
    timelineEvents: any[];
  }>();

  // Aggregate from graph nodes
  if (graphData?.nodes) {
    graphData.nodes.forEach((node) => {
      const speaker = node.speaker || (node.metadata_json?.owner) || 'System';
      if (!speaker || speaker.toLowerCase() === 'system' || speaker.toLowerCase() === 'incident') return;

      if (!discoveredMap.has(speaker)) {
        discoveredMap.set(speaker, {
          name: speaker,
          factsCount: 0,
          hypothesesCount: 0,
          actionsCount: 0,
          questionsCount: 0,
          contradictionsCount: 0,
          nodes: [],
          assignedActions: [],
          timelineEvents: [],
        });
      }

      const entry = discoveredMap.get(speaker)!;
      entry.nodes.push(node);

      if (node.type === 'fact') entry.factsCount++;
      if (node.type === 'hypothesis') entry.hypothesesCount++;
      if (node.type === 'action') entry.actionsCount++;
      if (node.type === 'question') entry.questionsCount++;
      if (node.status === 'challenged' || node.status === 'rejected') entry.contradictionsCount++;
    });
  }

  // Aggregate from Action Items
  if (actions) {
    actions.forEach((act) => {
      const owner = act.confirmed_owner || act.proposed_owner;
      if (owner && owner.toLowerCase() !== 'unassigned') {
        if (!discoveredMap.has(owner)) {
          discoveredMap.set(owner, {
            name: owner,
            factsCount: 0,
            hypothesesCount: 0,
            actionsCount: 0,
            questionsCount: 0,
            contradictionsCount: 0,
            nodes: [],
            assignedActions: [],
            timelineEvents: [],
          });
        }
        const entry = discoveredMap.get(owner)!;
        if (!entry.assignedActions.some((a) => a.id === act.id)) {
          entry.assignedActions.push(act);
        }
      }
    });
  }

  // Aggregate from Timeline
  if (timeline) {
    timeline.forEach((evt) => {
      const spk = evt.speaker_name;
      if (spk && discoveredMap.has(spk)) {
        discoveredMap.get(spk)!.timelineEvents.push(evt);
      }
    });
  }

  const respondersList = Array.from(discoveredMap.values());
  const activeProfile = selectedResponder ? discoveredMap.get(selectedResponder) : respondersList[0] || null;

  // Handle action confirmation
  const handleConfirmAction = async (actionId: number, ownerName: string) => {
    try {
      await actionsApi.confirm(actionId, ownerName);
      if (currentIncident) {
        const res = await actionsApi.getActions(currentIncident.id);
        setActions(res.data);
      }
    } catch (e) {
      console.error('Failed to confirm action:', e);
    }
  };

  const getAvatarForName = (name: string) => {
    const avatars = ['👩‍💼', '👨‍💻', '👩‍🔧', '👨‍💼', '👩‍💻', '👨‍🔬', '🕵️', '🧑‍🚀', '🧑‍💻'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatars[Math.abs(hash) % avatars.length];
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Top Banner: Dynamic Responders Discovery Summary */}
      <div className="p-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Discovered Incident Responders ({respondersList.length})
            </h4>
            <p className="text-[10px] text-slate-400">
              100% Dynamic — Created automatically as voices speak in Google Meet / Agora.
            </p>
          </div>
        </div>

        {respondersList.length === 0 && (
          <span className="text-xs text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40">
            Waiting for audio stream...
          </span>
        )}
      </div>

      {respondersList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl">
            🎙️
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">No Participants Discovered Yet</p>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              As soon as anyone speaks in Google Meet or Agora, SIGNAL will dynamically identify their voice, create their profile, and isolate their contributions here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Participant Roster List */}
          <div className="w-1/3 border-r border-slate-700/80 overflow-y-auto p-2 space-y-1.5 bg-slate-950/40">
            {respondersList.map((resp) => {
              const isSelected = (activeProfile?.name === resp.name);
              const totalItems = resp.factsCount + resp.hypothesesCount + resp.assignedActions.length;

              return (
                <button
                  key={resp.name}
                  onClick={() => setSelectedResponder(resp.name)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-600/30 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                      : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getAvatarForName(resp.name)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-white truncate block">{resp.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {totalItems} contributions
                      </span>
                    </div>
                  </div>

                  {/* Micro Badges */}
                  <div className="flex items-center gap-1 mt-1 text-[9px]">
                    {resp.factsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300 font-mono">
                        {resp.factsCount} facts
                      </span>
                    )}
                    {resp.assignedActions.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-300 font-mono">
                        {resp.assignedActions.length} tasks
                      </span>
                    )}
                    {resp.contradictionsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-red-900/60 text-red-300 font-mono animate-pulse">
                        ⚠️ conflict
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Isolated Intel Dossier for Selected Participant */}
          {activeProfile && (
            <div className="w-2/3 overflow-y-auto p-4 space-y-4 bg-slate-900">
              {/* Header Card for Selected Responder */}
              <div className="bg-slate-800 border border-slate-700 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-3xl p-2 bg-slate-700/60 rounded-xl">
                    {getAvatarForName(activeProfile.name)}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {activeProfile.name}
                      <span className="text-[10px] bg-blue-900/60 text-blue-300 border border-blue-600 px-2 py-0.2 rounded-full">
                        Dynamic Responder
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Isolated contributions and delegated ownership for this person.
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <span className="font-mono text-white font-bold">{activeProfile.assignedActions.length}</span> Tasks Assigned
                </div>
              </div>

              {/* 1. Tasks & Actions Owned by this Person */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>📋</span> Tasks Assigned to {activeProfile.name} ({activeProfile.assignedActions.length})
                </h4>

                {activeProfile.assignedActions.length === 0 ? (
                  <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 text-[11px] text-slate-500 italic">
                    No action items currently delegated to {activeProfile.name}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeProfile.assignedActions.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 bg-slate-800 rounded-xl border border-amber-500/40 shadow space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white leading-snug">{act.label}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                              act.status === 'committed'
                                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-600'
                                : act.status === 'resolved'
                                ? 'bg-blue-900/60 text-blue-300 border border-blue-600'
                                : 'bg-amber-900/60 text-amber-300 border border-amber-600'
                            }`}
                          >
                            {act.status}
                          </span>
                        </div>

                        {act.status !== 'committed' && act.status !== 'resolved' && (
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-700">
                            <span className="text-[10px] text-slate-400">Confirm ownership:</span>
                            <button
                              onClick={() => handleConfirmAction(act.id, activeProfile.name)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors"
                            >
                              ✓ Confirm as {activeProfile.name}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Facts Observed by this Person */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span>🟢</span> Facts Reported by {activeProfile.name} ({activeProfile.factsCount})
                </h4>

                {activeProfile.nodes.filter((n) => n.type === 'fact').length === 0 ? (
                  <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 text-[11px] text-slate-500 italic">
                    No verified telemetry facts logged yet from {activeProfile.name}.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeProfile.nodes
                      .filter((n) => n.type === 'fact')
                      .map((n) => (
                        <div
                          key={n.id}
                          className="p-2.5 bg-emerald-950/20 border border-emerald-500/40 rounded-lg text-xs text-white"
                        >
                          <span className="font-semibold">{n.label}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">Topic: {n.topic}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* 3. Hypotheses Formed by this Person */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
                  <span>🟡</span> Hypotheses / Theories by {activeProfile.name} ({activeProfile.hypothesesCount})
                </h4>

                {activeProfile.nodes.filter((n) => n.type === 'hypothesis').length === 0 ? (
                  <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 text-[11px] text-slate-500 italic">
                    No hypotheses proposed yet by {activeProfile.name}.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeProfile.nodes
                      .filter((n) => n.type === 'hypothesis')
                      .map((n) => {
                        const isContradicted = n.status === 'challenged' || n.status === 'rejected';
                        return (
                          <div
                            key={n.id}
                            className={`p-2.5 rounded-lg text-xs border ${
                              isContradicted
                                ? 'bg-red-950/30 border-red-500/60 text-red-200'
                                : 'bg-yellow-950/20 border-yellow-500/40 text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{n.label}</span>
                              {isContradicted && (
                                <span className="text-[10px] bg-red-900 text-red-200 px-1.5 py-0.2 rounded font-mono font-bold">
                                  ⚠️ Challenged by Telemetry
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">Status: {n.status}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* 4. Questions Asked by this Person */}
              {activeProfile.nodes.filter((n) => n.type === 'question').length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <span>🟣</span> Spoken Inquiries by {activeProfile.name}
                  </h4>
                  <div className="space-y-1.5">
                    {activeProfile.nodes
                      .filter((n) => n.type === 'question')
                      .map((n) => (
                        <div
                          key={n.id}
                          className="p-2.5 bg-purple-950/20 border border-purple-500/40 rounded-lg text-xs text-white"
                        >
                          "{n.label}"
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
