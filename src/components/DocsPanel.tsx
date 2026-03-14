import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
    Plus,
    Trash2,
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
    GraphQLSchema,
    GraphQLInputType,
    parse,
    typeFromAST,
    isInputType,
    isNonNullType,
    isListType,
    isInputObjectType,
    isEnumType,
    isScalarType,
} from 'graphql';
import { cn } from '@/lib/utils';
import type { LeftPanelView } from '@/types/view';
import type { LucideIcon } from 'lucide-react';

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

type VariablesShape = Record<string, unknown>;
type PathSegment = string | number;
type Path = PathSegment[];

interface VariableDefinitionInfo {
    name: string;
    type: GraphQLInputType;
    typeString: string;
    required: boolean;
}

interface VariableDefinitionsResult {
    definitions: VariableDefinitionInfo[];
    error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const stringifyVariables = (value: VariablesShape) => JSON.stringify(value, null, 2);

function parseVariablesString(input: string): { value: VariablesShape; error?: string } {
    if (!input || !input.trim()) return { value: {} };
    try {
        const parsed = JSON.parse(input) as unknown;
        if (!isRecord(parsed)) {
            return { value: {}, error: 'Variables must be a JSON object.' };
        }
        return { value: parsed };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON in variables.';
        return { value: {}, error: message };
    }
}

function getVariableDefinitions(query: string, schema: GraphQLSchema | null): VariableDefinitionsResult {
    if (!schema) return { definitions: [] };
    if (!query.trim()) return { definitions: [] };

    try {
        const doc = parse(query);
        const operation = doc.definitions.find((def) => def.kind === 'OperationDefinition');
        if (!operation || operation.kind !== 'OperationDefinition') {
            return { definitions: [] };
        }

        const definitions = (operation.variableDefinitions || [])
            .map((definition) => {
                const type = typeFromAST(schema, definition.type);
                if (!type || !isInputType(type)) return null;
                return {
                    name: definition.variable.name.value,
                    type: type as GraphQLInputType,
                    typeString: getTypeString(type),
                    required: isNonNullType(type),
                } as VariableDefinitionInfo;
            })
            .filter((value): value is VariableDefinitionInfo => Boolean(value));

        return { definitions };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { definitions: [], error: message };
    }
}

function sanitizeVariablesForDefinitions(
    variables: VariablesShape,
    definitions: VariableDefinitionInfo[]
): { value: VariablesShape; removed: boolean } {
    const allowed = new Set(definitions.map((def) => def.name));
    const result: VariablesShape = {};
    let removed = false;

    for (const def of definitions) {
        if (Object.prototype.hasOwnProperty.call(variables, def.name)) {
            result[def.name] = variables[def.name];
        }
    }

    for (const key of Object.keys(variables)) {
        if (!allowed.has(key)) {
            removed = true;
            break;
        }
    }

    return { value: result, removed };
}

function getDefaultValueForType(type: GraphQLInputType): unknown {
    const unwrapped = isNonNullType(type) ? type.ofType : type;
    if (isListType(unwrapped)) return [];
    if (isInputObjectType(unwrapped)) return {};
    if (isEnumType(unwrapped)) {
        return unwrapped.getValues()[0]?.name ?? '';
    }
    if (isScalarType(unwrapped)) {
        switch (unwrapped.name) {
            case 'Int':
            case 'Float':
                return 0;
            case 'Boolean':
                return false;
            case 'ID':
            case 'String':
                return '';
            default:
                return '';
        }
    }
    return null;
}

function getValueAtPath(value: unknown, path: Path): unknown {
    let current: unknown = value;
    for (const segment of path) {
        if (current === null || current === undefined) return undefined;
        if (typeof segment === 'number') {
            if (!Array.isArray(current)) return undefined;
            current = current[segment];
        } else {
            if (!isRecord(current)) return undefined;
            current = current[segment];
        }
    }
    return current;
}

function setValueAtPath(value: unknown, path: Path, newValue: unknown): unknown {
    if (path.length === 0) return newValue;
    const [head, ...rest] = path;

    if (typeof head === 'number') {
        const arrayValue = Array.isArray(value) ? [...value] : [];
        arrayValue[head] = setValueAtPath(arrayValue[head], rest, newValue);
        return arrayValue;
    }

    const objectValue = isRecord(value) ? { ...value } : {};
    objectValue[head] = setValueAtPath(objectValue[head], rest, newValue);
    return objectValue;
}

function removeValueAtPath(value: unknown, path: Path): unknown {
    if (path.length === 0) return value;
    const [head, ...rest] = path;

    if (typeof head === 'number') {
        if (!Array.isArray(value)) return value;
        const arrayValue = [...value];
        if (rest.length === 0) {
            arrayValue.splice(head, 1);
            return arrayValue;
        }
        arrayValue[head] = removeValueAtPath(arrayValue[head], rest);
        return arrayValue;
    }

    if (!isRecord(value)) return value;
    const objectValue = { ...value };
    if (rest.length === 0) {
        delete objectValue[head];
        return objectValue;
    }
    objectValue[head] = removeValueAtPath(objectValue[head], rest);
    return objectValue;
}

function setVariablesAtPath(variables: VariablesShape, path: Path, newValue: unknown): VariablesShape {
    const next = setValueAtPath(variables, path, newValue);
    return isRecord(next) ? next : {};
}

function removeVariablesAtPath(variables: VariablesShape, path: Path): VariablesShape {
    const next = removeValueAtPath(variables, path);
    return isRecord(next) ? next : {};
}

function addArrayItemAtPath(variables: VariablesShape, path: Path, item: unknown): VariablesShape {
    const currentValue = getValueAtPath(variables, path);
    const nextArray = Array.isArray(currentValue) ? [...currentValue, item] : [item];
    return setVariablesAtPath(variables, path, nextArray);
}

export default function DocsPanel({ activeView = 'docs', setActiveView }: DocsPanelProps) {
    const store = useStore();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [navigationStack, setNavigationStack] = useState<NavigationItem[]>([]);
    const [selectedType, setSelectedType] = useState<GraphQLNamedType | null>(null);
    const [selectedField, setSelectedField] = useState<GraphQLField<unknown, unknown> | null>(null);
    const activeTab = store.getActiveTab();

    const variableDefinitionsResult = useMemo(
        () => getVariableDefinitions(activeTab.query, store.schema),
        [activeTab.query, store.schema]
    );
    const variableDefinitions = variableDefinitionsResult.definitions;
    const variableDefinitionsError = variableDefinitionsResult.error;

    const variablesState = useMemo(
        () => parseVariablesString(activeTab.variables),
        [activeTab.variables]
    );
    const variablesValue = variablesState.value;
    const variablesError = variablesState.error;

    useEffect(() => {
        if (variablesError || variableDefinitionsError) return;
        const { value: sanitized, removed } = sanitizeVariablesForDefinitions(
            variablesValue,
            variableDefinitions
        );
        if (removed) {
            store.updateTab(activeTab.id, { variables: stringifyVariables(sanitized) });
        }
    }, [
        activeTab.id,
        store,
        variableDefinitions,
        variableDefinitionsError,
        variablesError,
        variablesValue,
    ]);

    const updateVariables = useCallback(
        (nextVariables: VariablesShape) => {
            const serialized = stringifyVariables(nextVariables);
            if (serialized === activeTab.variables) return;
            store.updateTab(activeTab.id, { variables: serialized });
        },
        [activeTab.id, activeTab.variables, store]
    );

    const setVariablesWith = useCallback(
        (updater: (current: VariablesShape) => VariablesShape) => {
            const base = variablesError ? {} : variablesValue;
            const next = updater(base);
            updateVariables(next);
        },
        [updateVariables, variablesError, variablesValue]
    );

    const handleSetValue = useCallback(
        (path: Path, value: unknown) => {
            setVariablesWith((current) => setVariablesAtPath(current, path, value));
        },
        [setVariablesWith]
    );

    const handleRemoveValue = useCallback(
        (path: Path) => {
            setVariablesWith((current) => removeVariablesAtPath(current, path));
        },
        [setVariablesWith]
    );

    const handleAddArrayItem = useCallback(
        (path: Path, itemType: GraphQLInputType) => {
            const newItem = getDefaultValueForType(itemType);
            setVariablesWith((current) => addArrayItemAtPath(current, path, newItem));
        },
        [setVariablesWith]
    );

    const handleRemoveArrayItem = useCallback(
        (path: Path, index: number) => {
            setVariablesWith((current) => removeVariablesAtPath(current, [...path, index]));
        },
        [setVariablesWith]
    );

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

    const renderInputForType = (
        type: GraphQLInputType,
        value: unknown,
        path: Path
    ): React.ReactNode => {
        const resolvedType = isNonNullType(type) ? type.ofType : type;
        const selectClassName =
            "h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

        if (isListType(resolvedType)) {
            const itemType = resolvedType.ofType as GraphQLInputType;
            const listValue = Array.isArray(value) ? value : [];
            return (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Array</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAddArrayItem(path, itemType)}
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>
                    {listValue.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground italic">
                            No items yet
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {listValue.map((item, index) => (
                                <div
                                    key={`${path.join('.')}-${index}`}
                                    className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-muted-foreground font-mono">
                                            #{index + 1}
                                        </span>
                                        <button
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                            onClick={() => handleRemoveArrayItem(path, index)}
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                    {renderInputForType(itemType, item, [...path, index])}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (isInputObjectType(resolvedType)) {
            const objectValue = isRecord(value) ? value : {};
            const fields = resolvedType.getFields();
            return (
                <div className="space-y-2 pl-3 border-l border-border/50">
                    {Object.values(fields).map((field) => {
                        const fieldType = field.type as GraphQLInputType;
                        const fieldHasValue = Object.prototype.hasOwnProperty.call(
                            objectValue,
                            field.name
                        );
                        return (
                            <div key={field.name} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-xs font-semibold truncate">
                                            {field.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono truncate">
                                            {getTypeString(fieldType)}
                                        </span>
                                        {isNonNullType(fieldType) && (
                                            <Badge
                                                variant="secondary"
                                                className="h-4 px-1 text-[9px] uppercase tracking-wider"
                                            >
                                                Required
                                            </Badge>
                                        )}
                                    </div>
                                    <button
                                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                        onClick={() => handleRemoveValue([...path, field.name])}
                                        disabled={!fieldHasValue}
                                        title="Remove field"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                                {renderInputForType(
                                    fieldType,
                                    objectValue[field.name],
                                    [...path, field.name]
                                )}
                                {field.description && (
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        {field.description}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (isEnumType(resolvedType)) {
            const enumValue =
                typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            return (
                <select
                    className={selectClassName}
                    value={enumValue}
                    onChange={(event) => {
                        const next = event.target.value;
                        if (next === '') {
                            handleRemoveValue(path);
                        } else {
                            handleSetValue(path, next);
                        }
                    }}
                >
                    <option value="">Select value</option>
                    {resolvedType.getValues().map((enumOption) => (
                        <option key={enumOption.name} value={enumOption.name}>
                            {enumOption.name}
                        </option>
                    ))}
                </select>
            );
        }

        if (isScalarType(resolvedType)) {
            const scalarName = resolvedType.name;

            if (scalarName === 'Boolean') {
                const booleanValue =
                    typeof value === 'boolean' ? (value ? 'true' : 'false') : '';
                return (
                    <select
                        className={selectClassName}
                        value={booleanValue}
                        onChange={(event) => {
                            const next = event.target.value;
                            if (next === '') {
                                handleRemoveValue(path);
                            } else {
                                handleSetValue(path, next === 'true');
                            }
                        }}
                    >
                        <option value="">Select value</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                    </select>
                );
            }

            if (scalarName === 'Int' || scalarName === 'Float') {
                const numericValue = typeof value === 'number' ? value : '';
                return (
                    <Input
                        type="number"
                        className="h-8 text-xs font-mono"
                        value={numericValue}
                        onChange={(event) => {
                            const next = event.target.value;
                            if (!next.trim()) {
                                handleRemoveValue(path);
                                return;
                            }
                            const parsed =
                                scalarName === 'Int'
                                    ? Number.parseInt(next, 10)
                                    : Number.parseFloat(next);
                            if (!Number.isNaN(parsed)) {
                                handleSetValue(path, parsed);
                            }
                        }}
                        placeholder={scalarName}
                    />
                );
            }

            const stringValue =
                typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            return (
                <Input
                    className="h-8 text-xs font-mono"
                    value={stringValue}
                    onChange={(event) => handleSetValue(path, event.target.value)}
                    placeholder={scalarName}
                />
            );
        }

        return (
            <div className="text-[11px] text-muted-foreground">
                Unsupported input type
            </div>
        );
    };

    const renderVariablesPanel = () => (
        <div className="border-t bg-card/40 flex flex-col flex-[0_0_35%] min-h-[25%]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Variables
                    </span>
                    <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-mono"
                    >
                        {variableDefinitions.length}
                    </Badge>
                </div>
                {variableDefinitionsError && (
                    <Badge variant="destructive" className="text-[10px]">
                        Query error
                    </Badge>
                )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-3">
                    {variablesError && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                            Variables JSON is invalid. Edits here will overwrite it with a
                            valid object.
                        </div>
                    )}
                    {variableDefinitionsError ? (
                        <div className="text-xs text-muted-foreground">
                            Fix the query syntax to load the variable builder.
                        </div>
                    ) : variableDefinitions.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                            No variables in the current operation.
                        </div>
                    ) : (
                        variableDefinitions.map((definition) => {
                            const hasValue = Object.prototype.hasOwnProperty.call(
                                variablesValue,
                                definition.name
                            );
                            return (
                                <div
                                    key={definition.name}
                                    className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono text-xs font-semibold truncate">
                                                {definition.name}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                {definition.typeString}
                                            </span>
                                            {definition.required && (
                                                <Badge
                                                    variant="secondary"
                                                    className="h-4 px-1 text-[9px] uppercase tracking-wider"
                                                >
                                                    Required
                                                </Badge>
                                            )}
                                            {!hasValue && (
                                                <span className="text-[10px] text-muted-foreground italic">
                                                    Unset
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                            onClick={() => handleRemoveValue([definition.name])}
                                            disabled={!hasValue}
                                            title="Remove variable"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                    {renderInputForType(
                                        definition.type,
                                        variablesValue[definition.name],
                                        [definition.name]
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    );

    // Field detail view
    if (selectedField) {
        return (
            <div className="flex flex-col h-full bg-card border-r">
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
                {renderVariablesPanel()}
            </div>
        );
    }

    // Type detail view
    if (selectedType) {
        const isObjectType = 'getFields' in selectedType;
        const isEnumType = 'getValues' in selectedType;

        return (
            <div className="flex flex-col h-full bg-card border-r">
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
                {renderVariablesPanel()}
            </div>
        );
    }

    // Main docs list view
    return (
        <div className="flex flex-col h-full bg-card border-r overflow-hidden">
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
                                        {items.map((item) => (
                                            <button
                                                key={item.name}
                                                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors group relative"
                                                onClick={() => {
                                                    const isField = key === 'queries' || key === 'mutations' || key === 'subscriptions';
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
                                                        }
                                                    } else {
                                                        navigateToType(item.name);
                                                    }
                                                }}
                                            >
                                                <span className="font-mono font-medium truncate group-hover:text-primary transition-colors">
                                                    {item.name}
                                                </span>
                                                {(key === 'queries' || key === 'mutations' || key === 'subscriptions') && (
                                                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 italic">
                                                        {getTypeString((item as GraphQLField<unknown, unknown>).type)}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </ScrollArea>
            {renderVariablesPanel()}
        </div>
    );
}
