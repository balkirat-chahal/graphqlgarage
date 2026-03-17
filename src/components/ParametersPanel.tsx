import React, { useMemo, useCallback, useEffect } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';
import { getTypeString } from '@/lib/introspection';
import {
    GraphQLField,
    GraphQLInputType,
    GraphQLNamedType,
    GraphQLOutputType,
    GraphQLSchema,
    GraphQLString,
    GraphQLType,
    Kind,
    astFromValue,
    isEnumType,
    isInputObjectType,
    isInputType,
    isInterfaceType,
    isListType,
    isNonNullType,
    isObjectType,
    isScalarType,
    isUnionType,
    parse,
    print,
    typeFromAST,
    valueFromASTUntyped,
    type FieldNode,
    type InlineFragmentNode,
    type OperationDefinitionNode,
    type SelectionSetNode,
} from 'graphql';

type VariablesShape = Record<string, unknown>;
type PathSegment = string | number;
type Path = PathSegment[];

const DEFAULT_EXPANDED_DEPTH = 0;
const DEFAULT_SELECTION_EXPANDED_DEPTH = 0;

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
    field?: GraphQLField<unknown, unknown>;
    operationType?: 'query' | 'mutation' | 'subscription';
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

const getPathKey = (path: Path): string =>
    path
        .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
        .join('.');

type SelectionTree = {
    fields: Record<string, SelectionTree>;
    fragments: Record<string, SelectionTree>;
};

const createSelectionTree = (): SelectionTree => ({ fields: {}, fragments: {} });

const isSelectionTreeEmpty = (tree: SelectionTree): boolean =>
    Object.keys(tree.fields).length === 0 && Object.keys(tree.fragments).length === 0;

const selectionSetToTree = (selectionSet?: SelectionSetNode): SelectionTree => {
    if (!selectionSet) return createSelectionTree();
    const tree = createSelectionTree();
    for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
            tree.fields[selection.name.value] = selectionSetToTree(selection.selectionSet);
        } else if (selection.kind === Kind.INLINE_FRAGMENT && selection.typeCondition) {
            tree.fragments[selection.typeCondition.name.value] = selectionSetToTree(selection.selectionSet);
        }
    }
    return tree;
};

const treeToSelectionSet = (tree: SelectionTree): SelectionSetNode => {
    const selections: Array<FieldNode | InlineFragmentNode> = [];
    for (const [name, subtree] of Object.entries(tree.fields)) {
        selections.push({
            kind: Kind.FIELD,
            name: { kind: Kind.NAME, value: name },
            selectionSet: isSelectionTreeEmpty(subtree) ? undefined : treeToSelectionSet(subtree),
        });
    }
    for (const [typeName, subtree] of Object.entries(tree.fragments)) {
        if (isSelectionTreeEmpty(subtree)) continue;
        selections.push({
            kind: Kind.INLINE_FRAGMENT,
            typeCondition: {
                kind: Kind.NAMED_TYPE,
                name: { kind: Kind.NAME, value: typeName },
            },
            selectionSet: treeToSelectionSet(subtree),
        });
    }
    return { kind: Kind.SELECTION_SET, selections };
};

const isSelectionPathSelected = (tree: SelectionTree, path: Path): boolean => {
    let current = tree;
    for (const segment of path) {
        if (typeof segment !== 'string') return false;
        if (segment.startsWith('__on:')) {
            const typeName = segment.slice(5);
            const next = current.fragments[typeName];
            if (!next) return false;
            current = next;
            continue;
        }
        const next = current.fields[segment];
        if (!next) return false;
        current = next;
    }
    return true;
};

const addSelectionPath = (
    tree: SelectionTree,
    path: Path,
    leafTree: SelectionTree = createSelectionTree()
): SelectionTree => {
    if (path.length === 0) return tree;
    const [head, ...rest] = path;
    if (typeof head !== 'string') return tree;

    if (head.startsWith('__on:')) {
        const typeName = head.slice(5);
        const current = tree.fragments[typeName] ?? createSelectionTree();
        const next =
            rest.length === 0
                ? leafTree
                : addSelectionPath(current, rest, leafTree);
        return {
            ...tree,
            fragments: {
                ...tree.fragments,
                [typeName]: next,
            },
        };
    }

    const current = tree.fields[head] ?? createSelectionTree();
    const next =
        rest.length === 0
            ? leafTree
            : addSelectionPath(current, rest, leafTree);
    return {
        ...tree,
        fields: {
            ...tree.fields,
            [head]: next,
        },
    };
};

