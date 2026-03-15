import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
    parseSchemaForDocs,
    getTypeString,
    getBaseTypeName,
    buildQueryForField,
} from '@/lib/introspection';
import type { SchemaDocs } from '@/lib/introspection';
import {
    Search,
    ChevronRight,
    Zap,
    RefreshCw,
    Hash,
    Box,
    ArrowLeft,
    Type,
    BookOpen,
} from 'lucide-react';
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import {
    GraphQLNamedType,
    GraphQLField,
    GraphQLEnumType,
} from 'graphql';
import { cn } from '@/lib/utils';
import type { LeftPanelView } from '@/types/view';
import type { LucideIcon } from 'lucide-react';
import ParametersPanel from '@/components/ParametersPanel';

interface NavigationItem {
    type: GraphQLNamedType | null;
    field: GraphQLField<unknown, unknown> | null;
}

interface DocsPanelProps {
    activeView?: LeftPanelView;
    setActiveView: React.Dispatch<React.SetStateAction<LeftPanelView>>;
}

const SECTION_CONFIG: Record<keyof SchemaDocs, { label: string; color: string; icon: LucideIcon }> = {
    queries: { label: 'Queries', color: 'text-emerald-500', icon: Zap },
    mutations: { label: 'Mutations', color: 'text-amber-500', icon: RefreshCw },
    subscriptions: { label: 'Subscriptions', color: 'text-purple-500', icon: Zap },
    types: { label: 'Types', color: 'text-blue-500', icon: Box },
    inputs: { label: 'Inputs', color: 'text-orange-500', icon: Box },
    enums: { label: 'Enums', color: 'text-yellow-500', icon: Hash },
    scalars: { label: 'Scalars', color: 'text-slate-400', icon: Type },
};

