import { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '@/store/useStore';
import { generateSnippets } from '@/lib/snippets';
import type { Snippets } from '@/lib/snippets';
import {
    Clock,
    Copy,
    Download,
    CheckCircle,
    XCircle,
    Zap,
    FileText,
    Code2,
    Play,
    Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { cn } from '@/lib/utils';

const SNIPPET_LANGUAGES: Array<{ id: keyof Snippets; label: string }> = [
    { id: 'javascript', label: 'JS Fetch' },
    { id: 'curl', label: 'cURL' },
    { id: 'python', label: 'Python' },
    { id: 'php', label: 'PHP' },
    { id: 'csharp', label: 'C#' },
];

export default function ResponsePanel() {
    const store = useStore();
    const { toast } = useToast();
    type ActiveView = 'response' | 'code';
    const [activeView, setActiveView] = useState<ActiveView>('response');
    const [codeLanguage, setCodeLanguage] = useState<keyof Snippets>('javascript');

    const formattedResponse = useMemo(() => {
        if (!store.response) return '';
        try {
            return JSON.stringify(store.response, null, 2);
        } catch {
            return String(store.response);
        }
    }, [store.response]);

    const hasErrors = useMemo(() => {
        return Array.isArray(store.response?.errors) && store.response.errors.length > 0;
    }, [store.response]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(formattedResponse);
        toast({
            title: "Copied",
            description: "Response copied to clipboard.",
        });
    }, [formattedResponse, toast]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([formattedResponse], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [formattedResponse]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const snippets = useMemo<Snippets | null>(() => {
        if (activeView !== 'code') return null;
        const activeTab = store.getActiveTab();
        if (!activeTab) return null;
        return generateSnippets(
            store.endpoint || '',
            activeTab.query,
            activeTab.variables,
            activeTab.headers
        );
    }, [activeView, store]);

    const activeSnippet = snippets?.[codeLanguage] || '';

    const getTimeColorValue = (ms: number) => {
        if (ms < 200) return 'text-green-500';
        if (ms < 1000) return 'text-amber-500';
        return 'text-red-500';
    };

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden border-l">
            <div className="flex items-center justify-between px-3 h-10 border-b bg-card">
                <Tabs value={activeView} onValueChange={(v) => setActiveView(v as ActiveView)} className="w-auto">
                    <TabsList className="h-7 bg-muted/50 p-0.5">
                        <TabsTrigger value="response" className="h-6 text-[11px] px-3 gap-1.5 data-[state=active]:bg-background">
                            <FileText className="h-3 w-3" /> Response
                        </TabsTrigger>
                        <TabsTrigger value="code" className="h-6 text-[11px] px-3 gap-1.5 data-[state=active]:bg-background">
                            <Code2 className="h-3 w-3" /> Code
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-1">
                    {activeView === 'response' && store.response && (
                        <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy response">
                                <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download response">
                                <Download className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                    {activeView === 'code' && activeSnippet && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                                navigator.clipboard.writeText(activeSnippet);
                                toast({ title: "Copied", description: "Snippet copied" });
                            }}
                            title="Copy snippet"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Meta bar */}
            {activeView === 'response' && store.response && (
                <div className="flex items-center gap-4 px-4 h-9 border-b bg-muted/20 overflow-x-auto scrollbar-hide text-xs font-medium">
                    <div className="flex items-center gap-1.5 shrink-0">
                        {(store.responseStatus ?? 0) >= 200 && (store.responseStatus ?? 0) < 300 ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className="text-muted-foreground">Status:</span>
                        <span className={(store.responseStatus ?? 0) >= 200 && (store.responseStatus ?? 0) < 300 ? 'text-green-500' : 'text-red-500'}>
                            {store.responseStatus ?? 'ERR'}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Time:</span>
                        <span className={getTimeColorValue(store.responseTime ?? 0)}>
                            {store.responseTime ?? 0}ms
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Size:</span>
                        <span>{formatSize(store.responseSize || 0)}</span>
                    </div>

                    {hasErrors && (
                        <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px] font-bold">
                            {store.response?.errors?.length ?? 0} ERRORS
                        </Badge>
                    )}
                </div>
            )}

            {/* Snippet language bar */}
            {activeView === 'code' && (
                <div className="flex items-center gap-1 px-2 h-9 border-b bg-muted/20 overflow-x-auto scrollbar-hide">
                    {SNIPPET_LANGUAGES.map((lang) => (
                        <button
                            key={lang.id}
                            onClick={() => setCodeLanguage(lang.id)}
                            className={cn(
                                "px-3 h-7 text-[10px] font-bold uppercase tracking-tight rounded-md transition-colors",
                                codeLanguage === lang.id
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {lang.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Content area */}
            <div className="flex-1 relative">
                {activeView === 'response' ? (
                    store.isExecuting ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4 bg-background/50 backdrop-blur-[1px] z-10">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <div className="text-sm font-medium">Executing query...</div>
                        </div>
                    ) : store.response ? (
                        <Editor
                            language="json"
                            theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                            value={formattedResponse}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                lineNumbers: 'on',
                                renderLineHighlight: 'none',
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                padding: { top: 12 },
                                wordWrap: 'on',
                                automaticLayout: true,
                                folding: true,
                                foldingStrategy: 'indentation',
                            }}
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-4 grayscale opacity-40">
                            <Play className="h-16 w-16" />
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold">No Response Yet</h3>
                                <p className="text-sm text-balance max-w-xs">
                                    Write a query and click Run or press <kbd className="font-sans px-1 rounded border">Ctrl+Enter</kbd> to execute it.
                                </p>
                            </div>
                        </div>
                    )
                ) : (
                    <Editor
                        language={codeLanguage === 'csharp' ? 'csharp' : codeLanguage === 'php' ? 'php' : codeLanguage === 'curl' ? 'shell' : codeLanguage === 'python' ? 'python' : 'javascript'}
                        theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                        value={activeSnippet}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            lineNumbers: 'on',
                            renderLineHighlight: 'none',
                            scrollBeyondLastLine: false,
                            smoothScrolling: true,
                            padding: { top: 12 },
                            wordWrap: 'on',
                            automaticLayout: true,
                            folding: true,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