const removeSelectionPath = (tree: SelectionTree, path: Path): SelectionTree => {
    if (path.length === 0) return tree;
    const [head, ...rest] = path;
    if (typeof head !== 'string') return tree;

    if (head.startsWith('__on:')) {
        const typeName = head.slice(5);
        const current = tree.fragments[typeName];
        if (!current) return tree;
        if (rest.length === 0) {
            const nextFragments = { ...tree.fragments };
            delete nextFragments[typeName];
            return { ...tree, fragments: nextFragments };
        }
        const nextChild = removeSelectionPath(current, rest);
        const nextFragments = { ...tree.fragments };
        if (isSelectionTreeEmpty(nextChild)) {
            delete nextFragments[typeName];
        } else {
            nextFragments[typeName] = nextChild;
        }
        return { ...tree, fragments: nextFragments };
    }

    const current = tree.fields[head];
    if (!current) return tree;
    if (rest.length === 0) {
        const nextFields = { ...tree.fields };
        delete nextFields[head];
        return { ...tree, fields: nextFields };
    }
    const nextChild = removeSelectionPath(current, rest);
    const nextFields = { ...tree.fields };
    if (isSelectionTreeEmpty(nextChild)) {
        delete nextFields[head];
    } else {
        nextFields[head] = nextChild;
    }
    return { ...tree, fields: nextFields };
};

const unwrapOutputType = (type: GraphQLType): GraphQLNamedType => {
    if (isNonNullType(type) || isListType(type)) {
        return unwrapOutputType(type.ofType);
    }
    return type as GraphQLNamedType;
};

const isObjectLikeType = (type: GraphQLNamedType): boolean =>
    isObjectType(type) || isInterfaceType(type) || isUnionType(type);

const buildDefaultSelectionTree = (type: GraphQLOutputType): SelectionTree => {
    const named = unwrapOutputType(type);
    if (isUnionType(named)) {
        return {
            fields: { __typename: createSelectionTree() },
            fragments: {},
        };
    }
    if (isObjectType(named) || isInterfaceType(named)) {
        const tree = createSelectionTree();
        const fields = Object.values(named.getFields());
        const leafFields = fields.filter((field) => {
            const base = unwrapOutputType(field.type);
            return !isObjectLikeType(base);
        });
        const selected = leafFields.slice(0, 5);
        if (selected.length === 0) {
            tree.fields.__typename = createSelectionTree();
        } else {
            selected.forEach((field) => {
                tree.fields[field.name] = createSelectionTree();
            });
        }
        return tree;
    }
    return createSelectionTree();
};

const ensureNonEmptySelection = (
    tree: SelectionTree,
    type: GraphQLOutputType | null
): SelectionTree => {
    if (!type) return tree;
    const named = unwrapOutputType(type);
    if (!isObjectLikeType(named)) return tree;
    if (!isSelectionTreeEmpty(tree)) return tree;
    return {
        fields: { __typename: createSelectionTree() },
        fragments: {},
    };
};

const countSelections = (tree: SelectionTree): number => {
    const fieldCount = Object.values(tree.fields).reduce(
        (acc, child) => acc + 1 + countSelections(child),
        0
    );
    const fragmentCount = Object.values(tree.fragments).reduce(
        (acc, child) => acc + countSelections(child),
        0
    );
    return fieldCount + fragmentCount;
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

        // Cast definitions to any to satisfy TypeScript's readonly DefinitionNode[] expectation
        return { next: print({ ...doc, definitions: nextDefinitions as any }) };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { next: query, error: message };
    }
}

function parseQuerySelectionTree(
    query: string,
    rootFieldName: string,
    operationType?: 'query' | 'mutation' | 'subscription'
): { tree: SelectionTree; error?: string; missingRoot?: boolean } {
    if (!query.trim() || !rootFieldName) {
        return { tree: createSelectionTree() };
    }
    try {
        const doc = parse(query);
        const match = findOperationWithField(doc, rootFieldName, operationType);
        if (!match) {
            return { tree: createSelectionTree(), missingRoot: true };
        }
        return { tree: selectionSetToTree(match.field.selectionSet) };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { tree: createSelectionTree(), error: message };
    }
}

