import { GraphQLSchema, isObjectType } from 'graphql';
import { getAutocompleteSuggestions } from 'graphql-language-service';
import { Position } from 'graphql-language-service/esm/utils/Range';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { CompletionItem as LspCompletionItem } from 'graphql-language-service';

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
export function registerGraphQLLanguage(monaco: MonacoApi) {
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

    return {
        triggerCharacters: ['{', '(', ':', ' ', '\n', '.', '$', '@'],
        provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range: Monaco.IRange = {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
            };

            const cursor = new Position(
                position.lineNumber - 1,
                position.column - 1
            );
            let rawSuggestions: LspCompletionItem[] = [];
            try {
                rawSuggestions = getAutocompleteSuggestions(
                    schema,
                    model.getValue(),
                    cursor
                );
            } catch {
                return { suggestions: [] };
            }

            const suggestions = rawSuggestions
                .filter((item) => !item.label.startsWith('__'))
                .map((item) => toMonacoCompletionItem(item, range));

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

const MONACO_COMPLETION_KIND = {
    Method: 0,
    Function: 1,
    Constructor: 2,
    Field: 3,
    Variable: 4,
    Class: 5,
    Struct: 6,
    Interface: 7,
    Module: 8,
    Property: 9,
    Event: 10,
    Operator: 11,
    Unit: 12,
    Value: 13,
    Constant: 14,
    Enum: 15,
    EnumMember: 16,
    Keyword: 17,
    Text: 18,
    Color: 19,
    File: 20,
    Reference: 21,
    Folder: 23,
    TypeParameter: 24,
    Snippet: 28,
} as const;

const MONACO_INSERT_TEXT_RULE = {
    None: 0,
    InsertAsSnippet: 4,
} as const;

const lspToMonacoKind: Record<number, number> = {
    1: MONACO_COMPLETION_KIND.Text,
    2: MONACO_COMPLETION_KIND.Method,
    3: MONACO_COMPLETION_KIND.Function,
    4: MONACO_COMPLETION_KIND.Constructor,
    5: MONACO_COMPLETION_KIND.Field,
    6: MONACO_COMPLETION_KIND.Variable,
    7: MONACO_COMPLETION_KIND.Class,
    8: MONACO_COMPLETION_KIND.Interface,
    9: MONACO_COMPLETION_KIND.Module,
    10: MONACO_COMPLETION_KIND.Property,
    11: MONACO_COMPLETION_KIND.Unit,
    12: MONACO_COMPLETION_KIND.Value,
    13: MONACO_COMPLETION_KIND.Enum,
    14: MONACO_COMPLETION_KIND.Keyword,
    15: MONACO_COMPLETION_KIND.Snippet,
    16: MONACO_COMPLETION_KIND.Color,
    17: MONACO_COMPLETION_KIND.File,
    18: MONACO_COMPLETION_KIND.Reference,
    19: MONACO_COMPLETION_KIND.Folder,
    20: MONACO_COMPLETION_KIND.EnumMember,
    21: MONACO_COMPLETION_KIND.Constant,
    22: MONACO_COMPLETION_KIND.Struct,
    23: MONACO_COMPLETION_KIND.Event,
    24: MONACO_COMPLETION_KIND.Operator,
    25: MONACO_COMPLETION_KIND.TypeParameter,
};

function toMonacoCompletionItem(
    item: LspCompletionItem,
    range: Monaco.IRange
): Monaco.languages.CompletionItem {
    const documentation =
        typeof item.documentation === 'string'
            ? item.documentation
            : undefined;

    const kind =
        typeof item.kind === 'number'
            ? lspToMonacoKind[item.kind] ?? MONACO_COMPLETION_KIND.Text
            : MONACO_COMPLETION_KIND.Text;

    const insertText = item.insertText ?? item.label;
    const insertTextRules =
        item.insertTextFormat === 2
            ? MONACO_INSERT_TEXT_RULE.InsertAsSnippet
            : MONACO_INSERT_TEXT_RULE.None;

    return {
        label: item.label,
        kind: kind as Monaco.languages.CompletionItemKind,
        detail: item.detail,
        documentation,
        insertText,
        insertTextRules: insertTextRules as Monaco.languages.CompletionItemInsertTextRule,
        sortText: item.sortText,
        range,
    };
}
type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api');
