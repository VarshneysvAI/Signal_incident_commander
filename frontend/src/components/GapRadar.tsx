import React from 'react';

import { useAppStore } from '../store';
import { Gap } from '../types';

export function GapRadar() {
  const gaps = useAppStore((state) => state.gaps);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 border-red-500';
      case 'high': return 'bg-orange-600 border-orange-500';
      case 'medium': return 'bg-yellow-600 border-yellow-500';
      case 'low': return 'bg-gray-600 border-gray-500';
      default: return 'bg-slate-600 border-slate-500';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '⚪';
      default: return '⚪';
    }
  };

  if (gaps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        No gaps detected
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-900 rounded-lg border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">Gap Radar</h3>
      </div>
      
      <div className="p-4 space-y-3">
        {gaps.map((gap: Gap, idx: number) => (
          <div 
            key={idx} 
            className={`p-3 rounded-lg border-l-4 ${getSeverityColor(gap.severity)}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{getSeverityIcon(gap.severity)}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm capitalize">{gap.severity}</span>
                  {gap.count && (
                    <span className="text-xs text-slate-300 bg-slate-700 px-2 py-0.5 rounded">
                      {gap.count}
                    </span>
                  )}
                </div>
                <p className="text-slate-200 text-sm mt-1">{gap.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
