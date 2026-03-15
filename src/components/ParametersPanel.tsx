import React, { useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';
import { getTypeString } from '@/lib/introspection';
import {
    GraphQLInputType,
    GraphQLSchema,
    astFromValue,
    isEnumType,
    isInputObjectType,
    isInputType,
    isListType,
    isNonNullType,
    isScalarType,
    parse,
    print,
    typeFromAST,
    valueFromASTUntyped,
} from 'graphql';

type VariablesShape = Record<string, unknown>;
type PathSegment = string | number;
type Path = PathSegment[];

interface VariableDefinitionInfo {
    name: string;
    type: GraphQLInputType;
    typeString: string;
    required: boolean;
}

interface InlineVariablesResult {
    definitions: VariableDefinitionInfo[];
    values: VariablesShape;
    error?: string;
}

interface ParametersPanelProps {
    contextLabel?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const areValuesEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
            if (!areValuesEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (isRecord(a) && isRecord(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!areValuesEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
};

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

function parseQueryVariables(query: string, schema: GraphQLSchema | null): InlineVariablesResult {
    if (!schema) return { definitions: [], values: {} };
    if (!query.trim()) return { definitions: [], values: {} };

    try {
        const doc = parse(query);
        const operation = doc.definitions.find((def) => def.kind === 'OperationDefinition');
        if (!operation || operation.kind !== 'OperationDefinition') {
            return { definitions: [], values: {} };
        }

        const values: VariablesShape = {};
        const definitions = (operation.variableDefinitions || [])
            .map((definition) => {
                const type = typeFromAST(schema, definition.type);
                if (!type || !isInputType(type)) return null;
                const name = definition.variable.name.value;
                if (definition.defaultValue) {
                    values[name] = valueFromASTUntyped(definition.defaultValue);
                }
                return {
                    name,
                    type: type as GraphQLInputType,
                    typeString: getTypeString(type),
                    required: isNonNullType(type),
                } as VariableDefinitionInfo;
            })
            .filter((value): value is VariableDefinitionInfo => Boolean(value));

        return { definitions, values };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { definitions: [], values: {}, error: message };
    }
}

function applyVariableDefaultsToQuery(
    query: string,
    schema: GraphQLSchema | null,
    variables: VariablesShape
): { next: string; error?: string } {
    if (!schema || !query.trim()) return { next: query };

    try {
        const doc = parse(query);
        let operationHandled = false;
        let shouldUpdate = false;

        for (const definition of doc.definitions) {
            if (definition.kind !== 'OperationDefinition' || operationHandled) continue;
            operationHandled = true;
            if (!definition.variableDefinitions) break;

            for (const variableDefinition of definition.variableDefinitions) {
                const type = typeFromAST(schema, variableDefinition.type);
                if (!type || !isInputType(type)) continue;

                const name = variableDefinition.variable.name.value;
                const hasValue = Object.prototype.hasOwnProperty.call(variables, name);
                const hasDefault = Boolean(variableDefinition.defaultValue);
                const currentValue = hasDefault
                    ? valueFromASTUntyped(variableDefinition.defaultValue!)
                    : undefined;

                if (!hasValue && hasDefault) {
                    shouldUpdate = true;
                    break;
                }
                if (hasValue && !areValuesEqual(currentValue, variables[name])) {
                    shouldUpdate = true;
                    break;
                }
            }
        }

        if (!shouldUpdate) return { next: query };

        operationHandled = false;
        const nextDefinitions = doc.definitions.map((definition) => {
            if (definition.kind !== 'OperationDefinition' || operationHandled) {
                return definition;
            }
            operationHandled = true;
            if (!definition.variableDefinitions) return definition;

            const nextVarDefs = definition.variableDefinitions.map((variableDefinition) => {
                const type = typeFromAST(schema, variableDefinition.type);
                if (!type || !isInputType(type)) return variableDefinition;

                const name = variableDefinition.variable.name.value;
                const hasValue = Object.prototype.hasOwnProperty.call(variables, name);

                if (!hasValue) {
                    if (!variableDefinition.defaultValue) return variableDefinition;
                    return { ...variableDefinition, defaultValue: undefined };
                }

                const value = variables[name];
                const astValue = astFromValue(value, type as GraphQLInputType);
                if (!astValue) return variableDefinition;
                return { ...variableDefinition, defaultValue: astValue };
            });

            return { ...definition, variableDefinitions: nextVarDefs };
        });

        return { next: print({ ...doc, definitions: nextDefinitions }) };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { next: query, error: message };
    }
}

export default function ParametersPanel({ contextLabel }: ParametersPanelProps) {
    const store = useStore();
    const activeTab = store.getActiveTab();

    const inlineVariables = useMemo(
        () => parseQueryVariables(activeTab.query, store.schema),
        [activeTab.query, store.schema]
    );
    const variableDefinitions = inlineVariables.definitions;
    const inlineValues = inlineVariables.values;
    const variableError = inlineVariables.error;

    const panelState = useMemo(
        () => parseVariablesString(activeTab.variables),
        [activeTab.variables]
    );
    const panelValues = panelState.value;
    const panelError = panelState.error;

    const variableModes = useMemo(() => {
        const modes: Record<string, 'inline' | 'panel'> = {};
        for (const definition of variableDefinitions) {
            modes[definition.name] = Object.prototype.hasOwnProperty.call(panelValues, definition.name)
                ? 'panel'
                : 'inline';
        }
        return modes;
    }, [panelValues, variableDefinitions]);

    const updateQueryWithVariables = useCallback(
        (nextVariables: VariablesShape) => {
            const { next } = applyVariableDefaultsToQuery(
                activeTab.query,
                store.schema,
                nextVariables
            );
            if (next === activeTab.query) return;
            store.updateTab(activeTab.id, { query: next });
        },
        [activeTab.id, activeTab.query, store, store.schema]
    );

    const updateVariablesPanel = useCallback(
        (nextVariables: VariablesShape) => {
            const serialized = JSON.stringify(nextVariables, null, 2);
            if (serialized === activeTab.variables) return;
            store.updateTab(activeTab.id, { variables: serialized });
        },
        [activeTab.id, activeTab.variables, store]
    );

    const buildInlineVariablesBase = useCallback(() => {
        const base: VariablesShape = {};
        for (const definition of variableDefinitions) {
            const mode = variableModes[definition.name] ?? 'inline';
            if (mode !== 'inline') continue;
            if (Object.prototype.hasOwnProperty.call(inlineValues, definition.name)) {
                base[definition.name] = inlineValues[definition.name];
            }
        }
        return base;
    }, [inlineValues, variableDefinitions, variableModes]);

    const setInlineVariablesWith = useCallback(
        (updater: (current: VariablesShape) => VariablesShape) => {
            if (variableError) return;
            const base = buildInlineVariablesBase();
            const next = updater(base);
            updateQueryWithVariables(next);
        },
        [buildInlineVariablesBase, updateQueryWithVariables, variableError]
    );

    const setPanelVariablesWith = useCallback(
        (updater: (current: VariablesShape) => VariablesShape) => {
            const base = panelError ? {} : panelValues;
            const next = updater(base);
            updateVariablesPanel(next);
        },
        [panelError, panelValues, updateVariablesPanel]
    );

    const handleSetValue = useCallback(
        (name: string, path: Path, value: unknown) => {
            const mode = variableModes[name] ?? 'inline';
            if (mode === 'panel') {
                setPanelVariablesWith((current) => setVariablesAtPath(current, path, value));
            } else {
                setInlineVariablesWith((current) => setVariablesAtPath(current, path, value));
            }
        },
        [setInlineVariablesWith, setPanelVariablesWith, variableModes]
    );

    const handleRemoveValue = useCallback(
        (name: string, path: Path) => {
            const mode = variableModes[name] ?? 'inline';
            if (mode === 'panel') {
                setPanelVariablesWith((current) => removeVariablesAtPath(current, path));
            } else {
                setInlineVariablesWith((current) => removeVariablesAtPath(current, path));
            }
        },
        [setInlineVariablesWith, setPanelVariablesWith, variableModes]
    );

    const handleAddArrayItem = useCallback(
        (name: string, path: Path, itemType: GraphQLInputType) => {
            const newItem = getDefaultValueForType(itemType);
            const mode = variableModes[name] ?? 'inline';
            if (mode === 'panel') {
                setPanelVariablesWith((current) => addArrayItemAtPath(current, path, newItem));
            } else {
                setInlineVariablesWith((current) => addArrayItemAtPath(current, path, newItem));
            }
        },
        [setInlineVariablesWith, setPanelVariablesWith, variableModes]
    );

    const handleRemoveArrayItem = useCallback(
        (name: string, path: Path, index: number) => {
            const mode = variableModes[name] ?? 'inline';
            if (mode === 'panel') {
                setPanelVariablesWith((current) => removeVariablesAtPath(current, [...path, index]));
            } else {
                setInlineVariablesWith((current) => removeVariablesAtPath(current, [...path, index]));
            }
        },
        [setInlineVariablesWith, setPanelVariablesWith, variableModes]
    );

    const handleSetVariableMode = useCallback(
        (definition: VariableDefinitionInfo, targetMode: 'inline' | 'panel') => {
            const name = definition.name;
            const currentMode = variableModes[name] ?? 'inline';
            if (currentMode === targetMode) return;

            const panelHas = Object.prototype.hasOwnProperty.call(panelValues, name);
            const inlineHas = Object.prototype.hasOwnProperty.call(inlineValues, name);
            const fallback = getDefaultValueForType(definition.type);

            if (targetMode === 'panel') {
                const nextValue = inlineHas ? inlineValues[name] : fallback;
                setPanelVariablesWith((current) =>
                    setVariablesAtPath(current, [name], nextValue)
                );
                const base = buildInlineVariablesBase();
                const nextInline = removeVariablesAtPath(base, [name]);
                updateQueryWithVariables(nextInline);
            } else {
                const nextValue = panelHas ? panelValues[name] : fallback;
                const base = buildInlineVariablesBase();
                const nextInline = setVariablesAtPath(base, [name], nextValue);
                updateQueryWithVariables(nextInline);
                setPanelVariablesWith((current) => removeVariablesAtPath(current, [name]));
            }
        },
        [
            buildInlineVariablesBase,
            inlineValues,
            panelValues,
            setPanelVariablesWith,
            updateQueryWithVariables,
            variableModes,
        ]
    );

    useEffect(() => {
        if (variableError || panelError) return;
        const allowed = new Set(variableDefinitions.map((def) => def.name));
        const sanitized: VariablesShape = {};
        for (const [key, value] of Object.entries(panelValues)) {
            if (allowed.has(key)) {
                sanitized[key] = value;
            }
        }
        if (!areValuesEqual(sanitized, panelValues)) {
            updateVariablesPanel(sanitized);
        }
    }, [panelError, panelValues, updateVariablesPanel, variableDefinitions, variableError]);

    useEffect(() => {
        if (variableError || panelError) return;
        const base = buildInlineVariablesBase();
        updateQueryWithVariables(base);
    }, [buildInlineVariablesBase, updateQueryWithVariables, variableError, panelError]);

    const modeButtonClass = (active: boolean) =>
        cn(
            "h-6 px-2 text-[10px] font-semibold",
            active
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
        );

    const renderInputForType = (
        variableName: string,
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
                            onClick={() => handleAddArrayItem(variableName, path, itemType)}
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
                                            onClick={() => handleRemoveArrayItem(variableName, path, index)}
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                    {renderInputForType(variableName, itemType, item, [...path, index])}
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
                                        onClick={() => handleRemoveValue(variableName, [...path, field.name])}
                                        disabled={!fieldHasValue}
                                        title="Remove field"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                                {renderInputForType(
                                    variableName,
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
                            handleRemoveValue(variableName, path);
                        } else {
                            handleSetValue(variableName, path, next);
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
                                handleRemoveValue(variableName, path);
                            } else {
                                handleSetValue(variableName, path, next === 'true');
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
                                handleRemoveValue(variableName, path);
                                return;
                            }
                            const parsed =
                                scalarName === 'Int'
                                    ? Number.parseInt(next, 10)
                                    : Number.parseFloat(next);
                            if (!Number.isNaN(parsed)) {
                                handleSetValue(variableName, path, parsed);
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
                    onChange={(event) => handleSetValue(variableName, path, event.target.value)}
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

    return (
        <div className="rounded-md border border-border/60 bg-card/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Parameters
                    </span>
                    {contextLabel && (
                        <span className="text-[11px] text-muted-foreground">
                            {contextLabel}
                        </span>
                    )}
                    <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-mono"
                    >
                        {variableDefinitions.length}
                    </Badge>
                </div>
                {variableError && (
                    <Badge variant="destructive" className="text-[10px]">
                        Query error
                    </Badge>
                )}
            </div>
            <ScrollArea className="max-h-[35vh]" style={{ maxHeight: '35vh' }}>
                <div className="p-3 space-y-3">
                    {variableError ? (
                        <div className="text-xs text-muted-foreground">
                            Fix the query syntax to load the parameter builder.
                        </div>
                    ) : panelError ? (
                        <div className="text-xs text-muted-foreground">
                            Variables JSON is invalid. Parameter edits here will overwrite it.
                        </div>
                    ) : variableDefinitions.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                            No parameters in the current operation.
                        </div>
                    ) : (
                        variableDefinitions.map((definition) => {
                            const mode = variableModes[definition.name] ?? 'inline';
                            const sourceValues = mode === 'panel' ? panelValues : inlineValues;
                            const hasValue = Object.prototype.hasOwnProperty.call(
                                sourceValues,
                                definition.name
                            );
                            const effectiveValue = sourceValues[definition.name];
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
                                        <div className="flex items-center gap-2">
                                            <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
                                                <button
                                                    className={modeButtonClass(mode === 'inline')}
                                                    onClick={() => handleSetVariableMode(definition, 'inline')}
                                                    title="Store in query"
                                                >
                                                    Query
                                                </button>
                                                <button
                                                    className={modeButtonClass(mode === 'panel')}
                                                    onClick={() => handleSetVariableMode(definition, 'panel')}
                                                    title="Store in variables panel"
                                                >
                                                    Variables
                                                </button>
                                            </div>
                                            <button
                                                className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                                onClick={() => handleRemoveValue(definition.name, [definition.name])}
                                                disabled={!hasValue}
                                                title="Clear value"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
                                    {renderInputForType(
                                        definition.name,
                                        definition.type,
                                        effectiveValue,
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
}
