import {
    buildClientSchema,
    getIntrospectionQuery,
    printSchema,
    parse,
    print,
    GraphQLSchema,
    IntrospectionQuery,
    GraphQLField,
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLEnumType,
    GraphQLScalarType,
    isObjectType,
    isInputObjectType,
    isEnumType,
    isScalarType,
    GraphQLType,
    isListType,
    isNonNullType,
} from 'graphql';

export type GraphQLResponse<TData = unknown> = {
    data?: TData;
    errors?: ReadonlyArray<{ message?: string; [key: string]: unknown }>;
    error?: string;
    [key: string]: unknown;
};

export interface IntrospectionSchemaResult {
    schema: GraphQLSchema;
    sdl: string;
    introspection: IntrospectionQuery;
}

export interface SchemaDocs {
    queries: GraphQLField<unknown, unknown>[];
    mutations: GraphQLField<unknown, unknown>[];
    subscriptions: GraphQLField<unknown, unknown>[];
    types: GraphQLObjectType[];
    inputs: GraphQLInputObjectType[];
    enums: GraphQLEnumType[];
    scalars: GraphQLScalarType[];
}

type IntrospectionTypeRef = {
    kind?: string;
    name?: string | null;
    ofType?: IntrospectionTypeRef | null;
};

type TypeRef = GraphQLType | IntrospectionTypeRef;

/**
 * Introspect a GraphQL endpoint and return schema data
 */
export async function introspectSchema(
    endpoint: string,
    headers: Record<string, string> = {}
): Promise<IntrospectionSchemaResult> {
    const introspectionQuery = getIntrospectionQuery();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...headers,
        },
        body: JSON.stringify({ query: introspectionQuery }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<IntrospectionQuery>;

    if (result.errors && result.errors.length > 0) {
        const messages = result.errors
            .map((e) => e.message)
            .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
        throw new Error(messages.length > 0 ? messages.join('\n') : 'GraphQL error');
    }

    if (!result.data) {
        throw new Error('No data returned from introspection query');
    }

    const schema = buildClientSchema(result.data);
    const sdl = printSchema(schema);

    return {
        schema,
        sdl,
        introspection: result.data,
    };
}

/**
 * Execute a GraphQL query
 */
export async function executeQuery(
    endpoint: string,
    query: string,
    variables = '{}',
    headers = '{}'
): Promise<{ data: GraphQLResponse; status: number; time: number; size: number }> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
        throw new Error('Query is empty');
    }
    try {
        parse(normalizedQuery);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid query';
        throw new Error(`Invalid query: ${message}`);
    }
    const parsedVars = parseJsonObject(variables, 'variables');
    const parsedHeaders = parseJsonObject(headers, 'headers');
    const headerRecord: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    for (const [key, value] of Object.entries(parsedHeaders)) {
        headerRecord[key] = String(value);
    }

    const startTime = performance.now();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            ...headerRecord,
        },
        body: JSON.stringify({
            query: normalizedQuery,
            ...(Object.keys(parsedVars).length > 0 ? { variables: parsedVars } : {}),
        }),
    });

    const endTime = performance.now();
    const elapsed = Math.round(endTime - startTime);

    const text = await response.text();
    let data: GraphQLResponse;
    try {
        data = JSON.parse(text) as GraphQLResponse;
    } catch {
        data = { error: 'Invalid JSON response', raw: text };
    }

    const size = new Blob([text]).size;

    return {
        data,
        status: response.status,
        time: elapsed,
        size,
    };
}

/**
 * Extract operation name from a query string
 */
export function extractOperationName(query: string) {
    try {
        const doc = parse(query);
        for (const def of doc.definitions) {
            if (def.kind === 'OperationDefinition' && def.name) {
                return def.name.value;
            }
        }
    } catch {
        // ignore parse errors
    }
    return 'Anonymous';
}

/**
 * Prettify a GraphQL query
 */
