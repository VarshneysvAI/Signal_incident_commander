import React, { useState } from 'react';
import { useAppStore } from '../store';
import { actionsApi } from '../api/client';
import { ActionItem } from '../types';

export function ActionsPanel() {
  const actions = useAppStore((state) => state.actions);
  const updateAction = useAppStore((state) => state.updateAction);
  const addAction = useAppStore((state) => state.addAction);
  const currentIncident = useAppStore((state) => state.currentIncident);

  const [filter, setFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignOwnerName, setAssignOwnerName] = useState('');
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleCreateAction = async () => {
    if (!currentIncident || !newLabel.trim()) return;
    try {
      const res = await actionsApi.create(currentIncident.id, {
        label: newLabel.trim(),
        proposed_owner: newOwner.trim() || undefined,
        status: newOwner.trim() ? 'committed' : 'unassigned',
      });
      addAction(res.data);
      setNewLabel('');
      setNewOwner('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to create action:', err);
    }
  };

  const handleStatusChange = async (actionId: number, nextStatus: string, owner?: string) => {
    if (!currentIncident) return;
    setLoadingId(actionId);
    try {
      const res = await actionsApi.updateStatus(actionId, nextStatus, owner);
      updateAction(actionId, res.data);
      setAssigningId(null);
      setAssignOwnerName('');
    } catch (err) {
      console.error('Failed to update action status:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleConfirmOwner = async (action: ActionItem) => {
    const owner = assignOwnerName.trim() || action.proposed_owner || 'Unknown';
    setLoadingId(action.id);
    try {
      await actionsApi.confirm(action.id, owner);
      updateAction(action.id, { confirmed_owner: owner, status: 'committed' });
      setAssigningId(null);
      setAssignOwnerName('');
    } catch (err) {
      console.error('Failed to confirm action owner:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (actionId: number) => {
    setLoadingId(actionId);
    try {
      await actionsApi.reject(actionId);
      updateAction(actionId, { status: 'rejected' });
    } catch (err) {
      console.error('Failed to reject action:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'unassigned':
        return { label: 'UNASSIGNED', bg: 'bg-slate-700 text-slate-300 border-slate-600', dot: 'bg-slate-400' };
      case 'pending_owner_confirmation':
        return { label: 'PENDING CONFIRM', bg: 'bg-amber-900/40 text-amber-300 border-amber-600/50', dot: 'bg-amber-400' };
      case 'committed':
        return { label: 'COMMITTED', bg: 'bg-blue-900/40 text-blue-300 border-blue-600/50', dot: 'bg-blue-400' };
      case 'in_progress':
        return { label: 'IN PROGRESS', bg: 'bg-purple-900/40 text-purple-300 border-purple-600/50 animate-pulse', dot: 'bg-purple-400' };
      case 'completed':
        return { label: 'COMPLETED', bg: 'bg-emerald-900/40 text-emerald-300 border-emerald-600/50', dot: 'bg-emerald-400' };
      case 'rejected':
        return { label: 'REJECTED', bg: 'bg-red-900/30 text-red-400 border-red-800/40 line-through', dot: 'bg-red-400' };
      default:
        return { label: status.toUpperCase(), bg: 'bg-slate-700 text-slate-300 border-slate-600', dot: 'bg-slate-400' };
    }
  };

  const filtered = actions.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'active') return a.status === 'committed' || a.status === 'in_progress' || a.status === 'pending_owner_confirmation';
    if (filter === 'completed') return a.status === 'completed';
    return a.status === filter;
  });

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      {/* Panel Header */}
      <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h3 className="text-sm font-semibold text-white">Action Items</h3>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {actions.filter(a => a.status !== 'completed' && a.status !== 'rejected').length} open
            </span>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <span>{showAddForm ? '✕ Cancel' : '+ New'}</span>
          </button>
        </div>

        {/* Quick Filter Bar */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: `All (${actions.length})` },
            { id: 'active', label: 'Active' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'completed', label: 'Done' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`text-xs px-2.5 py-1 rounded font-medium border whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Inline Add Action Form */}
        {showAddForm && (
          <div className="bg-slate-900/90 p-3 rounded border border-slate-600 space-y-2 animate-fadeIn">
            <input
              type="text"
              placeholder="e.g. Roll back cache deployment to v1.2..."
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-slate-800 text-white px-3 py-1.5 rounded border border-slate-600 text-xs focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Assignee (e.g. Alice)"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="flex-1 bg-slate-800 text-white px-3 py-1.5 rounded border border-slate-600 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCreateAction}
                disabled={!newLabel.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-semibold"
              >
                Create Action
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-10 flex flex-col items-center gap-2">
            <span className="text-2xl">⚡</span>
            <p>No action items matching this filter.</p>
            <p className="text-xs text-slate-500">Create one above or speak an assignment in the voice room.</p>
          </div>
        ) : (
          filtered.map((action: ActionItem) => {
            const badge = getStatusBadge(action.status);
            const isLoading = loadingId === action.id;

            return (
              <div
                key={action.id}
                className={`bg-slate-800 rounded-lg p-3.5 border transition-all space-y-2.5 ${
                  action.status === 'completed'
                    ? 'border-emerald-800/40 opacity-75'
                    : action.status === 'in_progress'
                    ? 'border-purple-600/70 shadow-md shadow-purple-950/30'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {/* Top Row: Label & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium leading-snug flex-1 ${
                    action.status === 'completed' ? 'line-through text-slate-400' : 'text-white'
                  }`}>
                    {action.label}
                  </p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1.5 whitespace-nowrap ${badge.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    <span>{badge.label}</span>
                  </span>
                </div>

                {/* Owner Information */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span>Owner:</span>
                    {action.confirmed_owner ? (
                      <span className="text-white font-semibold bg-slate-700 px-2 py-0.5 rounded">
                        👤 {action.confirmed_owner}
                      </span>
                    ) : action.proposed_owner ? (
                      <span className="text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                        Proposed: {action.proposed_owner}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Unassigned</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">#{action.id}</span>
                </div>

                {/* Owner Assignment Input */}
                {assigningId === action.id && (
                  <div className="flex gap-2 pt-1 border-t border-slate-700/60">
                    <input
                      type="text"
                      placeholder="Enter owner name..."
                      value={assignOwnerName}
                      onChange={(e) => setAssignOwnerName(e.target.value)}
                      className="flex-1 bg-slate-700 text-white px-2.5 py-1 rounded border border-slate-600 text-xs focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleConfirmOwner(action)}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setAssigningId(null)}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700/50">
                  {/* Pending confirmation state */}
                  {action.status === 'pending_owner_confirmation' && assigningId !== action.id && (
                    <>
                      <button
                        onClick={() => handleConfirmOwner(action)}
                        disabled={isLoading}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span>✓ Confirm Owner</span>
                      </button>
                      <button
                        onClick={() => setAssigningId(action.id)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded text-xs transition-colors"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => handleReject(action.id)}
                        disabled={isLoading}
                        className="bg-red-700/80 hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {/* Unassigned state */}
                  {action.status === 'unassigned' && assigningId !== action.id && (
                    <button
                      onClick={() => setAssigningId(action.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                    >
                      + Assign Owner
                    </button>
                  )}

                  {/* Committed state -> can start work or mark done */}
                  {action.status === 'committed' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(action.id, 'in_progress')}
                        disabled={isLoading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span>🚀 Start Working</span>
                      </button>
                      <button
                        onClick={() => handleStatusChange(action.id, 'completed')}
                        disabled={isLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span>✅ Mark Done</span>
                      </button>
                    </>
                  )}

                  {/* In Progress state -> mark done or pause */}
                  {action.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(action.id, 'completed')}
                        disabled={isLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
                      >
                        <span>✅ Mark Completed</span>
                      </button>
                      <button
                        onClick={() => handleStatusChange(action.id, 'committed')}
                        disabled={isLoading}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded text-xs transition-colors"
                      >
                        <span>⏸️ Pause</span>
                      </button>
                    </>
                  )}

                  {/* Completed state -> reopen */}
                  {action.status === 'completed' && (
                    <button
                      onClick={() => handleStatusChange(action.id, 'committed')}
                      disabled={isLoading}
                      className="text-slate-400 hover:text-white px-2.5 py-1 rounded text-xs transition-colors"
                    >
                      ↺ Reopen Task
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
