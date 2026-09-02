import { useState } from 'react';

import { useAppStore } from '../store';
import { actionsApi } from '../api/client';
import { ActionItem } from '../types';

export function ActionsPanel() {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const actions = useAppStore((state) => state.actions);
  const updateAction = useAppStore((state) => state.updateAction);
  const currentIncident = useAppStore((state) => state.currentIncident);

  const handleConfirm = async (action: ActionItem) => {
    if (!currentIncident) return;
    const owner = ownerName.trim() || action.proposed_owner || 'Unknown';
    try {
      await actionsApi.confirm(action.id, owner);
      updateAction(action.id, { confirmed_owner: owner, status: 'committed' });
      setConfirmingId(null);
      setOwnerName('');
    } catch (error) {
      console.error('Failed to confirm action:', error);
    }
  };

  const handleReject = async (actionId: number) => {
    if (!currentIncident) return;
    try {
      await actionsApi.reject(actionId);
      updateAction(actionId, { status: 'rejected' });
    } catch (error) {
      console.error('Failed to reject action:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unassigned': return 'bg-gray-600';
      case 'pending_owner_confirmation': return 'bg-yellow-600';
      case 'committed': return 'bg-blue-600';
      case 'in_progress': return 'bg-purple-600';
      case 'completed': return 'bg-green-600';
      case 'rejected': return 'bg-red-600';
      default: return 'bg-slate-600';
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-900 rounded-lg border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">Action Items</h3>
      </div>
      
      <div className="p-4 space-y-3">
        {actions.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">
            No action items yet
          </div>
        ) : (
          actions.map((action) => (
            <div key={action.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-white text-sm flex-1">{action.label}</p>
                <span className={`px-2 py-0.5 rounded text-xs text-white ${getStatusColor(action.status)}`}>
                  {action.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              
              <div className="text-xs text-slate-400 mb-3">
                {action.proposed_owner && (
                  <span>Proposed: {action.proposed_owner} | </span>
                )}
                {action.confirmed_owner ? (
                  <span>Owner: <span className="text-white">{action.confirmed_owner}</span></span>
                ) : (
                  <span>Owner: <span className="text-yellow-400">Unconfirmed</span></span>
                )}
              </div>

              {action.status !== 'rejected' && action.status !== 'completed' && confirmingId === action.id && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Owner name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="flex-1 bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 text-xs"
                  />
                  <button
                    onClick={() => handleConfirm(action)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {action.status === 'pending_owner_confirmation' && confirmingId !== action.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingId(action.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Confirm Owner
                  </button>
                  <button
                    onClick={() => handleReject(action.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Reject
                  </button>
                </div>
              )}

              {action.status === 'unassigned' && (
                <button
                  onClick={() => setConfirmingId(action.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                >
                  Assign Owner
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
