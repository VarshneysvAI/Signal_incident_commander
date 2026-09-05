import React from 'react';
import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const nodes = graphData.nodes.map((node: GraphNode) => ({
      id: node.id,
      label: node.label.length > 30 ? node.label.substring(0, 27) + '...' : node.label,
      color: NODE_COLORS[node.type] || '#94a3b8',
      font: { color: '#ffffff', size: 14 },
      shape: node.type === 'incident' ? 'diamond' : 'dot',
      size: node.type === 'incident' ? 20 : 12,
      title: `<div style="padding: 8px;">
        <strong>${node.label}</strong><br/>
        Type: ${node.type}<br/>
        Speaker: ${node.speaker || 'N/A'}<br/>
        Status: ${node.status}<br/>
        Confidence: ${node.confidence}<br/>
        Topic: ${node.topic}
      </div>`,
      borderWidth: node.status === 'needs_review' ? 3 : 1,
      borderDashes: node.status === 'needs_review' ? [5, 5] : undefined,
    }));

    const edges = graphData.edges.map((edge: GraphEdge) => ({
      id: edge.id,
      from: edge.from_node_id,
      to: edge.to_node_id,
      label: edge.type.replace('_', ' '),
      color: EDGE_COLORS[edge.type] || '#64748b',
      font: { color: '#94a3b8', size: 10 },
      dashes: edge.type === 'contradicts',
      arrows: 'to',
    }));

    const data: any = {
      nodes: new DataSet(nodes),
      edges: new DataSet(edges),
    };
    
    const options: any = {
      nodes: {
        shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', blur: 10 },
      },
      edges: {
        smooth: { type: 'continuous', enabled: true },
        shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', blur: 10 },
      },
      layout: {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'directed',
          levelSpacing: 100,
          nodeSpacing: 150,
        },
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
        },
        stabilization: { iterations: 100 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      },
    };

    networkRef.current = new Network(containerRef.current, data, options);

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [graphData]);

  if (!graphData) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        No graph data available
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white">Knowledge Graph</h3>
      </div>
      <div ref={containerRef} className="h-[calc(100%-40px)]" />
      <div className="bg-slate-800 px-4 py-2 border-t border-slate-700">
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-slate-300 capitalize">{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
