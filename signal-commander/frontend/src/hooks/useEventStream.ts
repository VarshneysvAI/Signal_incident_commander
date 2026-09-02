import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { eventsApi } from '../api/client';
import { EventLog } from '../types';

export function useEventStream(incidentId: string | null) {
  const addEvent = useAppStore((state) => state.addEvent);
  const addNode = useAppStore((state) => state.addNode);
  const addEdge = useAppStore((state) => state.addEdge);
  const updateNode = useAppStore((state) => state.updateNode);
  const addAction = useAppStore((state) => state.addAction);
  const updateAction = useAppStore((state) => state.updateAction);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!incidentId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const url = eventsApi.getEventStream(incidentId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: EventLog = JSON.parse(event.data);
        addEvent(data);

        // Process different event types
        switch (data.event_type) {
          case 'node_created':
            if (data.payload_json?.node) {
              addNode(data.payload_json.node);
            }
            break;
          case 'node_updated':
            if (data.payload_json?.node_id && data.payload_json?.updates) {
              updateNode(data.payload_json.node_id, data.payload_json.updates);
            }
            break;
          case 'edge_created':
            if (data.payload_json?.edge) {
              addEdge(data.payload_json.edge);
            }
            break;
          case 'action_created':
            if (data.payload_json?.action) {
              addAction(data.payload_json.action);
            }
            break;
          case 'action_updated':
            if (data.payload_json?.action_id && data.payload_json?.updates) {
              updateAction(data.payload_json.action_id, data.payload_json.updates);
            }
            break;
          default:
            // Other events are logged but don't trigger specific updates
            break;
        }
      } catch (err) {
        console.error('Error processing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      // EventSource will automatically attempt to reconnect
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [incidentId, addEvent, addNode, addEdge, updateNode, addAction, updateAction]);

  return null;
}
