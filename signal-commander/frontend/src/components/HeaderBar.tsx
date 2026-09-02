import React from 'react';

import { useAppStore } from '../store';
import { incidentsApi } from '../api/client';
import { Incident } from '../types';

export function HeaderBar() {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const setCurrentIncident = useAppStore((state) => state.setCurrentIncident);
  const debugDrawerOpen = useAppStore((state) => state.debugDrawerOpen);
  const setDebugDrawerOpen = useAppStore((state) => state.setDebugDrawerOpen);

  const [title, setTitle] = React.useState('');
  const [channelName, setChannelName] = React.useState('');

  const handleCreateIncident = async () => {
    if (!title.trim()) return;
    try {
      const response = await incidentsApi.create({ title, channel_name: channelName || undefined });
      setCurrentIncident(response.data as Incident);
    } catch (error) {
      console.error('Failed to create incident:', error);
    }
  };

  const handleCloseIncident = async () => {
    if (!currentIncident) return;
    try {
      await incidentsApi.close(currentIncident.id);
      setCurrentIncident({ ...currentIncident, status: 'closed' });
    } catch (error) {
      console.error('Failed to close incident:', error);
    }
  };

  const handleExport = async (format: 'markdown' | 'json') => {
    if (!currentIncident) return;
    try {
      const response = await fetch(`http://localhost:8000/api/incidents/${currentIncident.id}/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incident-${currentIncident.id}.${format === 'markdown' ? 'md' : 'json'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const duration = currentIncident && currentIncident.started_at
    ? Math.floor((Date.now() - new Date(currentIncident.started_at).getTime()) / 60000)
    : 0;

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">SIGNAL Commander</h1>
          {currentIncident ? (
            <div className="flex items-center gap-3">
              <span className="text-slate-300">{currentIncident.title}</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                currentIncident.status === 'active' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-600 text-white'
              }`}>
                {currentIncident.status.toUpperCase()}
              </span>
              <span className="text-slate-400 text-sm">{duration} min</span>
              <span className="flex items-center gap-2 px-2 py-1 bg-blue-600 rounded text-xs text-white">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                LISTENING
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Incident title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-700 text-white px-3 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Channel name (optional)"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="bg-slate-700 text-white px-3 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCreateIncident}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded text-sm font-medium"
              >
                Create Incident
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {currentIncident && (
            <>
              <button
                onClick={() => handleExport('markdown')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
              >
                Export MD
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
              >
                Export JSON
              </button>
              {currentIncident.status === 'active' && (
                <button
                  onClick={handleCloseIncident}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded text-sm font-medium"
                >
                  Close Incident
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setDebugDrawerOpen(!debugDrawerOpen)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
          >
            Debug
          </button>
        </div>
      </div>
    </header>
  );
}