function applySelectionTreeToQuery(
    query: string,
    rootFieldName: string,
    tree: SelectionTree,
    rootFieldType: GraphQLOutputType | null,
    operationType?: 'query' | 'mutation' | 'subscription'
): { next: string; error?: string } {
    if (!query.trim() || !rootFieldName) return { next: query };
    try {
        const doc = parse(query);
        const match = findOperationWithField(doc, rootFieldName, operationType);
        if (!match) {
            return { next: query };
        }

        const { operation, operationIndex } = match;
        const normalizedTree = ensureNonEmptySelection(tree, rootFieldType);
        const selectionSet = isSelectionTreeEmpty(normalizedTree)
            ? undefined
            : treeToSelectionSet(normalizedTree);

        const nextSelections = operation.selectionSet.selections.map((selection) => {
            if (selection.kind !== Kind.FIELD || selection.name.value !== rootFieldName) {
                return selection;
            }
            return {
                ...selection,
                selectionSet,
            };
        });

        const nextOperation: OperationDefinitionNode = {
            ...operation,
            selectionSet: {
                ...operation.selectionSet,
                selections: nextSelections,
            },
        };

        const nextDefinitions = [...doc.definitions];
        nextDefinitions[operationIndex] = nextOperation;

        // Cast definitions to any to satisfy TypeScript's readonly DefinitionNode[] expectation
        return { next: print({ ...doc, definitions: nextDefinitions as any }) };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid query.';
        return { next: query, error: message };
    }
}

function findOperationWithField(
    doc: import('graphql').DocumentNode,
    rootFieldName: string,
    operationType?: 'query' | 'mutation' | 'subscription'
): { operation: OperationDefinitionNode; operationIndex: number; field: FieldNode } | null {
    for (let i = 0; i < doc.definitions.length; i++) {
        const def = doc.definitions[i];
        if (def.kind !== Kind.OPERATION_DEFINITION) continue;
        const operation = def as OperationDefinitionNode;
        if (operationType && operation.operation !== operationType) continue;
        if (!operation.selectionSet) continue;
        for (const selection of operation.selectionSet.selections) {
            if (selection.kind === Kind.FIELD && selection.name.value === rootFieldName) {
                return { operation, operationIndex: i, field: selection as FieldNode };
            }
        }
    }
    return null;
}

