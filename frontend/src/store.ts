import { create } from 'zustand';
import { Incident, GraphData, ActionItem, Gap, IncidentDocument, Utterance, EventLog } from './types';

interface AppState {
  // Current incident
  currentIncident: Incident | null;
  setCurrentIncident: (incident: Incident | null) => void;

  // Graph data
  graphData: GraphData | null;
  setGraphData: (data: GraphData) => void;
  updateNode: (nodeId: number, updates: Partial<any>) => void;
  addNode: (node: any) => void;
  addEdge: (edge: any) => void;

  // Document
  document: IncidentDocument | null;
  setDocument: (doc: IncidentDocument) => void;

  // Timeline
  timeline: Utterance[];
  setTimeline: (timeline: Utterance[]) => void;
  addUtterance: (utterance: Utterance) => void;

  // Actions
  actions: ActionItem[];
  setActions: (actions: ActionItem[]) => void;
  updateAction: (actionId: number, updates: Partial<ActionItem>) => void;
  addAction: (action: ActionItem) => void;

  // Gaps
  gaps: Gap[];
  setGaps: (gaps: Gap[]) => void;

  // Events (SSE)
  events: EventLog[];
  addEvent: (event: EventLog) => void;
  clearEvents: () => void;

  activeTab: 'timeline' | 'actions' | 'document' | 'transcript' | 'radar';
  setActiveTab: (tab: 'timeline' | 'actions' | 'document' | 'transcript' | 'radar') => void;
  
  rightTab: 'radar' | 'actions';
  setRightTab: (tab: 'radar' | 'actions') => void;

  debugDrawerOpen: boolean;
  setDebugDrawerOpen: (open: boolean) => void;

  // Query & TTS
  lastQueryResult: { question: string; answer: string; sources: number[] } | null;
  setLastQueryResult: (result: { question: string; answer: string; sources: number[] } | null) => void;
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (speaking: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Current incident
  currentIncident: null,
  setCurrentIncident: (incident) => set({ currentIncident: incident }),

  // Graph data
  graphData: null,
  setGraphData: (data) => set({ graphData: data }),
  updateNode: (nodeId, updates) => {
    const current = get().graphData;
    if (!current) return;
    set({
      graphData: {
        ...current,
        nodes: current.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
      },
    });
  },
  addNode: (node) => {
    const current = get().graphData;
    if (!current) return;
    set({
      graphData: {
        ...current,
        nodes: [...current.nodes, node],
      },
    });
  },
  addEdge: (edge) => {
    const current = get().graphData;
    if (!current) return;
    set({
      graphData: {
        ...current,
        edges: [...current.edges, edge],
      },
    });
  },

  // Document
  document: null,
  setDocument: (doc) => set({ document: doc }),

  // Timeline
  timeline: [],
  setTimeline: (timeline) => set({ timeline }),
  addUtterance: (utterance) => {
    const timeline = get().timeline;
    set({ timeline: [...timeline, utterance] });
  },

  // Actions
  actions: [],
  setActions: (actions) => set({ actions }),
  updateAction: (actionId, updates) => {
    const actions = get().actions;
    set({
      actions: actions.map((a) => (a.id === actionId ? { ...a, ...updates } : a)),
    });
  },
  addAction: (action) => {
    const actions = get().actions;
    set({ actions: [...actions, action] });
  },

  // Gaps
  gaps: [],
  setGaps: (gaps) => set({ gaps }),

  // Events
  events: [],
  addEvent: (event) => {
    const events = get().events;
    set({ events: [...events, event] });
  },
  clearEvents: () => set({ events: [] }),

  // UI state
  activeTab: 'timeline',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  rightTab: 'radar',
  setRightTab: (tab) => set({ rightTab: tab }),

  debugDrawerOpen: false,
  setDebugDrawerOpen: (open) => set({ debugDrawerOpen: open }),

  // Query & TTS
  lastQueryResult: null,
  setLastQueryResult: (result) => set({ lastQueryResult: result }),
  ttsEnabled: true,
  setTtsEnabled: (enabled) => set({ ttsEnabled: enabled }),
  isSpeaking: false,
  setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
}));
