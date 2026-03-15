import { useMemo, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import ReactECharts from 'echarts-for-react';
import { useStore } from '@/store/useStore';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import {
    getNamedType,
    isEnumType,
    isInputObjectType,
    isInterfaceType,
    isObjectType,
    isScalarType,
    isUnionType,
    type GraphQLNamedType,
    type GraphQLSchema,
} from 'graphql';
import type { LeftPanelView } from '@/types/view';

interface GraphExplorerProps {
    activeView?: LeftPanelView;
    setActiveView: Dispatch<SetStateAction<LeftPanelView>>;
}

type GraphNode = {
    name: string;
    category: number;
    symbolSize: number;
    value?: number;
    symbol?: string;
    itemStyle?: { color?: string; borderColor?: string; borderWidth?: number; shadowBlur?: number; shadowColor?: string };
};

type GraphLink = {
    source: string;
    target: string;
    lineStyle?: { type?: 'solid' | 'dashed' };
};

const CATEGORY_DEFS = [
    { name: 'Object', color: '#22c55e', symbol: 'circle' },
    { name: 'Input', color: '#38bdf8', symbol: 'roundRect' },
    { name: 'Enum', color: '#f59e0b', symbol: 'diamond' },
    { name: 'Scalar', color: '#a1a1aa', symbol: 'triangle' },
    { name: 'Interface', color: '#8b5cf6', symbol: 'rect' },
    { name: 'Union', color: '#f472b6', symbol: 'pin' },
];

const truncateLabel = (label: string, max = 18) =>
    label.length > max ? `${label.slice(0, max - 1)}…` : label;

const getCategoryIndex = (type: GraphQLNamedType): number => {
    if (isObjectType(type)) return 0;
    if (isInputObjectType(type)) return 1;
    if (isEnumType(type)) return 2;
    if (isScalarType(type)) return 3;
    if (isInterfaceType(type)) return 4;
    if (isUnionType(type)) return 5;
    return 0;
};

const getFieldCount = (type: GraphQLNamedType): number => {
    if (isObjectType(type) || isInterfaceType(type)) {
        return Object.keys(type.getFields()).length;
    }
    if (isInputObjectType(type)) {
        return Object.keys(type.getFields()).length;
    }
    if (isEnumType(type)) {
        return type.getValues().length;
    }
    if (isUnionType(type)) {
        return type.getTypes().length;
    }
    return 0;
};

const buildGraph = (schema: GraphQLSchema | null): { nodes: GraphNode[]; links: GraphLink[] } => {
    if (!schema) return { nodes: [], links: [] };

    const typeMap = schema.getTypeMap();
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const linkSet = new Set<string>();
    const rootNames = new Set<string>();
    const queryName = schema.getQueryType()?.name;
    const mutationName = schema.getMutationType()?.name;
    const subscriptionName = schema.getSubscriptionType()?.name;

    if (queryName) rootNames.add(queryName);
    if (mutationName) rootNames.add(mutationName);
    if (subscriptionName) rootNames.add(subscriptionName);

    const pushLink = (source: string, target: string, dashed = false) => {
        if (!source || !target || source === target) return;
        const key = `${source}=>${target}`;
        if (linkSet.has(key)) return;
        linkSet.add(key);
        links.push({
            source,
            target,
            lineStyle: dashed ? { type: 'dashed' } : undefined,
        });
    };

    for (const [name, type] of Object.entries(typeMap)) {
        if (name.startsWith('__')) continue;

        const category = getCategoryIndex(type);
        const fieldCount = getFieldCount(type);
        const symbolSize = Math.min(80, 22 + fieldCount * 2);
        const categoryDef = CATEGORY_DEFS[category];
        const isRootType = rootNames.has(name);
        const rootBoost = isRootType ? 12 : 0;
        const adjustedSize = Math.min(isRootType ? 110 : 82, symbolSize + rootBoost);

        nodes.push({
            name,
            category,
            value: fieldCount,
            symbolSize: adjustedSize,
            symbol: categoryDef.symbol,
            itemStyle: {
                color: categoryDef.color,
                borderColor: isRootType ? 'rgba(248, 250, 252, 0.8)' : 'rgba(248, 250, 252, 0.0)',
                borderWidth: isRootType ? 2 : 0,
                shadowBlur: isRootType ? 14 : 0,
                shadowColor: isRootType ? 'rgba(15, 23, 42, 0.6)' : 'transparent',
            },
        });

        if (isObjectType(type) || isInterfaceType(type)) {
            for (const field of Object.values(type.getFields())) {
                const named = getNamedType(field.type);
                if (!named || named.name.startsWith('__')) continue;
                pushLink(name, named.name);
            }
        }

        if (isInputObjectType(type)) {
            for (const field of Object.values(type.getFields())) {
                const named = getNamedType(field.type);
                if (!named || named.name.startsWith('__')) continue;
                pushLink(name, named.name, true);
            }
        }

        if (isUnionType(type)) {
            for (const unionType of type.getTypes()) {
                if (unionType.name.startsWith('__')) continue;
                pushLink(name, unionType.name);
            }
        }
    }

    return { nodes, links };
};

const renderSchemaPlaceholder = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4 opacity-50">
        <div className="text-lg font-semibold">No Schema Loaded</div>
        <p className="text-xs text-muted-foreground max-w-[220px]">
            Connect to a GraphQL endpoint to explore the schema graph.
        </p>
    </div>
);

