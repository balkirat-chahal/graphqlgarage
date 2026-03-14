import { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '@/store/useStore';
import { Code2, Copy, Download } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from '@/lib/utils';
import type { LeftPanelView } from '@/types/view';

interface SchemaViewerProps {
    activeView?: LeftPanelView;
    setActiveView: React.Dispatch<React.SetStateAction<LeftPanelView>>;
}

export default function SchemaViewer({ activeView = 'schema', setActiveView }: SchemaViewerProps) {
    const store = useStore();
    const { toast } = useToast();

    const handleCopy = useCallback(() => {
        if (store.schemaSDL) {
            navigator.clipboard.writeText(store.schemaSDL);
            toast({
                title: "Copied",
                description: "Schema SDL copied to clipboard.",
            });
        }
    }, [store.schemaSDL, toast]);

    const handleDownload = useCallback(() => {
        if (store.schemaSDL) {
            const blob = new Blob([store.schemaSDL], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'schema.graphql';
            a.click();
            URL.revokeObjectURL(url);
        }
    }, [store.schemaSDL]);

    return (
        <div className="flex flex-col h-full bg-card border-r">
            <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
                <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
                    <button
                        onClick={() => setActiveView('docs')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'docs'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Docs
                    </button>
                    <button
                        onClick={() => setActiveView('explore')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'explore'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Explore
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
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy SDL">
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download SDL">
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {store.schemaSDL ? (
                    <Editor
                        language="graphql"
                        theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                        value={store.schemaSDL}
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
                ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4 opacity-40 grayscale">
                        <Code2 size={48} />
                        <div className="space-y-1">
                            <h3 className="text-lg font-bold">No Schema</h3>
                            <p className="text-sm">
                                Connect to a GraphQL endpoint to view the schema SDL.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
