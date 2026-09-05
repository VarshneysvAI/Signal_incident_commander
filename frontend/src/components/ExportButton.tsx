import React from 'react';

import { useAppStore } from '../store';

export function ExportButton() {
  const currentIncident = useAppStore((state) => state.currentIncident);

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

  if (!currentIncident) return null;

  return (
    <div className="flex gap-2">
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
    </div>
  );
}
