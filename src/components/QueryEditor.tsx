import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useStore } from '@/store/useStore';
import type { BottomTab } from '@/store/useStore';
import {
    registerGraphQLLanguage,
    createCompletionProvider,
    createHoverProvider,
} from '@/lib/graphqlLanguage';
import {
    executeQuery,
    extractOperationName,
    prettifyQuery,
} from '@/lib/introspection';
import {
    Play,
    Plus,
    X,
    Sparkles,
    Copy,
    Keyboard,
    Loader2,
} from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import type { GraphQLSchema } from 'graphql';
import type * as Monaco from 'monaco-editor';

export default function QueryEditor() {
    const store = useStore();
    const { toast } = useToast();
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const completionDisposableRef = useRef<Monaco.IDisposable | null>(null);
    const hoverDisposableRef = useRef<Monaco.IDisposable | null>(null);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const activeTab = store.getActiveTab();

    const registerProviders = useCallback((monaco: typeof import('monaco-editor'), schema: GraphQLSchema) => {
        // Dispose previous providers
        if (completionDisposableRef.current) {
            completionDisposableRef.current.dispose();
        }
        if (hoverDisposableRef.current) {
            hoverDisposableRef.current.dispose();
        }

        const completionProvider = createCompletionProvider(schema);
        if (completionProvider) {
            completionDisposableRef.current =
                monaco.languages.registerCompletionItemProvider(
                    'graphql',
                    completionProvider
                );
        }

        const hoverProvider = createHoverProvider(schema);
        if (hoverProvider) {
            hoverDisposableRef.current =
                monaco.languages.registerHoverProvider('graphql', hoverProvider);
        }
    }, []);

    const handlePrettify = useCallback(() => {
        const tab = store.getActiveTab();
        try {
            const pretty = prettifyQuery(tab.query);
            store.updateTab(tab.id, { query: pretty });
            toast({
                title: "Query Formatted",
                description: "The GraphQL query has been prettified.",
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast({
                title: "Prettify Error",
                description: message,
                variant: "destructive",
            });
        }
    }, [store, toast]);

    const handleExecute = useCallback(async () => {
        const tab = store.getActiveTab();
        if (!store.endpoint || store.isExecuting) return;

        store.setExecuting(true);
        store.clearResponse();

        try {
            const result = await executeQuery(
                store.endpoint,
                tab.query,
                tab.variables,
                tab.headers
            );

            store.setResponse(result);

            // Add to history
            store.addHistoryItem({
                id: Math.random().toString(36).substring(7),
                timestamp: Date.now(),
                operationName: extractOperationName(tab.query),
                endpoint: store.endpoint,
                query: tab.query,
                variables: tab.variables,
                headers: tab.headers,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            store.setResponse({
                data: { error: message },
                status: 0,
                time: 0,
                size: 0,
            });
            toast({
                title: "Execution Error",
                description: message,
                variant: "destructive",
            });
        } finally {
            store.setExecuting(false);
        }
    }, [store, toast]);

    // Handle Monaco mount
    const handleEditorDidMount: OnMount = useCallback(
        (editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            registerGraphQLLanguage(monaco);

            // Set theme
            monaco.editor.setTheme(
                store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'
            );

            // Keyboard shortcuts
            editor.addAction({
                id: 'execute-query',
                label: 'Execute Query',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => handleExecute(),
            });

            editor.addAction({
                id: 'prettify-query',
                label: 'Prettify Query',
                keybindings: [
                    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
                ],
                run: () => handlePrettify(),
            });

            // Register completion provider if schema exists
            if (store.schema) {
                registerProviders(monaco, store.schema);
            }
        },
        [store.schema, store.theme, handleExecute, handlePrettify, registerProviders]
    );

    // Update providers when schema changes
    useEffect(() => {
        if (monacoRef.current && store.schema) {
            registerProviders(monacoRef.current, store.schema);
        }
    }, [store.schema, registerProviders]);

    // Update theme
    useEffect(() => {
        if (monacoRef.current) {
            monacoRef.current.editor.setTheme(
                store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'
            );
        }
    }, [store.theme]);

    const handleCopy = useCallback(() => {
        const tab = store.getActiveTab();
        navigator.clipboard.writeText(tab.query);
        toast({
            title: "Copied",
            description: "Query copied to clipboard.",
        });
    }, [store, toast]);

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative border-r">
            {/* Tab bar */}
            <div className="flex items-center bg-card border-b px-2 overflow-x-auto scrollbar-hide">
                {store.tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`flex items-center gap-2 px-3 h-9 border-r cursor-pointer transition-colors whitespace-nowrap text-xs font-medium group ${tab.id === store.activeTabId
                                ? 'bg-background text-foreground border-b-2 border-b-primary -mb-px'
                                : 'text-muted-foreground hover:bg-muted/50'
                            }`}
                        onClick={() => store.setActiveTab(tab.id)}
                    >
                        <span>{tab.name}</span>
                        {store.tabs.length > 1 && (
                            <button
                                className="p-0.5 rounded-sm hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    store.closeTab(tab.id);
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                ))}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 ml-1 shrink-0"
                    onClick={() => store.addTab()}
                    title="New tab"
                >
                    <Plus size={14} />
                </Button>
            </div>

            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-2 h-10 border-b bg-muted/20">
                <div className="flex items-center gap-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handlePrettify}>
                                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                                    Prettify
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ctrl+Shift+P</TooltipContent>
                        </Tooltip>

                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCopy}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${showShortcuts ? 'bg-muted' : ''}`}
                            onClick={() => setShowShortcuts(!showShortcuts)}
                        >
                            <Keyboard className="h-3.5 w-3.5" />
                        </Button>
                    </TooltipProvider>
                </div>

                <div className="flex items-center gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    size="sm"
                                    className="h-7 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-sm flex items-center"
                                    onClick={handleExecute}
                                    disabled={!store.endpoint || store.isExecuting}
                                >
                                    {store.isExecuting ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                    ) : (
                                        <Play className="h-3.5 w-3.5 mr-2 fill-current" />
                                    )}
                                    Run
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ctrl+Enter</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {showShortcuts && (
                <div className="flex items-center gap-4 px-4 py-1.5 bg-muted/50 border-b text-[10px] text-muted-foreground font-medium animate-in slide-in-from-top duration-200">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 rounded bg-background border font-sans text-[9px]">Ctrl</kbd> +
                        <kbd className="px-1 py-0.5 rounded bg-background border font-sans text-[9px]">Enter</kbd> Execute
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 rounded bg-background border font-sans text-[9px]">Ctrl</kbd> +
                        <kbd className="px-1 py-0.5 rounded bg-background border font-sans text-[9px]">Shift</kbd> +
                        <kbd className="px-1 py-0.5 rounded bg-background border font-sans text-[9px]">P</kbd> Prettify
                    </span>
                </div>
            )}

            {/* Main editor */}
            <div className="flex-1 min-h-0">
                <Editor
                    language="graphql"
                    theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                    value={activeTab?.query || ''}
                    onChange={(value) => {
                        store.updateTab(activeTab.id, { query: value || '' });
                    }}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        lineNumbers: 'on',
                        renderLineHighlight: 'line',
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        padding: { top: 12 },
                        tabSize: 2,
                        wordWrap: 'on',
                        automaticLayout: true,
                        suggestOnTriggerCharacters: true,
                        quickSuggestions: true,
                        formatOnPaste: true,
                        bracketPairColorization: { enabled: true },
                        guides: {
                            bracketPairs: true,
                            indentation: true,
                        },
                    }}
                />
            </div>

            {/* Bottom pane: Variables / Headers */}
            <div className="border-t shrink-0 h-[180px] bg-background">
                <Tabs
                    defaultValue="variables"
                    className="flex flex-col h-full"
                    value={store.activeBottomTab}
                    onValueChange={(v) => store.setBottomTab(v as BottomTab)}
                >
                    <TabsList className="h-8 justify-start bg-transparent border-b rounded-none px-2 gap-4">
                        <TabsTrigger value="variables" className="h-8 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground">
                            Variables
                        </TabsTrigger>
                        <TabsTrigger value="headers" className="h-8 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground">
                            Headers
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex-1 min-h-0 bg-card/10">
                        <Editor
                            language="json"
                            theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                            value={
                                store.activeBottomTab === 'variables'
                                    ? activeTab?.variables || '{}'
                                    : activeTab?.headers || '{}'
                            }
                            onChange={(value) => {
                                const updates = store.activeBottomTab === 'variables'
                                    ? { variables: value || '' }
                                    : { headers: value || '' };
                                store.updateTab(activeTab.id, updates);
                            }}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                lineNumbers: 'off',
                                renderLineHighlight: 'none',
                                scrollBeyondLastLine: false,
                                padding: { top: 8 },
                                tabSize: 2,
                                wordWrap: 'on',
                                automaticLayout: true,
                                folding: false,
                                glyphMargin: false,
                            }}
                        />
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
