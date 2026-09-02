import React from 'react';

import { useAppStore } from '../store';
import { EventLog } from '../types';

export function DebugDrawer() {
  const debugDrawerOpen = useAppStore((state) => state.debugDrawerOpen);
  const events = useAppStore((state) => state.events);
  const setDebugDrawerOpen = useAppStore((state) => state.setDebugDrawerOpen);

  if (!debugDrawerOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 h-64 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">Debug Drawer - Event Stream</h3>
        <button
          onClick={() => setDebugDrawerOpen(false)}
          className="text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {events.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">
            No events yet
          </div>
        ) : (
          events.map((event: EventLog) => (
            <div key={event.id} className="bg-slate-800 rounded p-2 border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-blue-400">#{event.id}</span>
                <span className="text-xs text-green-400">{event.event_type}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(event.payload_json, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
