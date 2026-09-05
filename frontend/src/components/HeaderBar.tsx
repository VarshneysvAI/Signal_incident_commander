import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { incidentsApi, API_BASE_URL } from '../api/client';
import { Incident } from '../types';

interface HeaderBarProps {
  viewMode?: 'dashboard' | 'room' | 'bridge';
  onToggleViewMode?: (mode: 'dashboard' | 'room' | 'bridge') => void;
}

export function HeaderBar({ viewMode = 'dashboard', onToggleViewMode }: HeaderBarProps) {
  const currentIncident = useAppStore((state) => state.currentIncident);
  const setCurrentIncident = useAppStore((state) => state.setCurrentIncident);
  const debugDrawerOpen = useAppStore((state) => state.debugDrawerOpen);
  const setDebugDrawerOpen = useAppStore((state) => state.setDebugDrawerOpen);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [channelName, setChannelName] = useState('');

  const loadIncidents = async () => {
    try {
      const res = await incidentsApi.list();
      setIncidents(res.data);
      if (!currentIncident && res.data.length > 0) {
        setCurrentIncident(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to list incidents:', err);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleCreateIncident = async () => {
    if (!title.trim()) return;
    try {
      const response = await incidentsApi.create({ title: title.trim(), channel_name: channelName.trim() || undefined });
      const created = response.data as Incident;
      setCurrentIncident(created);
      setTitle('');
      setChannelName('');
      setShowCreateModal(false);
      loadIncidents();
    } catch (error) {
      console.error('Failed to create incident:', error);
    }
  };

  const handleCloseIncident = async () => {
    if (!currentIncident) return;
    try {
      await incidentsApi.close(currentIncident.id);
      setCurrentIncident({ ...currentIncident, status: 'closed' });
      loadIncidents();
    } catch (error) {
      console.error('Failed to close incident:', error);
    }
  };

  const handleExport = async (format: 'markdown' | 'json') => {
    if (!currentIncident) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${currentIncident.id}/export?format=${format}`);
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
    ? Math.max(0, Math.floor((Date.now() - new Date(currentIncident.started_at).getTime()) / 60000))
    : 0;

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span>
            <h1 className="text-lg font-bold text-white tracking-wide">SIGNAL Commander</h1>
          </div>

          {/* Incident Selector Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={currentIncident?.id || ''}
              onChange={(e) => {
                const selected = incidents.find((inc) => inc.id === e.target.value);
                if (selected) setCurrentIncident(selected);
              }}
              className="bg-slate-700 text-white text-sm px-3 py-1.5 rounded border border-slate-600 focus:outline-none focus:border-blue-500 max-w-[200px] truncate"
            >
              <option value="" disabled>Select Incident</option>
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.title} ({inc.status})
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1"
            >
              <span>+</span> New
            </button>
          </div>

          {currentIncident && (
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                currentIncident.status === 'active' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-600 text-white'
              }`}>
                {currentIncident.status.toUpperCase()}
              </span>
              <span className="text-slate-400 text-xs">{duration} min</span>
              {currentIncident.status === 'active' && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-600/80 border border-blue-500 rounded text-xs text-white">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  LISTENING
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleViewMode && (
            <>
              <button
                onClick={() => onToggleViewMode('dashboard')}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  viewMode === 'dashboard'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                }`}
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => onToggleViewMode('room')}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors flex items-center gap-1 ${
                  viewMode === 'room'
                    ? 'bg-green-600 text-white border-green-500 shadow-md'
                    : 'bg-slate-700 text-green-300 border-green-500/50 hover:bg-slate-600'
                }`}
              >
                <span>🎙️</span> Voice Room
              </button>
              <button
                onClick={() => onToggleViewMode('bridge')}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  viewMode === 'bridge'
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-slate-700 text-purple-300 border-purple-500/50 hover:bg-slate-600'
                }`}
              >
                🌉 Bridge (Meet)
              </button>
            </>
          )}

          {currentIncident && (
            <>
              <button
                onClick={() => handleExport('markdown')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium border border-slate-600"
              >
                Export MD
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium border border-slate-600"
              >
                Export JSON
              </button>
              {currentIncident.status === 'active' && (
                <button
                  onClick={handleCloseIncident}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium"
                >
                  Close Incident
                </button>
              )}
            </>
          )}

          <button
            onClick={() => setDebugDrawerOpen(!debugDrawerOpen)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium border border-slate-600"
          >
            Debug
          </button>
        </div>
      </div>

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create New Incident</h3>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Incident Title</label>
              <input
                type="text"
                placeholder="e.g. Payment Gateway Outage"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Channel Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. inc-payment-2026"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIncident}
                disabled={!title.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded text-sm font-semibold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

