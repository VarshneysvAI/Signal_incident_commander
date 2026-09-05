import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { eventsApi, graphApi, documentApi, actionsApi } from '../api/client';
import { EventLog } from '../types';
import { ttsSpeaker } from '../utils/ttsSpeaker';

export function useEventStream(incidentId: string | null) {
  const addEvent = useAppStore((state) => state.addEvent);
  const setGraphData = useAppStore((state) => state.setGraphData);
  const setDocument = useAppStore((state) => state.setDocument);
  const setTimeline = useAppStore((state) => state.setTimeline);
  const setActions = useAppStore((state) => state.setActions);
  const setGaps = useAppStore((state) => state.setGaps);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!incidentId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const refreshData = async () => {
      try {
        const [graphRes, docRes, timelineRes, actionsRes] = await Promise.all([
          graphApi.getGraph(incidentId),
          documentApi.getDocument(incidentId),
          documentApi.getTimeline(incidentId),
          actionsApi.getActions(incidentId),
        ]);
        setGraphData(graphRes.data);
        setDocument(docRes.data);
        setTimeline(timelineRes.data);
        setActions(actionsRes.data);
        if (docRes.data.gaps) {
          setGaps(docRes.data.gaps);
        }
      } catch (err) {
        console.error('Error refreshing incident state:', err);
      }
    };

    const url = eventsApi.getEventStream(incidentId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: EventLog = JSON.parse(event.data);
        addEvent(data);

        // When any live event arrives, refresh the current incident data
        const refreshEventTypes = [
          'node_created',
          'node_updated',
          'edge_created',
          'action_created',
          'action_updated',
          'contradiction_detected',
          'utterance_received',
          'incident_created',
          'incident_closed',
          'followup_due',
          'voice_query_answered',
          'query_answered',
        ];

        if (refreshEventTypes.includes(data.event_type)) {
          refreshData();
        }

        // Handle voice query answers with Web Speech API zero-key TTS
        if (data.event_type === 'voice_query_answered' || data.event_type === 'query_answered') {
          const payload = data.payload_json || {};
          const answer = payload.answer;
          const question = payload.question || payload.clean_question || 'Voice Query';
          const sources = payload.grounded_node_ids || [];

          if (answer) {
            useAppStore.getState().setLastQueryResult({ question, answer, sources });

            // High-Fidelity Studio Neural TTS Voice Output
            if (useAppStore.getState().ttsEnabled) {
              ttsSpeaker.speak(answer, {
                onStart: () => useAppStore.getState().setIsSpeaking(true),
                onEnd: () => useAppStore.getState().setIsSpeaking(false),
                onError: () => useAppStore.getState().setIsSpeaking(false),
              });
            }
          }
        }
      } catch (err) {
        console.error('Error processing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [incidentId, addEvent, setGraphData, setDocument, setTimeline, setActions, setGaps]);

  return null;
}

