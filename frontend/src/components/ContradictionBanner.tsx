import React, { useState } from 'react';
import { useAppStore } from '../store';
import { GraphNode, GraphEdge } from '../types';

export function ContradictionBanner() {
  const graphData = useAppStore((state) => state.graphData);
  const setLastQueryResult = useAppStore((state) => state.setLastQueryResult);
  const [dismissed, setDismissed] = useState<boolean>(false);

  if (!graphData || dismissed) return null;

  // Find contradiction edges
  const contradictionEdges = graphData.edges.filter((e: GraphEdge) => e.type === 'contradicts');
  const needsReviewNodes = graphData.nodes.filter((n: GraphNode) => n.status === 'needs_review');

  if (contradictionEdges.length === 0 && needsReviewNodes.length === 0) {
    return null;
  }

  // Get nodes involved in contradiction
  const contradictions = contradictionEdges.map((edge) => {
    const fromNode = graphData.nodes.find((n) => n.id === edge.from_node_id);
    const toNode = graphData.nodes.find((n) => n.id === edge.to_node_id);
    return {
      edge,
      from: fromNode,
      to: toNode,
    };
  });

  return (
    <div className="bg-amber-950/80 border-b border-amber-600/60 px-6 py-2.5 flex items-center justify-between text-white transition-all animate-fadeIn">
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <span className="text-xl animate-bounce">⚠️</span>
        <div className="flex-1 truncate">
          <span className="font-bold text-amber-400 text-xs uppercase tracking-wider mr-2">
            Contradiction Detected ({contradictionEdges.length || needsReviewNodes.length})
          </span>
          <span className="text-slate-200 text-xs">
            {contradictions.length > 0 && contradictions[0].from && contradictions[0].to ? (
              <>
                <strong className="text-white">"{contradictions[0].from.label}"</strong> conflicts with{' '}
                <strong className="text-white">"{contradictions[0].to.label}"</strong>
              </>
            ) : (
              'Contradictory observations or hypotheses require review.'
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => {
            if (contradictions.length > 0 && contradictions[0].from && contradictions[0].to) {
              setLastQueryResult({
                question: 'Contradiction Resolution Guidance',
                answer: `SIGNAL detected a direct contradiction between Node #${contradictions[0].from.id} ("${contradictions[0].from.label}") and Node #${contradictions[0].to.id} ("${contradictions[0].to.label}"). Verify telemetry metrics to confirm which statement holds ground.`,
                sources: [contradictions[0].from.id, contradictions[0].to.id]
              });
            }
          }}
          className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-1 rounded text-xs font-bold transition-colors"
        >
          View Conflict
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-white text-xs px-2 py-1"
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
