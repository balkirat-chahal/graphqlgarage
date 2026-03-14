import {
    buildClientSchema,
    getIntrospectionQuery,
    printSchema,
    parse,
    print,
} from 'graphql';

/**
 * Introspect a GraphQL endpoint and return schema data
 */
export async function introspectSchema(endpoint, headers = {}) {
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

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors.map((e) => e.message).join('\n'));
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
export async function executeQuery(endpoint, query, variables = '{}', headers = '{}') {
    let parsedVars = {};
    let parsedHeaders = {};

    try {
        parsedVars = JSON.parse(variables || '{}');
    } catch {
        throw new Error('Invalid JSON in variables');
    }

    try {
        parsedHeaders = JSON.parse(headers || '{}');
    } catch {
        throw new Error('Invalid JSON in headers');
    }

    const startTime = performance.now();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...parsedHeaders,
        },
        body: JSON.stringify({
            query,
            variables: parsedVars,
        }),
    });

    const endTime = performance.now();
    const elapsed = Math.round(endTime - startTime);

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
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
export function extractOperationName(query) {
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
export function prettifyQuery(query) {
    try {
        const ast = parse(query);
        return print(ast);
    } catch (e) {
        throw new Error(`Parse error: ${e.message}`);
    }
}

/**
 * Parse schema into structured sections for docs
 */
export function parseSchemaForDocs(schema) {
    if (!schema) return null;

    const typeMap = schema.getTypeMap();
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    const queries = queryType ? Object.values(queryType.getFields()) : [];
    const mutations = mutationType ? Object.values(mutationType.getFields()) : [];
    const subscriptions = subscriptionType ? Object.values(subscriptionType.getFields()) : [];

    const types = [];
    const inputs = [];
    const enums = [];
    const scalars = [];

    for (const [name, type] of Object.entries(typeMap)) {
        if (name.startsWith('__')) continue;
        if (queryType && name === queryType.name) continue;
        if (mutationType && name === mutationType.name) continue;
        if (subscriptionType && name === subscriptionType.name) continue;

        const constructor = type.constructor.name;

        if (constructor === 'GraphQLObjectType') {
            types.push(type);
        } else if (constructor === 'GraphQLInputObjectType') {
            inputs.push(type);
        } else if (constructor === 'GraphQLEnumType') {
            enums.push(type);
        } else if (constructor === 'GraphQLScalarType') {
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
export function getTypeString(type) {
    if (!type) return '';
    if (type.kind === 'NON_NULL' || type.ofType) {
        if (type.constructor.name === 'GraphQLNonNull') {
            return `${getTypeString(type.ofType)}!`;
        }
        if (type.constructor.name === 'GraphQLList') {
            return `[${getTypeString(type.ofType)}]`;
        }
    }
    return type.name || type.toString();
}

/**
 * Get the base (unwrapped) type name for navigation
 */
export function getBaseTypeName(type) {
    if (!type) return null;
    if (type.ofType) return getBaseTypeName(type.ofType);
    return type.name;
}

/**
 * Build a query string for a field (for click-to-insert)
 */
export function buildQueryForField(field, operationType = 'query') {
    const args = field.args || [];
    let argsStr = '';
    if (args.length > 0) {
        const argParts = args.map((a) => {
            const baseType = getBaseTypeName(a.type);
            return `$${a.name}: ${getTypeString(a.type)}`;
        });
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

    return `${operationType}${varDecl ? ' ' + field.name + varDecl : ''} {\n  ${field.name}${argsStr}${body}\n}\n`;
}

function getSubFields(type) {
    const unwrapped = unwrapType(type);
    if (unwrapped && typeof unwrapped.getFields === 'function') {
        const fields = unwrapped.getFields();
        return Object.keys(fields).filter(
            (f) => {
                const ft = unwrapType(fields[f].type);
                return !ft || typeof ft.getFields !== 'function';
            }
        );
    }
    return [];
}

function unwrapType(type) {
    if (!type) return null;
    if (type.ofType) return unwrapType(type.ofType);
    return type;
}
