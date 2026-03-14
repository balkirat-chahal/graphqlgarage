import {
    GraphQLSchema,
    GraphQLObjectType,
    isObjectType,
    GraphQLType,
    GraphQLField,
    isNonNullType,
    isListType,
} from 'graphql';
import type * as Monaco from 'monaco-editor';

/**
 * GraphQL Language Support for Monaco Editor
 * Provides syntax highlighting, auto-completion, and hover
 */

// Monarch language definition for GraphQL syntax highlighting
export const graphqlLanguageDef: Monaco.languages.IMonarchLanguage = {
    defaultToken: 'invalid',
    keywords: [
        'query', 'mutation', 'subscription', 'fragment', 'on', 'type',
        'interface', 'union', 'enum', 'input', 'extend', 'schema',
        'directive', 'scalar', 'implements', 'true', 'false', 'null',
    ],
    typeKeywords: [
        'Int', 'Float', 'String', 'Boolean', 'ID',
    ],
    operators: ['=', '!', ':', '@', '|', '&', '...'],
    symbols: /[=!:@|&.]+/,

    tokenizer: {
        root: [
            // Comments
            [/#.*$/, 'comment'],

            // Strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"""/, 'string', '@mlstring'],
            [/"/, 'string', '@string'],

            // Numbers
            [/\d+\.\d*([eE][-+]?\d+)?/, 'number.float'],
            [/\d+([eE][-+]?\d+)?/, 'number'],

            // Variables
            [/\$[a-zA-Z_]\w*/, 'variable'],

            // Directives
            [/@[a-zA-Z_]\w*/, 'annotation'],

            // Identifiers
            [
                /[a-zA-Z_]\w*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@typeKeywords': 'type',
                        '@default': 'identifier',
                    },
                },
            ],

            // Whitespace
            { include: '@whitespace' },

            // Punctuation
            [/[{}()\[\]]/, '@brackets'],
            [/[,]/, 'delimiter'],

            // Operators
            [
                /@symbols/,
                {
                    cases: {
                        '@operators': 'operator',
                        '@default': '',
                    },
                },
            ],
        ],

        whitespace: [[/[ \t\r\n]+/, 'white']],

        string: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, 'string', '@pop'],
        ],

        mlstring: [
            [/[^"]+/, 'string'],
            [/"""/, 'string', '@pop'],
            [/"/, 'string'],
        ],
    },
};

// Theme configurations
export const graphqlDarkTheme: Monaco.editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'identifier', foreground: '9CDCFE' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.float', foreground: 'B5CEA8' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'annotation', foreground: 'DCDCAA' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'delimiter', foreground: 'D4D4D4' },
        { token: 'invalid', foreground: 'F44747' },
    ],
    colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#ffffff0a',
        'editor.selectionBackground': '#264f78',
        'editorCursor.foreground': '#aeafad',
        'editor.selectionHighlightBackground': '#add6ff26',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editorIndentGuide.background': '#404040',
        'editorIndentGuide.activeBackground': '#707070',
        'editorWidget.background': '#252526',
        'editorWidget.border': '#454545',
        'editorSuggestWidget.background': '#252526',
        'editorSuggestWidget.border': '#454545',
        'editorSuggestWidget.selectedBackground': '#04395e',
        'editorSuggestWidget.highlightForeground': '#0097fb',
        'editorHoverWidget.background': '#252526',
        'editorHoverWidget.border': '#454545',
        'scrollbarSlider.background': '#79797966',
        'scrollbarSlider.hoverBackground': '#646464b3',
        'scrollbarSlider.activeBackground': '#bfbfbf66',
    },
};

export const graphqlLightTheme: Monaco.editor.IStandaloneThemeData = {
    base: 'vs',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'AF00DB', fontStyle: 'bold' },
        { token: 'type', foreground: '267F99' },
        { token: 'identifier', foreground: '001080' },
        { token: 'string', foreground: 'A31515' },
        { token: 'number', foreground: '098658' },
        { token: 'number.float', foreground: '098658' },
        { token: 'variable', foreground: '001080' },
        { token: 'annotation', foreground: '795E26' },
        { token: 'operator', foreground: '000000' },
        { token: 'delimiter', foreground: '000000' },
    ],
    colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#0000000c',
        'editor.selectionBackground': '#add6ff',
        'editorCursor.foreground': '#000000',
        'editorLineNumber.foreground': '#237893',
        'editorLineNumber.activeForeground': '#0b216f',
    },
};

/**
 * Register GraphQL language and themes in Monaco
 */
export function registerGraphQLLanguage(monaco: typeof import('monaco-editor')) {
    if (!monaco.languages.getLanguages().find((l) => l.id === 'graphql')) {
        monaco.languages.register({ id: 'graphql' });
        monaco.languages.setMonarchTokensProvider('graphql', graphqlLanguageDef);
    }

    monaco.editor.defineTheme('graphql-dark', graphqlDarkTheme);
    monaco.editor.defineTheme('graphql-light', graphqlLightTheme);
}

/**
 * Create an auto-complete provider for GraphQL based on introspected schema
 */
export function createCompletionProvider(
    schema: GraphQLSchema | null
): Monaco.languages.CompletionItemProvider | null {
    if (!schema) return null;

    const typeMap = schema.getTypeMap();
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    return {
        triggerCharacters: ['{', '(', ':', ' ', '\n', '.', '$', '@'],
        provideCompletionItems: (model, position) => {
            const textUntilPosition = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            const word = model.getWordUntilPosition(position);
            const range: Monaco.IRange = {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
            };

            const suggestions: Monaco.languages.CompletionItem[] = [];

            // Detect context
            const lines = textUntilPosition.split('\n');
            const currentLine = lines[lines.length - 1] || '';

            // Top-level keywords
            const topLevel = textUntilPosition.trim();
            if (!topLevel || /^\s*$/.test(currentLine)) {
                const braceDepth = countChar(textUntilPosition, '{') - countChar(textUntilPosition, '}');
                if (braceDepth === 0) {
                    suggestions.push(
                        makeKeyword('query', range, 'Define a query operation'),
                        makeKeyword('mutation', range, 'Define a mutation operation'),
                        makeKeyword('subscription', range, 'Define a subscription operation'),
                        makeKeyword('fragment', range, 'Define a reusable fragment'),
                    );
                }
            }

            // Field suggestions inside braces
            const braceDepth = countChar(textUntilPosition, '{') - countChar(textUntilPosition, '}');
            if (braceDepth > 0) {
                // Try to determine which type we're in
                const rootType = detectRootType(textUntilPosition, queryType, mutationType, subscriptionType);
                if (rootType && braceDepth === 1) {
                    // Root-level fields
                    const fields = rootType.getFields();
                    for (const [name, field] of Object.entries(fields)) {
                        suggestions.push(makeFieldSuggestion(name, field, range));
                    }
                } else if (braceDepth > 1) {
                    // Nested fields — try to find the enclosing type
                    const enclosingType = findEnclosingType(textUntilPosition, schema, queryType, mutationType, subscriptionType);
                    if (enclosingType && isObjectType(enclosingType)) {
                        const fields = enclosingType.getFields();
                        for (const [name, field] of Object.entries(fields)) {
                            suggestions.push(makeFieldSuggestion(name, field, range));
                        }
                    }
                }

                // Always suggest __typename
                suggestions.push({
                    label: '__typename',
                    kind: 5, // Field
                    detail: 'String!',
                    documentation: 'The name of the current Object type',
                    insertText: '__typename',
                    range,
                    sortText: 'zzz__typename',
                });
            }

            // Argument suggestions inside parentheses
            const parenDepth = countChar(textUntilPosition, '(') - countChar(textUntilPosition, ')');
            if (parenDepth > 0) {
                // Find the field name before the parens
                const fieldMatch = textUntilPosition.match(/(\w+)\s*\([^)]*$/);
                if (fieldMatch) {
                    const fieldName = fieldMatch[1];
                    const rootType = detectRootType(textUntilPosition, queryType, mutationType, subscriptionType);
                    if (rootType) {
                        const fields = rootType.getFields();
                        const field = fields[fieldName];
                        if (field && field.args) {
                            for (const arg of field.args) {
                                suggestions.push({
                                    label: arg.name,
                                    kind: 5,
                                    detail: arg.type.toString(),
                                    documentation: arg.description || '',
                                    insertText: `${arg.name}: `,
                                    range,
                                    sortText: `0_${arg.name}`,
                                });
                            }
                        }
                    }
                }
            }

            // Type name suggestions (after "on", or in variable types)
            if (/\bon\s+\w*$/.test(currentLine) || /:\s*\w*$/.test(currentLine)) {
                for (const [name, type] of Object.entries(typeMap)) {
                    if (name.startsWith('__')) continue;
                    suggestions.push({
                        label: name,
                        kind: 7, // Class/Type
                        detail: type.constructor.name.replace('GraphQL', ''),
                        documentation: type.description || '',
                        insertText: name,
                        range,
                    });
                }
            }

            // Directive suggestions
            if (currentLine.includes('@')) {
                const directives = schema.getDirectives();
                for (const dir of directives) {
                    suggestions.push({
                        label: `@${dir.name}`,
                        kind: 1, // Method
                        detail: 'directive',
                        documentation: dir.description || '',
                        insertText: dir.name,
                        range,
                    });
                }
            }

            return { suggestions };
        },
    };
}

/**
 * Create a hover provider for GraphQL
 */
export function createHoverProvider(
    schema: GraphQLSchema | null
): Monaco.languages.HoverProvider | null {
    if (!schema) return null;

    return {
        provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const text = word.word;
            const typeMap = schema.getTypeMap();

            // Check if it's a type
            if (typeMap[text]) {
                const type = typeMap[text];
                const kind = type.constructor.name.replace('GraphQL', '');
                let contents = [`**${text}** *(${kind})*`];
                if (type.description) {
                    contents.push(type.description);
                }
                if (isObjectType(type)) {
                    const fieldNames = Object.keys(type.getFields()).slice(0, 10);
                    contents.push('```graphql\n' + fieldNames.join(', ') + (fieldNames.length >= 10 ? ', ...' : '') + '\n```');
                }
                return {
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endLineNumber: position.lineNumber,
                        endColumn: word.endColumn,
                    },
                    contents: contents.map((c) => ({ value: c })),
                };
            }

            return null;
        },
    };
}

// ========== Helpers ==========

function countChar(str: string, char: string): number {
    let count = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === char) count++;
    }
    return count;
}

function detectRootType(text: string, queryType: GraphQLObjectType | null | undefined, mutationType: GraphQLObjectType | null | undefined, subscriptionType: GraphQLObjectType | null | undefined): GraphQLObjectType | null | undefined {
    // Find the last operation keyword before the first brace
    const match = text.match(/(query|mutation|subscription)\b/g);
    if (!match) return queryType;
    const lastOp = match[match.length - 1];
    if (lastOp === 'mutation') return mutationType;
    if (lastOp === 'subscription') return subscriptionType;
    return queryType;
}

function findEnclosingType(text: string, schema: GraphQLSchema, queryType: GraphQLObjectType | null | undefined, mutationType: GraphQLObjectType | null | undefined, subscriptionType: GraphQLObjectType | null | undefined): GraphQLType | null {
    // Simple approach: find the field names in the path from root to cursor
    const rootType = detectRootType(text, queryType, mutationType, subscriptionType);
    if (!rootType) return null;

    // Extract field names between braces
    let currentField = '';

    const tokens = text.match(/[{}]|\b\w+\b/g) || [];
    const fieldStack: string[] = [];

    for (const token of tokens) {
        if (token === '{') {
            if (currentField) {
                fieldStack.push(currentField);
            }
            currentField = '';
        } else if (token === '}') {
            fieldStack.pop();
            currentField = '';
        } else if (
            !['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null'].includes(token)
        ) {
            currentField = token;
        }
    }

    // walk the type tree
    let currentType: GraphQLType | null = rootType;
    for (const fieldName of fieldStack) {
        if (!currentType || !isObjectType(currentType)) return null;
        const fields = currentType.getFields();
        const field = fields[fieldName];
        if (!field) return null;
        currentType = unwrapType(field.type);
    }

    return currentType;
}

function unwrapType(type: GraphQLType | null | undefined): GraphQLType | null {
    if (!type) return null;
    if (isNonNullType(type) || isListType(type)) return unwrapType(type.ofType);
    return type;
}

function makeKeyword(
    label: string,
    range: Monaco.IRange,
    doc: string
): Monaco.languages.CompletionItem {
    return {
        label,
        kind: 14, // Keyword
        documentation: doc,
        insertText: `${label} {\n  $0\n}`,
        insertTextRules: Monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `0_${label}`,
    };
}

function makeFieldSuggestion(
    name: string,
    field: GraphQLField<unknown, unknown>,
    range: Monaco.IRange
): Monaco.languages.CompletionItem {
    const type = field.type.toString();
    const hasArgs = field.args && field.args.length > 0;
    const hasSubFields = hasObjectSubFields(field.type);

    let insertText = name;
    if (hasArgs) {
        const requiredArgs = field.args.filter(
            (a) => isNonNullType(a.type)
        );
        if (requiredArgs.length > 0) {
            const argSnippets = requiredArgs.map(
                (a, i) => `${a.name}: $\{${i + 1}}`
            );
            insertText = `${name}(${argSnippets.join(', ')})`;
        }
    }
    if (hasSubFields) {
        insertText += ' {\n  $0\n}';
    }

    return {
        label: name,
        kind: 5, // Field
        detail: type,
        documentation: field.description || '',
        insertText,
        insertTextRules:
            hasSubFields || hasArgs
                ? Monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : Monaco.languages.CompletionItemInsertTextRule.None,
        range,
        sortText: `1_${name}`,
    };
}

function hasObjectSubFields(type: GraphQLType): boolean {
    const unwrapped = unwrapType(type);
    return !!unwrapped && isObjectType(unwrapped);
}
