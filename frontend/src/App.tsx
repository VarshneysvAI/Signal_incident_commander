import { useEffect, useState } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { DocumentPanel } from './components/DocumentPanel';
import { TranscriptPanel } from './components/TranscriptPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ContradictionBanner } from './components/ContradictionBanner';
import { GapRadar } from './components/GapRadar';
import { ActionsPanel } from './components/ActionsPanel';
import { QueryBar } from './components/QueryBar';
import { DebugDrawer } from './components/DebugDrawer';
import { BridgePage } from './pages/BridgePage';
import { RoomPage } from './pages/RoomPage';
import { VoiceHUD } from './components/VoiceHUD';
import { useVoiceCommander } from './hooks/useVoiceCommander';
import { useAppStore } from './store';
import { useEventStream } from './hooks/useEventStream';
import { graphApi, documentApi, actionsApi } from './api/client';

function App() {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const setGraphData = useAppStore((state) => state.setGraphData);
  const setDocument = useAppStore((state) => state.setDocument);
  const setTimeline = useAppStore((state) => state.setTimeline);
  const setActions = useAppStore((state) => state.setActions);
  const setGaps = useAppStore((state) => state.setGaps);
  
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);

  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'room' | 'bridge'>('dashboard');

  const voiceCommander = useVoiceCommander(currentIncident?.id || null);
  useEventStream(currentIncident?.id || null);

  useEffect(() => {
    if (!currentIncident?.id) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [graphRes, docRes, timelineRes, actionsRes] = await Promise.all([
          graphApi.getGraph(currentIncident.id),
          documentApi.getDocument(currentIncident.id),
          documentApi.getTimeline(currentIncident.id),
          actionsApi.getActions(currentIncident.id),
        ]);

        setGraphData(graphRes.data);
        setDocument(docRes.data);
        setTimeline(timelineRes.data);
        setActions(actionsRes.data);
        
        if (docRes.data.gaps) {
          setGaps(docRes.data.gaps);
        }
      } catch (error) {
        console.error('Failed to load incident data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentIncident?.id, setGraphData, setDocument, setTimeline, setActions, setGaps]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      <HeaderBar viewMode={viewMode} onToggleViewMode={setViewMode} />
      
      {/* Live Voice HUD - always visible on top for instant mic feedback and persona selection */}
      <VoiceHUD voiceCommander={voiceCommander} />

      {loading && (
        <div className="bg-blue-600 text-white text-center py-1.5 text-xs font-semibold z-50">
          Loading incident data...
        </div>
      )}

      {viewMode === 'room' ? (
        <RoomPage />
      ) : viewMode === 'bridge' ? (
        <div className="flex-1 overflow-y-auto">
          <BridgePage channelName={currentIncident?.channel_name || currentIncident?.title || 'incident-channel'} />
        </div>
      ) : (
        <>
          <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
            {/* Left Column: Causal Knowledge Graph & Contradiction Alert (58% width) */}
            <div className="w-[58%] flex flex-col gap-2 min-w-0 h-full">
              <ContradictionBanner />
              <div className="flex-1 min-h-0 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
                <KnowledgeGraph />
              </div>
            </div>

            {/* Right Column: Unified Incident Management Console (42% width) */}
            <div className="w-[42%] flex flex-col min-w-0 h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
              {/* Tab Navigation Strip */}
              <div className="bg-slate-800 border-b border-slate-700 px-3 py-2 flex items-center justify-between gap-1 overflow-x-auto flex-shrink-0">
                <div className="flex items-center gap-1">
                  {[
                    { id: 'timeline', label: 'Timeline', icon: '⏱️' },
                    { id: 'actions', label: 'Actions', icon: '📋' },
                    { id: 'document', label: 'Document', icon: '📄' },
                    { id: 'transcript', label: 'Transcript', icon: '💬' },
                    { id: 'radar', label: 'Gap Radar', icon: '🎯' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Tab Panel */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === 'timeline' && <TimelinePanel />}
                {activeTab === 'actions' && <ActionsPanel />}
                {activeTab === 'document' && <DocumentPanel />}
                {activeTab === 'transcript' && <TranscriptPanel />}
                {activeTab === 'radar' && <GapRadar />}
              </div>
            </div>
          </div>

          <QueryBar />
          <DebugDrawer />
        </>
      )}
    </div>
  );
}

export default App;