export default function ParametersPanel({
    contextLabel,
    field,
    operationType,
}: ParametersPanelProps) {
    const store = useStore();
    const activeTab = store.getActiveTab();
    const [activeBuilderTab, setActiveBuilderTab] = React.useState<'parameters' | 'selection'>('parameters');
    const [expandedPaths, setExpandedPaths] = React.useState<Record<string, boolean>>({});
    const [selectionExpandedPaths, setSelectionExpandedPaths] = React.useState<Record<string, boolean>>({});
    const rootFieldName = field?.name ?? contextLabel ?? '';

    const rootFieldType = useMemo(() => {
        if (field) return field.type;
        if (!store.schema || !rootFieldName) return null;
        const rootTypes = operationType
            ? [
                operationType === 'mutation'
                    ? store.schema.getMutationType()
                    : operationType === 'subscription'
                        ? store.schema.getSubscriptionType()
                        : store.schema.getQueryType(),
            ]
            : [
                store.schema.getQueryType(),
                store.schema.getMutationType(),
                store.schema.getSubscriptionType(),
            ];
        for (const rootType of rootTypes) {
            const fields = rootType?.getFields();
            if (fields && fields[rootFieldName]) {
                return fields[rootFieldName].type;
            }
        }
        return null;
    }, [field, operationType, rootFieldName, store.schema]);

    const selectionState = useMemo(
        () => parseQuerySelectionTree(activeTab.query, rootFieldName),
        [activeTab.query, rootFieldName]
    );
    const selectionTree = selectionState.tree;
    const selectionError = selectionState.error;
    const selectionMissingRoot = selectionState.missingRoot;

    const rootNamedType = useMemo(
        () => (rootFieldType ? unwrapOutputType(rootFieldType) : null),
        [rootFieldType]
    );
    const selectionSupported = rootNamedType ? isObjectLikeType(rootNamedType) : false;
    const selectionCount = useMemo(() => countSelections(selectionTree), [selectionTree]);

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

    const updateQuerySelectionSet = useCallback(
        (nextTree: SelectionTree) => {
            if (!rootFieldName) return;
            const { next } = applySelectionTreeToQuery(
                activeTab.query,
                rootFieldName,
                nextTree,
                rootFieldType
            );
            if (next === activeTab.query) return;
            store.updateTab(activeTab.id, { query: next });
        },
        [activeTab.id, activeTab.query, rootFieldName, rootFieldType, store]
    );

    const handleToggleSelection = useCallback(
        (path: Path, fieldType: GraphQLOutputType, includeDefaults = true) => {
            if (selectionError) return;
            const isSelected = isSelectionPathSelected(selectionTree, path);
            const defaultTree = includeDefaults
                ? buildDefaultSelectionTree(fieldType)
                : createSelectionTree();
            const nextTree = isSelected
                ? removeSelectionPath(selectionTree, path)
                : addSelectionPath(selectionTree, path, defaultTree);
            const normalized = ensureNonEmptySelection(nextTree, rootFieldType);
            updateQuerySelectionSet(normalized);
        },
        [selectionError, selectionTree, rootFieldType, updateQuerySelectionSet]
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

    const depthStyles = [
        "border-emerald-500/40 bg-emerald-500/5",
        "border-sky-500/40 bg-sky-500/5",
        "border-amber-500/40 bg-amber-500/5",
        "border-purple-500/40 bg-purple-500/5",
    ];

    const modeButtonClass = (active: boolean, tone: 'inline' | 'panel') =>
        cn(
            "h-6 px-2 text-[10px] font-semibold transition-colors",
            active
                ? tone === 'inline'
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                : "text-muted-foreground hover:text-foreground"
        );

    const builderTabClass = (active: boolean) =>
        cn(
            "px-2.5 py-1 text-[10px] font-semibold rounded-sm transition-all",
            active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
        );

    const renderInputForType = (
        variableName: string,
        type: GraphQLInputType,
        value: unknown,
        path: Path,
        depth = 0
    ): React.ReactNode => {
        const resolvedType = isNonNullType(type) ? type.ofType : type;
        const pathKey = getPathKey(path);
        const shouldCollapse = depth >= DEFAULT_EXPANDED_DEPTH;
        const isExpanded = !shouldCollapse || Boolean(expandedPaths[pathKey]);
        const selectClassName =
            "h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

        if (isListType(resolvedType)) {
            const itemType = resolvedType.ofType as GraphQLInputType;
            const listValue = Array.isArray(value) ? value : [];
            return (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className="h-4 px-1.5 text-[9px] uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30"
                            >
                                List
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-mono">
                                {getTypeString(itemType)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {listValue.length} items
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => handleAddArrayItem(variableName, path, itemType)}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            Add item
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
                                    className={cn(
                                        "rounded-md border border-border/60 p-2 space-y-2",
                                        depthStyles[(depth + 1) % depthStyles.length]
                                    )}
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
                                    {renderInputForType(variableName, itemType, item, [...path, index], depth + 1)}
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
                <div
                    className={cn(
                        "space-y-2 pl-3 border-l-2 rounded-md p-2",
                        depthStyles[depth % depthStyles.length]
                    )}
                >
                    {shouldCollapse && (
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Badge
                                    variant="secondary"
                                    className="h-4 px-1 text-[9px] uppercase tracking-wider bg-slate-500/10 text-slate-200 border border-slate-500/30"
                                >
                                    Nested
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    {getTypeString(resolvedType)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {Object.keys(fields).length} fields
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() =>
                                    setExpandedPaths((prev) => ({
                                        ...prev,
                                        [pathKey]: !prev[pathKey],
                                    }))
                                }
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-3 w-3 mr-1" />
                                ) : (
                                    <ChevronRight className="h-3 w-3 mr-1" />
                                )}
                                {isExpanded ? 'Collapse' : 'Expand'}
                            </Button>
                        </div>
                    )}
                    {!isExpanded ? (
                        <div className="text-[11px] text-muted-foreground italic">
                            Nested fields are collapsed. Expand to edit.
                        </div>
                    ) : Object.keys(fields).length === 0 ? (
                        <div className="text-[11px] text-muted-foreground italic">
                            No fields
                        </div>
                    ) : (
                        Object.values(fields).map((field) => {
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
                                            <Badge
                                                variant="secondary"
                                                className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                            >
                                                {getTypeString(fieldType)}
                                            </Badge>
                                            {isNonNullType(fieldType) && (
                                                <Badge
                                                    variant="secondary"
                                                    className="h-4 px-1 text-[9px] uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30"
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
                                        [...path, field.name],
                                        depth + 1
                                    )}
                                    {field.description && (
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {field.description}
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    )}
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

    const renderSelectionFields = (
        type: GraphQLNamedType,
        path: Path,
        depth = 0
    ): React.ReactNode => {
        if (isUnionType(type)) {
            return (
                <div className="space-y-3">
                    <div className="space-y-2">
                        {type.getTypes().length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">
                                Union has no member types.
                            </div>
                        ) : (
                            type.getTypes().map((member) => {
                                const fragmentPath: Path = [...path, `__on:${member.name}`];
                                const fragmentKey = getPathKey(fragmentPath);
                                const fragmentSelected = isSelectionPathSelected(
                                    selectionTree,
                                    fragmentPath
                                );
                                const shouldCollapse = depth >= DEFAULT_SELECTION_EXPANDED_DEPTH;
                                const isExpanded = !shouldCollapse || selectionExpandedPaths[fragmentKey];
                                return (
                                    <div
                                        key={member.name}
                                        className={cn(
                                            "rounded-md border border-border/60 p-2 space-y-2",
                                            depthStyles[(depth + 1) % depthStyles.length]
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <button
                                                    className={cn(
                                                        "h-5 w-5 rounded border border-border/60 flex items-center justify-center",
                                                        fragmentSelected
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-background text-muted-foreground hover:text-foreground"
                                                    )}
                                                    onClick={() =>
                                                        handleToggleSelection(fragmentPath, member)
                                                    }
                                                    title={`Toggle on ${member.name}`}
                                                >
                                                    {fragmentSelected && <Check className="h-3 w-3" />}
                                                </button>
                                                <span className="text-xs font-semibold truncate">
                                                    on {member.name}
                                                </span>
                                                <Badge
                                                    variant="secondary"
                                                    className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                                >
                                                    Inline Fragment
                                                </Badge>
                                            </div>
                                            <button
                                                className="text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() =>
                                                    setSelectionExpandedPaths((prev) => ({
                                                        ...prev,
                                                        [fragmentKey]: !prev[fragmentKey],
                                                    }))
                                                }
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        </div>
                                        {isExpanded ? (
                                            <div className="pl-3 border-l-2 rounded-md space-y-2">
                                                {renderSelectionFields(member, fragmentPath, depth + 1)}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-muted-foreground italic">
                                                Nested fields collapsed.
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            );
        }

        if (!isObjectType(type) && !isInterfaceType(type)) {
            return (
                <div className="text-[11px] text-muted-foreground italic">
                    No selectable fields for this type.
                </div>
            );
        }

        // Exclude GraphQL meta fields (names starting with __) from the selectable list
        const selectableFields = Object.values(type.getFields())
            .filter((f) => !f.name.startsWith('__'))
            .map((field) => ({
                name: field.name,
                type: field.type,
                description: field.description,
            }));

        return (
            <div className="space-y-2">
                {selectableFields.map((field) => {
                    const fieldPath: Path = [...path, field.name];
                    const fieldKey = getPathKey(fieldPath);
                    const isSelected = isSelectionPathSelected(selectionTree, fieldPath);
                    const namedType = unwrapOutputType(field.type);
                    const isNested = isObjectLikeType(namedType);
                    const shouldCollapse = isNested && depth >= DEFAULT_SELECTION_EXPANDED_DEPTH;
                    const isExpanded = isNested && (!shouldCollapse || selectionExpandedPaths[fieldKey]);

                    return (
                        <div key={fieldKey} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        className={cn(
                                            "h-5 w-5 rounded border border-border/60 flex items-center justify-center",
                                            isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-background text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() => handleToggleSelection(fieldPath, field.type)}
                                        title={`Toggle ${field.name}`}
                                    >
                                        {isSelected && <Check className="h-3 w-3" />}
                                    </button>
                                    <span className="font-mono text-xs font-semibold truncate">
                                        {field.name}
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                    >
                                        {getTypeString(field.type)}
                                    </Badge>
                                </div>
                                {isNested && (
                                    <button
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() =>
                                            setSelectionExpandedPaths((prev) => ({
                                                ...prev,
                                                [fieldKey]: !prev[fieldKey],
                                            }))
                                        }
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>
                            {field.description && (
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                    {field.description}
                                </p>
                            )}
                            {isNested && isExpanded && (
                                <div
                                    className={cn(
                                        "pl-3 border-l-2 rounded-md p-2 space-y-2",
                                        depthStyles[(depth + 1) % depthStyles.length]
                                    )}
                                >
                                    {renderSelectionFields(namedType, fieldPath, depth + 1)}
                                </div>
                            )}
                            {isNested && !isExpanded && shouldCollapse && (
                                <div className="text-[10px] text-muted-foreground italic">
                                    Nested fields collapsed.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderParametersContent = () => {
        if (variableError) {
            return (
                <div className="text-xs text-muted-foreground">
                    Fix the query syntax to load the parameter builder.
                </div>
            );
        }
        if (panelError) {
            return (
                <div className="text-xs text-muted-foreground">
                    Variables JSON is invalid. Parameter edits here will overwrite it.
                </div>
            );
        }
        if (variableDefinitions.length === 0) {
            return (
                <div className="text-xs text-muted-foreground">
                    No parameters in the current operation.
                </div>
            );
        }
        return variableDefinitions.map((definition) => {
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
                    className="space-y-2 rounded-md border border-border/60 bg-gradient-to-br from-muted/20 via-card/40 to-card p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs font-semibold truncate">
                                {definition.name}
                            </span>
                            <Badge
                                variant="secondary"
                                className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                            >
                                {definition.typeString}
                            </Badge>
                            {definition.required && (
                                <Badge
                                    variant="secondary"
                                    className="h-4 px-1 text-[9px] uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30"
                                >
                                    Required
                                </Badge>
                            )}
                            {!hasValue && (
                                <Badge
                                    variant="secondary"
                                    className="h-4 px-1 text-[9px] uppercase tracking-wider bg-slate-500/10 text-slate-300 border border-slate-500/30"
                                >
                                    Unset
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
                                <button
                                    className={modeButtonClass(mode === 'inline', 'inline')}
                                    onClick={() => handleSetVariableMode(definition, 'inline')}
                                    title="Store in query"
                                >
                                    Query
                                </button>
                                <button
                                    className={modeButtonClass(mode === 'panel', 'panel')}
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
                        [definition.name],
                        0
                    )}
                </div>
            );
        });
    };

    const renderSelectionSetContent = () => {
        if (!rootFieldName) {
            return (
                <div className="text-xs text-muted-foreground">
                    Select a query field to edit its selection set.
                </div>
            );
        }
        if (selectionError) {
            return (
                <div className="text-xs text-muted-foreground">
                    Fix the query syntax to edit the selection set.
                </div>
            );
        }
        if (!rootFieldType || !rootNamedType) {
            return (
                <div className="text-xs text-muted-foreground">
                    Selection set builder needs a valid field in the schema.
                </div>
            );
        }
        if (!selectionSupported) {
            return (
                <div className="text-xs text-muted-foreground">
                    This field returns a scalar value, so no selection set is required.
                </div>
            );
        }
        return (
            <div className="space-y-3">
                <div className="text-[11px] text-muted-foreground">
                    Selection set for{" "}
                    <span className="font-mono text-foreground">{rootFieldName}</span>{" "}
                    <span className="font-mono text-muted-foreground">{getTypeString(rootFieldType)}</span>
                </div>
                {selectionMissingRoot && (
                    <div className="text-[10px] text-amber-300/80">
                        Current query does not include this field. Changes here will insert it.
                    </div>
                )}
                {renderSelectionFields(rootNamedType, [], 0)}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center border-b border-border/60">
                <div className="flex gap-2">
                    <Button
                        variant={activeBuilderTab === 'parameters' ? 'default' : 'ghost'}
                        className="h-9 px-3 text-sm font-semibold"
                        onClick={() => setActiveBuilderTab('parameters')}
                    >
                        Parameters
                    </Button>
                    <Button
                        variant={activeBuilderTab === 'selection' ? 'default' : 'ghost'}
                        className="h-9 px-3 text-sm font-semibold"
                        onClick={() => setActiveBuilderTab('selection')}
                        disabled={!selectionSupported}
                    >
                        Selection Set
                    </Button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Badge
                        variant="secondary"
                        className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    >
                        {operationType
                            ? (operationType.charAt(0).toUpperCase() + operationType.slice(1))
                            : 'Query'}
                    </Badge>
                    {field && (
                        <Badge
                            variant="secondary"
                            className="h-4 px-1 text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                        >
                            {field.name}
                        </Badge>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                    <div className="p-4 space-y-4">
                        {activeBuilderTab === 'parameters' && renderParametersContent()}
                        {activeBuilderTab === 'selection' && renderSelectionSetContent()}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