export default function DocsPanel({ activeView = 'docs', setActiveView }: DocsPanelProps) {
    const store = useStore();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [navigationStack, setNavigationStack] = useState<NavigationItem[]>([]);
    const [selectedType, setSelectedType] = useState<GraphQLNamedType | null>(null);
    const [selectedField, setSelectedField] = useState<GraphQLField<unknown, unknown> | null>(null);
    const [expandedField, setExpandedField] = useState<{ name: string; section: keyof SchemaDocs } | null>(null);

    const docs = useMemo<SchemaDocs | null>(() => {
        if (!store.schema) return null;
        return parseSchemaForDocs(store.schema);
    }, [store.schema]);

    const filteredDocs = useMemo<Partial<SchemaDocs> | null>(() => {
        if (!docs) return null;
        if (!search.trim()) return docs;

        const lowerSearch = search.toLowerCase();
        const result: Partial<SchemaDocs> = {};
        (Object.keys(docs) as Array<keyof SchemaDocs>).forEach((key) => {
            const items = docs[key];
            const filtered = items.filter((item) => {
                const name = item.name || '';
                const desc = item.description || '';
                return (
                    name.toLowerCase().includes(lowerSearch) ||
                    desc.toLowerCase().includes(lowerSearch)
                );
            }) as typeof items;
            result[key] = filtered;
        });
        return result;
    }, [docs, search]);

    const navigateToType = useCallback(
        (typeName: string) => {
            if (!store.schema) return;
            const type = store.schema.getType(typeName);
            if (type) {
                setNavigationStack((prev) => [...prev, { type: selectedType, field: selectedField }]);
                setSelectedType(type as GraphQLNamedType);
                setSelectedField(null);
                setSearch('');
            }
        },
        [store.schema, selectedType, selectedField]
    );

    const navigateToField = useCallback(
        (field: GraphQLField<unknown, unknown>) => {
            if (!field) return;
            setNavigationStack((prev) => [...prev, { type: selectedType, field: selectedField }]);
            setSelectedField(field);
            setSearch('');
        },
        [selectedType, selectedField]
    );

    const goBack = useCallback(() => {
        setNavigationStack((prev) => {
            if (prev.length === 0) {
                setSelectedType(null);
                setSelectedField(null);
                return [];
            }
            const newStack = [...prev];
            const previous = newStack.pop();
            setSelectedType(previous?.type || null);
            setSelectedField(previous?.field || null);
            return newStack;
        });
    }, []);

    const goHome = useCallback(() => {
        setNavigationStack([]);
        setSelectedType(null);
        setSelectedField(null);
    }, []);

    const insertQuery = useCallback(
        (field: GraphQLField<unknown, unknown>, operationType: string) => {
            const query = buildQueryForField(field, operationType);
            const activeTab = store.getActiveTab();
            store.updateTab(activeTab.id, { query, name: field.name });
            toast({
                title: "Query Inserted",
                description: `Inserted ${field.name} query`,
            });
        },
        [store, toast]
    );

    if (!store.schema) {
        return (
            <div className="flex flex-col h-full bg-card border-r">
                <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
                    <BookOpen className="h-12 w-12 text-muted-foreground/30" />
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold">No Schema Loaded</h3>
                        <p className="text-sm text-muted-foreground">
                            Enter a GraphQL endpoint and click Connect to load the schema documentation.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const renderBreadcrumbs = () => (
        <div className="flex items-center gap-1 px-4 py-2 text-xs border-b bg-muted/30 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <button
                onClick={goHome}
                className="hover:text-primary transition-colors text-muted-foreground font-medium"
            >
                Root
            </button>
            {navigationStack.map((item, i) => {
                const name = item?.field?.name || item?.type?.name;
                if (!name) return null;
                return (
                    <React.Fragment key={i}>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <button
                            className="hover:text-primary transition-colors text-muted-foreground font-medium"
                            onClick={() => {
                                setNavigationStack((prev) => prev.slice(0, i));
                                setSelectedType(item.type || null);
                                setSelectedField(item.field || null);
                            }}
                        >
                            {name}
                        </button>
                    </React.Fragment>
                );
            })}
            {(selectedField || selectedType) && (
                <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="font-bold text-foreground">
                        {selectedField?.name || selectedType?.name}
                    </span>
                </>
            )}
        </div>
    );

    const renderSidebarTabs = () => {
        const isDocsActive = activeView === 'docs' || activeView === 'explore';
        return (
            <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
                <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
                    <button
                        onClick={() => setActiveView('docs')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            isDocsActive
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Docs
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
    };


    // Field detail view
    if (selectedField) {
        return (
            <div className="flex flex-col h-full bg-card border-r">
                {renderSidebarTabs()}
                {renderBreadcrumbs()}
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-6">
                        <Button variant="ghost" size="sm" onClick={goBack} className="h-8 px-2 -ml-2 text-primary hover:text-primary hover:bg-primary/10">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back
                        </Button>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold tracking-tight">{selectedField.name}</h2>
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Field</Badge>
                            </div>
                            {selectedField.description && (
                                <p className="text-sm text-muted-foreground leading-relaxed">{selectedField.description}</p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Return Type</h4>
                            <button
                                className="text-blue-500 hover:underline font-mono text-sm"
                                onClick={() => {
                                    const baseName = getBaseTypeName(selectedField.type);
                                    if (baseName) navigateToType(baseName);
                                }}
                            >
                                {getTypeString(selectedField.type)}
                            </button>
                        </div>

                        {selectedField.args && selectedField.args.length > 0 && (
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Arguments</h4>
                                {selectedField.args.map((arg) => (
                                    <div key={arg.name} className="space-y-1 p-3 rounded-md bg-muted/30 border border-border/50">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-mono text-sm font-semibold">{arg.name}</span>
                                            <span className="text-muted-foreground">:</span>
                                            <button
                                                className="text-blue-500 hover:underline font-mono text-sm"
                                                onClick={() => {
                                                    const baseName = getBaseTypeName(arg.type);
                                                    if (baseName) navigateToType(baseName);
                                                }}
                                            >
                                                {getTypeString(arg.type)}
                                            </button>
                                            {arg.defaultValue !== undefined && arg.defaultValue !== null && (
                                                <span className="text-xs text-muted-foreground italic">
                                                    = {JSON.stringify(arg.defaultValue)}
                                                </span>
                                            )}
                                        </div>
                                        {arg.description && (
                                            <p className="text-xs text-muted-foreground leading-relaxed pl-4 border-l-2 ml-1">
                                                {arg.description}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        );
    }

    // Type detail view
    if (selectedType) {
        const isObjectType = 'getFields' in selectedType;
        const isEnumType = 'getValues' in selectedType;

        return (
            <div className="flex flex-col h-full bg-card border-r">
                {renderSidebarTabs()}
                {renderBreadcrumbs()}
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-6">
                        <Button variant="ghost" size="sm" onClick={goBack} className="h-8 px-2 -ml-2 text-primary hover:text-primary hover:bg-primary/10">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back
                        </Button>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold tracking-tight">{selectedType.name}</h2>
                                <Badge variant="outline">{selectedType.constructor.name.replace('GraphQL', '')}</Badge>
                            </div>
                            {selectedType.description && (
                                <p className="text-sm text-muted-foreground leading-relaxed">{selectedType.description}</p>
                            )}
                        </div>

                        {isObjectType && (
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fields</h4>
                                <div className="divide-y divide-border/50 border rounded-md overflow-hidden bg-muted/10">
                                        {Object.values((selectedType as GraphQLNamedType & { getFields: () => Record<string, GraphQLField<unknown, unknown>> }).getFields()).map((field) => (
                                            <div key={field.name} className="p-3 space-y-2 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1 overflow-hidden">
                                                    <button
                                                        className={cn(
                                                            "font-mono text-sm font-medium truncate",
                                                            activeView === 'explore' ? "text-primary hover:underline" : "text-foreground"
                                                        )}
                                                        onClick={() => activeView === 'explore' && navigateToField(field)}
                                                    >
                                                        {field.name}
                                                    </button>
                                                    {field.args && field.args.length > 0 && (
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            ({field.args.map((a) => a.name).join(', ')})
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    className="text-blue-500 hover:underline font-mono text-xs shrink-0"
                                                    onClick={() => {
                                                        const baseName = getBaseTypeName(field.type);
                                                        if (baseName) navigateToType(baseName);
                                                    }}
                                                >
                                                    {getTypeString(field.type)}
                                                </button>
                                            </div>
                                            {field.description && (
                                                <p className="text-xs text-muted-foreground leading-relaxed">{field.description}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isEnumType && (
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Values</h4>
                                <div className="space-y-2">
                                    {(selectedType as GraphQLEnumType).getValues().map((val) => (
                                        <div key={val.name} className="flex flex-col p-2 rounded-md bg-muted/30 border border-border/50">
                                            <span className="font-mono text-sm font-bold text-amber-500">{val.name}</span>
                                            {val.description && (
                                                <span className="text-xs text-muted-foreground">{val.description}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        );
    }

    // Main docs list view
    return (
        <div className="flex flex-col h-full bg-card border-r overflow-hidden">
            {renderSidebarTabs()}
            <div className="p-3 border-b space-y-3 shrink-0">
                <div className="relative group">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        className="pl-9 h-9 bg-muted/30 focus-visible:ring-1"
                        placeholder="Search schema..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <Accordion type="multiple" defaultValue={['queries', 'mutations']} className="px-1">
                    {filteredDocs && (Object.entries(SECTION_CONFIG) as Array<[keyof SchemaDocs, (typeof SECTION_CONFIG)[keyof SchemaDocs]]>).map(([key, config]) => {
                        const items = filteredDocs[key];
                        if (!items || items.length === 0) return null;

                        const Icon = config.icon;
                        return (
                            <AccordionItem value={key} key={key} className="border-none">
                                <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/50 transition-colors rounded-md text-sm group">
                                    <div className="flex items-center gap-2">
                                        <Icon className={cn("h-4 w-4", config.color)} />
                                        <span className="font-medium">{config.label}</span>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono ml-auto opacity-70">
                                            {items.length}
                                        </Badge>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-1 pb-2">
                                    <div className="space-y-px">
                                        {items.map((item) => {
                                            const isField = key === 'queries' || key === 'mutations' || key === 'subscriptions';
                                            const isExpanded =
                                                isField &&
                                                expandedField?.name === item.name &&
                                                expandedField?.section === key;
                                            return (
                                                <div key={item.name} className="space-y-2">
                                                    <button
                                                        className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors group relative"
                                                        onClick={() => {
                                                            if (isField) {
                                                                const fieldItem = item as GraphQLField<unknown, unknown>;
                                                                if (activeView === 'explore') {
                                                                    navigateToField(fieldItem);
                                                                } else {
                                                                    const op =
                                                                        key === 'mutations'
                                                                            ? 'mutation'
                                                                            : key === 'subscriptions'
                                                                                ? 'subscription'
                                                                                : 'query';
                                                                    insertQuery(fieldItem, op);
                                                                    setExpandedField((prev) =>
                                                                        prev?.name === item.name && prev.section === key
                                                                            ? null
                                                                            : { name: item.name, section: key }
                                                                    );
                                                                }
                                                            } else {
                                                                setExpandedField(null);
                                                                navigateToType(item.name);
                                                            }
                                                        }}
                                                    >
                                                        <span className="font-mono font-medium truncate group-hover:text-primary transition-colors">
                                                            {item.name}
                                                        </span>
                                                        {isField && (
                                                            <span className="text-[10px] text-muted-foreground font-mono shrink-0 italic">
                                                                {getTypeString((item as GraphQLField<unknown, unknown>).type)}
                                                            </span>
                                                        )}
                                                    </button>
                                                    {isExpanded && activeView !== 'explore' && (
                                                        <div className="pl-3 pr-2 pb-2">
                                                            <ParametersPanel contextLabel={item.name} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </ScrollArea>
        </div>
    );
}