export function prettifyQuery(query: string) {
    try {
        const ast = parse(query);
        return print(ast);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Parse error: ${message}`);
    }
}

/**
 * Parse schema into structured sections for docs
 */
export function parseSchemaForDocs(schema: GraphQLSchema | null): SchemaDocs | null {
    if (!schema) return null;

    const typeMap = schema.getTypeMap();
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    const queries = queryType ? Object.values(queryType.getFields()) : [];
    const mutations = mutationType ? Object.values(mutationType.getFields()) : [];
    const subscriptions = subscriptionType ? Object.values(subscriptionType.getFields()) : [];

    const types: GraphQLObjectType[] = [];
    const inputs: GraphQLInputObjectType[] = [];
    const enums: GraphQLEnumType[] = [];
    const scalars: GraphQLScalarType[] = [];

    for (const [name, type] of Object.entries(typeMap)) {
        if (name.startsWith('__')) continue;
        if (queryType && name === queryType.name) continue;
        if (mutationType && name === mutationType.name) continue;
        if (subscriptionType && name === subscriptionType.name) continue;

        if (isObjectType(type)) {
            types.push(type);
        } else if (isInputObjectType(type)) {
            inputs.push(type);
        } else if (isEnumType(type)) {
            enums.push(type);
        } else if (isScalarType(type)) {
            scalars.push(type);
        }
    }

    return {
        queries,
        mutations,
        subscriptions,
        types: types.sort((a, b) => a.name.localeCompare(b.name)),
        inputs: inputs.sort((a, b) => a.name.localeCompare(b.name)),
        enums: enums.sort((a, b) => a.name.localeCompare(b.name)),
        scalars: scalars.sort((a, b) => a.name.localeCompare(b.name)),
    };
}

/**
 * Get the display name/string for a GraphQL type (handling wrappers like NonNull, List)
 */
export function getTypeString(type: TypeRef | null | undefined): string {
    if (!type) return '';

    // Support both GraphQL schema objects and introspection objects
    if (isNonNullType(type)) {
        return `${getTypeString(type.ofType)}!`;
    }
    if (isListType(type)) {
        return `[${getTypeString(type.ofType)}]`;
    }

    // Introspection result format
    const maybeIntrospection = type as IntrospectionTypeRef;
    if (maybeIntrospection.kind === 'NON_NULL') {
        return `${getTypeString(type.ofType)}!`;
    }
    if (maybeIntrospection.kind === 'LIST') {
        return `[${getTypeString(type.ofType)}]`;
    }

    return (type as { name?: string }).name || type.toString();
}

/**
 * Get the base (unwrapped) type name for navigation
 */
export function getBaseTypeName(type: TypeRef | null | undefined): string | null {
    if (!type) return null;
    const maybeIntrospection = type as IntrospectionTypeRef;
    if (maybeIntrospection.ofType) return getBaseTypeName(maybeIntrospection.ofType);
    return (type as { name?: string | null }).name ?? null;
}

/**
 * Build a query string for a field (for click-to-insert)
 */
export function buildQueryForField(
    field: GraphQLField<unknown, unknown>,
    operationType = 'query'
) {
    const args = field.args || [];
    let argsStr = '';
    if (args.length > 0) {
        const argUsage = args.map((a) => `${a.name}: $${a.name}`);
        argsStr = `(${argUsage.join(', ')})`;
    }

    const subFields = getSubFields(field.type);
    let body = '';
    if (subFields.length > 0) {
        body = ` {\n    ${subFields.slice(0, 5).join('\n    ')}\n  }`;
    }

    let varDecl = '';
    if (args.length > 0) {
        varDecl = `(${args.map((a) => `$${a.name}: ${getTypeString(a.type)}`).join(', ')})`;
    }

    const operationLine = `${operationType} ${field.name}${varDecl}`.trim();
    return `${operationLine} {\n  ${field.name}${argsStr}${body}\n}\n`;
}

function getSubFields(type: GraphQLType): string[] {
    const unwrapped = unwrapType(type);
    if (isObjectType(unwrapped)) {
        const fields = unwrapped.getFields();
        return Object.keys(fields).filter(
            (f) => {
                const ft = unwrapType(fields[f].type);
                return !isObjectType(ft);
            }
        );
    }
    return [];
}

function unwrapType(type: TypeRef | null | undefined): TypeRef | null {
    if (!type) return null;
    const maybeIntrospection = type as IntrospectionTypeRef;
    if (maybeIntrospection.ofType) return unwrapType(maybeIntrospection.ofType);
    return type;
}

function parseJsonObject(input: string, label: 'variables' | 'headers'): Record<string, unknown> {
    if (!input || !input.trim()) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(input);
    } catch {
        throw new Error(`Invalid JSON in ${label}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
}
