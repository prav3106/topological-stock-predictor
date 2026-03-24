import { useRef, useEffect, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphNode } from '../types/market';

interface GraphViewProps {
    data: GraphData | null;
    loading: boolean;
    error: string | null;
    edgeThreshold: number;
    onNodeClick: (ticker: string) => void;
}

interface ForceNode extends GraphNode {
    __bckgDimensionsW?: number;
    __bckgDimensionsH?: number;
    fx?: number;
    fy?: number;
    vx?: number;
    vy?: number;
}

interface ForceLink {
    source: string | ForceNode;
    target: string | ForceNode;
    weight: number;
    correlation: number;
}

export default function GraphView({ data, loading, error, edgeThreshold, onNodeClick }: GraphViewProps) {
    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const graphData = useMemo(() => {
        if (!data) return { nodes: [], links: [] };

        const nodes: ForceNode[] = data.nodes.map(n => ({
            ...n,
            // Use layout position as initial hint but don't pin nodes
            x: n.x * 400 + 400,
            y: n.y * 300 + 300,
        }));

        const links: ForceLink[] = data.edges
            .filter(e => e.weight > edgeThreshold)
            .map(e => ({
                source: e.source,
                target: e.target,
                weight: e.weight,
                correlation: e.correlation,
            }));

        return { nodes, links };
    }, [data, edgeThreshold]);

    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge')?.strength(-200);
            fgRef.current.d3Force('link')?.distance(50).strength((link: any) => Math.min(link.weight * 0.8, 0.6));
            setTimeout(() => fgRef.current?.zoomToFit(400, 60), 1000);
        }
    }, [graphData]);

    const getNodeColor = useCallback((node: ForceNode) => {
        const r = node.residual;
        const absR = Math.min(Math.abs(r), 2.5);
        const intensity = absR / 2.5;

        if (r > 0.15) {
            // Red: overperforming → mean-revert DOWN
            const g = Math.round(60 * (1 - intensity));
            return `rgba(255, ${g}, ${g + 30}, ${0.7 + intensity * 0.3})`;
        } else if (r < -0.15) {
            // Blue: underperforming → mean-revert UP
            const g = Math.round(80 * (1 - intensity));
            return `rgba(${g + 30}, ${g + 60}, 255, ${0.7 + intensity * 0.3})`;
        }
        return 'rgba(180, 190, 210, 0.85)';
    }, []);

    const getNodeSize = useCallback((node: ForceNode) => {
        return 5 + Math.abs(node.residual) * 6;
    }, []);

    const nodeCanvasObject = useCallback((node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const size = getNodeSize(node);
        const fontSize = Math.max(10 / globalScale, 2);

        // Glow effect
        const glow = Math.abs(node.residual) * 15;
        if (glow > 2) {
            ctx.shadowColor = getNodeColor(node);
            ctx.shadowBlur = glow;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fillStyle = getNodeColor(node);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label
        if (globalScale > 0.6) {
            const label = node.id.replace('.NS', '');
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(220, 225, 240, 0.9)';
            ctx.fillText(label, x, y + size + 2);
        }
    }, [getNodeColor, getNodeSize]);

    const nodePointerAreaPaint = useCallback((node: ForceNode, color: string, ctx: CanvasRenderingContext2D) => {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const size = getNodeSize(node) + 3;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    }, [getNodeSize]);

    const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
        const src = link.source;
        const tgt = link.target;
        if (!src || !tgt || src.x == null || tgt.x == null) return;

        const w = link.weight || 0.3;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = `rgba(100, 130, 200, ${Math.min(w * 0.4, 0.35)})`;
        ctx.lineWidth = Math.max(0.3, w * 1.5);
        ctx.stroke();
    }, []);

    if (loading) {
        return (
            <div className="panel graph-view">
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">Building correlation graph & running diffusion…</p>
                    <p className="loading-subtext">Fetching live NSE data via yfinance</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel graph-view">
                <div className="error-container">
                    <span className="error-icon">⚠</span>
                    <p className="error-text">{error}</p>
                    <p className="error-subtext">Check backend connection and try again</p>
                </div>
            </div>
        );
    }

    if (!data || graphData.nodes.length === 0) {
        return (
            <div className="panel graph-view">
                <div className="empty-container">
                    <span className="empty-icon">◉</span>
                    <p>No graph data. Click <strong>Refresh Data</strong> to build the graph.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="panel graph-view" ref={containerRef}>
            <div className="graph-header">
                <h2>Stock Correlation Graph</h2>
                <div className="graph-legend">
                    <span className="legend-item"><span className="dot red" />Overperforming (residual &gt; 0)</span>
                    <span className="legend-item"><span className="dot blue" />Underperforming (residual &lt; 0)</span>
                    <span className="legend-item"><span className="dot grey" />Neutral</span>
                </div>
                <div className="graph-stats">
                    <span>{graphData.nodes.length} stocks</span>
                    <span>{graphData.links.length} edges</span>
                </div>
            </div>
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                width={containerRef.current?.clientWidth ?? 800}
                height={500}
                backgroundColor="transparent"
                nodeCanvasObject={nodeCanvasObject}
                nodePointerAreaPaint={nodePointerAreaPaint}
                linkCanvasObject={linkCanvasObject}
                onNodeClick={(node: any) => onNodeClick(node.id)}
                nodeLabel={(node: any) => {
                    const n = node as ForceNode;
                    const ticker = n.id.replace('.NS', '');
                    const price = n.price ? `₹${n.price.toFixed(2)}` : '—';
                    const signal = n.residual > 0.15 ? '🔴 Overperforming' : n.residual < -0.15 ? '🔵 Underperforming' : '⚪ Neutral';
                    return `${ticker}\nPrice: ${price}\nResidual: ${n.residual.toFixed(4)}\n${signal}`;
                }}
                cooldownTicks={80}
                enableNodeDrag={true}
                enableZoomInteraction={true}
            />
        </div>
    );
}
