import React from 'react';

import { useAppStore } from '../store';

export function DocumentPanel() {
  const document = useAppStore((state) => state.document);

  if (!document) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        No document available
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-900 rounded-lg border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 sticky top-0">
        <h3 className="text-sm font-semibold text-white">Incident Document</h3>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Summary */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h4 className="text-lg font-bold text-white mb-2">{document.summary.title}</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400">ID:</span>
              <span className="text-white ml-2">{document.summary.id}</span>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                document.summary.status === 'active' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-600 text-white'
              }`}>
                {document.summary.status.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Started:</span>
              <span className="text-white ml-2">{new Date(document.summary.started_at).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400">Duration:</span>
              <span className="text-white ml-2">{document.summary.duration_minutes} min</span>
            </div>
          </div>
        </div>

        {/* Sections */}
        {document.sections.map((section, idx) => (
          <div key={idx} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h4 className="text-md font-semibold text-white mb-3">{section.title}</h4>
            {section.items.length === 0 ? (
              <p className="text-slate-500 text-sm italic">None</p>
            ) : (
              <ul className="space-y-2">
                {section.items.map((item, itemIdx) => (
                  <li key={itemIdx} className={`text-sm ${item.status === 'faded' || item.status === 'rejected' ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex-1">{item.content}</span>
                      {item.speaker && (
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          — {item.speaker} {item.timestamp && `(${new Date(item.timestamp).toLocaleTimeString()})`}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Gaps */}
        {document.gaps && document.gaps.length > 0 && (
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700">
            <h4 className="text-md font-semibold text-red-400 mb-3">Unresolved Risks & Gaps</h4>
            <ul className="space-y-2">
              {document.gaps.map((gap, idx) => (
                <li key={idx} className="text-sm text-red-300">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    gap.severity === 'critical' ? 'bg-red-500' :
                    gap.severity === 'high' ? 'bg-orange-500' :
                    gap.severity === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`} />
                  {gap.description} {gap.count ? `(${gap.count})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