export default function GraphExplorer({ activeView = 'explore', setActiveView }: GraphExplorerProps) {
    const store = useStore();
    const [selectedName, setSelectedName] = useState<string | null>(null);

    const { nodes, links } = useMemo(
        () => buildGraph(store.schema),
        [store.schema]
    );

    const defaultTypeName = useMemo(() => {
        if (!store.schema) return null;
        const queryName = store.schema.getQueryType()?.name;
        if (queryName) return queryName;
        const typeNames = Object.keys(store.schema.getTypeMap())
            .filter((name) => !name.startsWith('__'));
        return typeNames[0] ?? null;
    }, [store.schema]);

    useEffect(() => {
        if (!store.schema) {
            setSelectedName(null);
            return;
        }
        if (!selectedName) {
            setSelectedName(defaultTypeName);
            return;
        }
        if (!store.schema.getType(selectedName)) {
            setSelectedName(defaultTypeName);
        }
    }, [defaultTypeName, selectedName, store.schema]);

    const selectedType = useMemo(() => {
        if (!store.schema || !selectedName) return null;
        return store.schema.getType(selectedName) ?? null;
    }, [store.schema, selectedName]);

    const option = useMemo(() => ({
        backgroundColor: 'transparent',
        tooltip: {
            formatter: (params: { dataType: string; data: GraphNode | GraphLink }) => {
                if (params.dataType === 'node') {
                    const node = params.data as GraphNode;
                    const category = CATEGORY_DEFS[node.category]?.name ?? 'Type';
                    return `<strong>${node.name}</strong><br/>${category} • ${node.value ?? 0} fields`;
                }
                const link = params.data as GraphLink;
                return `${link.source} → ${link.target}`;
            },
        },
        legend: {
            data: CATEGORY_DEFS.map((c) => c.name),
            bottom: 0,
            textStyle: { color: '#94a3b8', fontSize: 10 },
        },
        series: [
            {
                type: 'graph',
                layout: 'force',
                data: nodes,
                links,
                categories: CATEGORY_DEFS,
                roam: true,
                label: {
                    show: true,
                    position: 'inside',
                    align: 'center',
                    verticalAlign: 'middle',
                    color: '#e2e8f0',
                    fontSize: 11,
                    width: 72,
                    overflow: 'truncate',
                    ellipsis: '…',
                    lineHeight: 14,
                    padding: [2, 4],
                    formatter: (params: { name?: string; data?: GraphNode }) => {
                        const name = params?.data?.name ?? params?.name ?? '';
                        const size = params?.data?.symbolSize ?? 60;
                        const max = Math.max(8, Math.min(18, Math.floor(size / 6)));
                        return truncateLabel(name, max);
                    },
                },
                labelLayout: {
                    hideOverlap: true,
                },
                lineStyle: {
                    color: 'rgba(148, 163, 184, 0.45)',
                    width: 1,
                },
                force: {
                    repulsion: 180,
                    edgeLength: [60, 140],
                    gravity: 0.08,
                },
                emphasis: {
                    focus: 'adjacency',
                    lineStyle: {
                        width: 2,
                    },
                },
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [4, 8],
                draggable: true,
            },
        ],
    }), [links, nodes]);

    const onEvents = useMemo(() => ({
        click: (params: { dataType?: string; data?: { name?: string } }) => {
            if (params?.dataType === 'node' && params.data?.name) {
                setSelectedName(params.data.name);
            }
        },
    }), []);

    const renderSidebarTabs = () => (
        <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
            <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
                <button
                    onClick={() => setActiveView('docs')}
                    className={cn(
                        "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                        activeView === 'docs'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    Docs
                </button>
                <button
                    onClick={() => setActiveView('explore')}
                    className={cn(
                        "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                        activeView === 'explore'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    Explore
                </button>
                <button
                    onClick={() => setActiveView('types')}
                    className={cn(
                        "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                        activeView === 'types'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    Types
                </button>
                <button
                    onClick={() => setActiveView('schema')}
                    className={cn(
                        "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                        activeView === 'schema'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    SDL
                </button>
            </div>
        </div>
    );

    const renderDetails = () => {
        if (!selectedType) {
            return (
                <div className="text-xs text-muted-foreground">
                    Click a node to see details.
                </div>
            );
        }

        const isObject = isObjectType(selectedType);
        const isInput = isInputObjectType(selectedType);
        const isEnum = isEnumType(selectedType);
        const isScalar = isScalarType(selectedType);
        const isUnion = isUnionType(selectedType);
        const isInterface = isInterfaceType(selectedType);

        const kind = isObject
            ? 'Object'
            : isInput
                ? 'Input'
                : isEnum
                    ? 'Enum'
                    : isScalar
                        ? 'Scalar'
                        : isInterface
                            ? 'Interface'
                            : 'Union';

        return (
            <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{selectedType.name}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {kind}
                    </Badge>
                </div>
                {selectedType.description && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {selectedType.description}
                    </p>
                )}

                {(isObject || isInterface) && (
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Fields
                        </div>
                        {Object.values(selectedType.getFields()).length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">
                                No fields
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {Object.values(selectedType.getFields()).map((field) => (
                                    <div key={field.name} className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[11px] truncate max-w-[55%]" title={field.name}>
                                            {field.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[45%]" title={field.type.toString()}>
                                            {field.type.toString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isInput && (
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Input Fields
                        </div>
                        {Object.values(selectedType.getFields()).length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">
                                No input fields
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {Object.values(selectedType.getFields()).map((field) => (
                                    <div key={field.name} className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[11px] truncate max-w-[55%]" title={field.name}>
                                            {field.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[45%]" title={field.type.toString()}>
                                            {field.type.toString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isEnum && (
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Values
                        </div>
                        {selectedType.getValues().length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">
                                No values
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {selectedType.getValues().map((val) => (
                                    <Badge key={val.name} variant="secondary" className="text-[10px]">
                                        {val.name}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isUnion && (
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Types
                        </div>
                        {selectedType.getTypes().length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">
                                No member types
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {selectedType.getTypes().map((val) => (
                                    <Badge key={val.name} variant="secondary" className="text-[10px]">
                                        {val.name}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isScalar && (
                    <div className="text-[11px] text-muted-foreground italic">
                        Scalar types do not expose fields.
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-card border-r overflow-hidden">
            {renderSidebarTabs()}
            {!store.schema ? (
                renderSchemaPlaceholder()
            ) : (
                <div className="flex flex-col h-full">
                    <div className="flex-1 min-h-0 overflow-hidden relative z-0">
                        <ReactECharts
                            option={option}
                            style={{ height: '100%', width: '100%' }}
                            onEvents={onEvents}
                        />
                    </div>
                    <div
                        className="border-t bg-muted/10 shrink-0 relative z-10"
                        style={{ flex: '0 0 32%' }}
                    >
                        <ScrollArea className="h-full">
                            <div className="p-3">
                                {renderDetails()}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}
        </div>
    );
}
