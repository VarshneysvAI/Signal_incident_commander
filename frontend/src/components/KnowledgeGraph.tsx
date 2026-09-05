import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data';
import { useAppStore } from '../store';
import { GraphNode, GraphEdge } from '../types';

const NODE_COLORS: Record<string, string> = {
  incident: '#ef4444',
  fact: '#22c55e',
  unverified: '#86efac',
  hypothesis: '#eab308',
  decision: '#3b82f6',
  action: '#f97316',
  question: '#a855f7',
  off_topic: '#6b7280',
  uncertain: '#94a3b8',
};

const EDGE_COLORS: Record<string, string> = {
  investigated: '#64748b',
  supports: '#22c55e',
  contradicts: '#ef4444',
  led_to: '#3b82f6',
  assigned: '#f97316',
  resolved_by: '#22c55e',
};

export function KnowledgeGraph() {
  const networkRef = useRef<Network | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphData = useAppStore((state) => state.graphData);
  const setLastQueryResult = useAppStore((state) => state.setLastQueryResult);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [highlightType, setHighlightType] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const nodes = graphData.nodes.map((node: GraphNode) => {
      const isHighlighted = !highlightType || node.type === highlightType;
      const isSelected = selectedNode && selectedNode.id === node.id;
      const baseColor = NODE_COLORS[node.type] || '#94a3b8';

      return {
        id: node.id,
        label: node.label.length > 28 ? node.label.substring(0, 25) + '...' : node.label,
        color: {
          background: isHighlighted ? baseColor : '#334155',
          border: isSelected ? '#ffffff' : (node.status === 'needs_review' ? '#ef4444' : baseColor),
          highlight: { background: baseColor, border: '#ffffff' },
        },
        font: { color: isHighlighted ? '#ffffff' : '#64748b', size: 13, face: 'Inter, system-ui, sans-serif' },
        shape: node.type === 'incident' ? 'diamond' : 'dot',
        size: node.type === 'incident' ? 24 : (isSelected ? 18 : 13),
        title: `${node.label} (${node.type.toUpperCase()}) - Speaker: ${node.speaker || 'N/A'}`,
        borderWidth: isSelected ? 3 : (node.status === 'needs_review' ? 3 : 1),
        borderDashes: node.status === 'needs_review' ? [4, 4] : undefined,
      };
    });

    const edges = graphData.edges.map((edge: GraphEdge) => ({
      id: edge.id,
      from: edge.from_node_id,
      to: edge.to_node_id,
      label: edge.type.replace('_', ' '),
      color: {
        color: EDGE_COLORS[edge.type] || '#64748b',
        highlight: '#ffffff',
      },
      font: { color: '#94a3b8', size: 10, align: 'middle' },
      dashes: edge.type === 'contradicts',
      arrows: 'to',
      width: edge.type === 'contradicts' ? 2.5 : 1.2,
    }));

    const data: any = {
      nodes: new DataSet(nodes),
      edges: new DataSet(edges),
    };

    const options: any = {
      nodes: {
        shadow: { enabled: true, color: 'rgba(0,0,0,0.4)', blur: 8, x: 2, y: 2 },
      },
      edges: {
        smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 },
        shadow: { enabled: true, color: 'rgba(0,0,0,0.2)', blur: 4 },
      },
      layout: {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'directed',
          levelSpacing: 90,
          nodeSpacing: 160,
        },
      },
      physics: {
        enabled: physicsEnabled,
        barnesHut: {
          gravitationalConstant: -1800,
          centralGravity: 0.3,
          springLength: 90,
          springConstant: 0.04,
          damping: 0.09,
        },
        stabilization: { iterations: 80 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true,
      },
    };

    const network = new Network(containerRef.current, data, options);
    networkRef.current = network;

    // Node click handler
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const found = graphData.nodes.find((n) => n.id === nodeId);
        if (found) setSelectedNode(found);
      } else {
        setSelectedNode(null);
      }
    });

    return () => {
      network.destroy();
      networkRef.current = null;
    };
  }, [graphData, physicsEnabled, highlightType]);

  // Graph control helpers
  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    }
  };

  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 1.3, animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 0.7, animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
    }
  };

  const togglePhysics = () => {
    const next = !physicsEnabled;
    setPhysicsEnabled(next);
    if (networkRef.current) {
      networkRef.current.setOptions({ physics: { enabled: next } });
    }
  };

  if (!graphData) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 bg-slate-900 rounded-lg border border-slate-700">
        No graph data available
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-900 rounded-lg border border-slate-700 flex flex-col overflow-hidden relative">
      {/* Header Bar */}
      <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-base">🕸️</span>
          <h3 className="text-sm font-semibold text-white">Causal Knowledge Graph</h3>
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>

        {/* Graph Controls Toolbar */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFit}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-xs border border-slate-600 transition-colors"
            title="Fit to Screen"
          >
            🔍 Fit
          </button>
          <button
            onClick={handleZoomIn}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-xs border border-slate-600 transition-colors"
            title="Zoom In"
          >
            ➕
          </button>
          <button
            onClick={handleZoomOut}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-xs border border-slate-600 transition-colors"
            title="Zoom Out"
          >
            ➖
          </button>
          <button
            onClick={togglePhysics}
            className={`px-2 py-1 rounded text-xs border transition-colors ${
              physicsEnabled
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : 'bg-slate-700 text-slate-400 border-slate-600'
            }`}
            title="Toggle Graph Physics Simulation"
          >
            ⚡ Physics {physicsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Vis.js Canvas Container */}
      <div ref={containerRef} className="flex-1 w-full relative" />

      {/* Selected Node Inspector Drawer */}
      {selectedNode && (
        <div className="bg-slate-800/95 border-t border-slate-700 p-3.5 z-20 animate-fadeIn space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#94a3b8' }}
              />
              <span className="text-white font-bold text-xs uppercase tracking-wider">
                {selectedNode.type}
              </span>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                #{selectedNode.id}
              </span>
              {selectedNode.speaker && (
                <span className="text-xs text-slate-300">
                  by <strong className="text-white">{selectedNode.speaker}</strong>
                </span>
              )}
              {selectedNode.topic && (
                <span className="text-xs text-blue-400 font-mono">#{selectedNode.topic}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setLastQueryResult({
                    question: `Inspect Node #${selectedNode.id}`,
                    answer: `Node #${selectedNode.id} (${selectedNode.type.toUpperCase()}): "${selectedNode.label}". Status: ${selectedNode.status}, Confidence: ${selectedNode.confidence}, Topic: ${selectedNode.topic}.`,
                    sources: [selectedNode.id]
                  });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-0.5 rounded text-xs font-medium transition-colors"
              >
                Inspect in Query
              </button>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
          </div>

          <p className="text-slate-200 text-sm">{selectedNode.label}</p>
        </div>
      )}

      {/* Interactive Legend Bar */}
      <div className="bg-slate-800 px-4 py-2 border-t border-slate-700 z-10">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] mr-1">Legend:</span>
          {Object.entries(NODE_COLORS)
            .filter(([type]) => ['incident', 'fact', 'hypothesis', 'decision', 'action', 'question'].includes(type))
            .map(([type, color]) => (
              <button
                key={type}
                onClick={() => setHighlightType(highlightType === type ? null : type)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all ${
                  highlightType === type
                    ? 'bg-slate-700 text-white ring-1 ring-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize">{type}</span>
              </button>
            ))}
          {highlightType && (
            <button
              onClick={() => setHighlightType(null)}
              className="text-[11px] text-blue-400 underline ml-2 hover:text-blue-300"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
