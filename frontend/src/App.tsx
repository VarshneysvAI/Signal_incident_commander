import { useEffect, useState } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { DocumentPanel } from './components/DocumentPanel';
import { TranscriptPanel } from './components/TranscriptPanel';
import { GapRadar } from './components/GapRadar';
import { ActionsPanel } from './components/ActionsPanel';
import { QueryBar } from './components/QueryBar';
import { DebugDrawer } from './components/DebugDrawer';
import { BridgePage } from './pages/BridgePage';
import { RoomPage } from './pages/RoomPage';
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
  const rightTab = useAppStore((state) => state.rightTab);
  const setRightTab = useAppStore((state) => state.setRightTab);

  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'room' | 'bridge'>('dashboard');

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
    <div className="h-screen flex flex-col bg-slate-900">
      <HeaderBar viewMode={viewMode} onToggleViewMode={setViewMode} />
      
      {loading && (
        <div className="absolute top-16 left-0 right-0 bg-blue-600 text-white text-center py-2 z-50">
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
          <div className="flex-1 flex overflow-hidden p-4 gap-4">
            <div className="w-[45%] flex flex-col">
              <KnowledgeGraph />
            </div>

        <div className="w-[30%] flex flex-col">
          <div className="bg-slate-800 rounded-t-lg border border-slate-700 px-4 py-2 flex gap-4">
            <button
              onClick={() => setActiveTab('document')}
              className={`text-sm font-medium pb-2 border-b-2 ${
                activeTab === 'document'
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Document
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`text-sm font-medium pb-2 border-b-2 ${
                activeTab === 'timeline'
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`text-sm font-medium pb-2 border-b-2 ${
                activeTab === 'transcript'
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Transcript
            </button>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {activeTab === 'document' && <DocumentPanel />}
            {activeTab === 'timeline' && <TranscriptPanel />}
            {activeTab === 'transcript' && <TranscriptPanel />}
          </div>
        </div>

        <div className="w-[25%] flex flex-col">
          <div className="bg-slate-800 rounded-t-lg border border-slate-700 px-4 py-2 flex gap-4">
            <button
              onClick={() => setRightTab('radar')}
              className={`text-sm font-medium pb-2 border-b-2 ${
                rightTab === 'radar'
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Gap Radar
            </button>
            <button
              onClick={() => setRightTab('actions')}
              className={`text-sm font-medium pb-2 border-b-2 ${
                rightTab === 'actions'
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Actions
            </button>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {rightTab === 'radar' && <GapRadar />}
            {rightTab === 'actions' && <ActionsPanel />}
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
