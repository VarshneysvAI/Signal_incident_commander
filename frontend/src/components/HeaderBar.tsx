import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { incidentsApi, exportApi, API_BASE_URL } from '../api/client';
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

  // Email report state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const handleSendEmail = async () => {
    if (!currentIncident) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await exportApi.emailReport(currentIncident.id, {
        recipient_email: recipientEmail.trim() || undefined,
        note: emailNote.trim() || undefined,
      });
      setEmailStatus({
        type: 'success',
        message: res.data.message || `Email report dispatched to ${res.data.recipient}!`,
      });
      setTimeout(() => {
        if (res.data.status === 'sent' || res.data.status === 'mock_sent') {
          setShowEmailModal(false);
          setEmailStatus(null);
          setEmailNote('');
        }
      }, 2500);
    } catch (error: any) {
      console.error('Failed to send email:', error);
      setEmailStatus({
        type: 'error',
        message: error.response?.data?.detail || 'Failed to dispatch email report.',
      });
    } finally {
      setSendingEmail(false);
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
              <button
                onClick={() => setShowEmailModal(true)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium border border-slate-600 flex items-center gap-1"
                title="Email post-mortem and digest to team"
              >
                <span>📧</span> Email
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

      {/* Email Report Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>📧</span> Dispatch Incident Report
              </h3>
              <button
                onClick={() => { setShowEmailModal(false); setEmailStatus(null); }}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Deliver a post-mortem summary, timeline, causal graph highlights, and action items directly to your inbox.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Recipient Email (defaults to configured notification email)
              </label>
              <input
                type="email"
                placeholder="e.g. personal@gmail.com or sre-team@company.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Add Note or Executive Summary (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Mitigation verified in prod. SRE team conducting full review tomorrow at 10 AM."
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm placeholder-slate-400"
              />
            </div>

            {emailStatus && (
              <div
                className={`text-xs p-3 rounded border ${
                  emailStatus.type === 'success'
                    ? 'bg-green-900/40 border-green-600 text-green-200'
                    : 'bg-red-900/40 border-red-600 text-red-200'
                }`}
              >
                {emailStatus.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowEmailModal(false); setEmailStatus(null); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded text-sm font-semibold flex items-center gap-1.5"
              >
                {sendingEmail ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Report</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

