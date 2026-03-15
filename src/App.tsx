import { useState, useCallback, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import {
    Panel,
    Group as PanelGroup,
    Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import { useStore } from '@/store/useStore';
import { introspectSchema } from '@/lib/introspection';
import DocsPanel from '@/components/DocsPanel';
import QueryEditor from '@/components/QueryEditor';
import ResponsePanel from '@/components/ResponsePanel';
import HistoryPanel from '@/components/HistoryPanel';
import SchemaViewer from '@/components/SchemaViewer';
import GraphExplorer from '@/components/GraphExplorer';
import TypesPanel from '@/components/TypesPanel';
import {
    Sun,
    Moon,
    BookOpen,
    Clock,
    Wifi,
    WifiOff,
    Loader2,
    AlertCircle,
    Braces,
    Database,
} from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Separator } from "@/components/ui/separator"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import type { LeftPanelView } from '@/types/view';

export default function App() {
    const store = useStore();
    const [urlInput, setUrlInput] = useState(store.endpoint);
    const [activeView, setActiveView] = useState<LeftPanelView>('docs');
    const { toast } = useToast();

    // Sync endpoint from store once on load (though Zustand usually handles this)
    useEffect(() => {
        setUrlInput(store.endpoint);
    }, [store.endpoint]);

    const handleConnect = useCallback(async () => {
        if (!urlInput.trim()) return;
        store.setEndpoint(urlInput.trim());
        store.setConnectionStatus('connecting');

        try {
            const result = await introspectSchema(urlInput.trim());
            store.setSchema(result);
            toast({
                title: "Connected",
                description: `Schema loaded with ${Object.keys(result.schema.getTypeMap()).length} types.`,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            store.setConnectionError(message);
            toast({
                title: "Connection Failed",
                description: message,
                variant: "destructive",
            });
        }
    }, [urlInput, store, toast]);

    const handleDisconnect = useCallback(() => {
        store.clearSchema();
        toast({
            title: "Disconnected",
            description: "Successfully disconnected from endpoint.",
        });
    }, [store, toast]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (store.connectionStatus === 'connected') {
                    handleDisconnect();
                } else {
                    handleConnect();
                }
            }
        },
        [handleConnect, handleDisconnect, store.connectionStatus]
    );

    const toggleTheme = useCallback(() => {
        const newTheme = store.theme === 'dark' ? 'light' : 'dark';
        store.setTheme(newTheme);
    }, [store]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', store.theme === 'dark');
    }, [store.theme]);

    const getStatusIcon = () => {
        switch (store.connectionStatus) {
            case 'connected':
                return <Wifi className="h-4 w-4 text-green-500" />;
            case 'connecting':
                return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case 'error':
                return <AlertCircle className="h-4 w-4 text-red-500" />;
            default:
                return <WifiOff className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const renderLeftPanel = () => {
        switch (activeView) {
            case 'schema':
                return <SchemaViewer activeView={activeView} setActiveView={setActiveView} />;
            case 'history':
                return <HistoryPanel />;
            case 'explore':
                return <GraphExplorer activeView={activeView} setActiveView={setActiveView} />;
            case 'types':
                return <TypesPanel activeView={activeView} setActiveView={setActiveView} />;
            case 'docs':
            default:
                return <DocsPanel activeView={activeView} setActiveView={setActiveView} />;
        }
    };

    return (
        <TooltipProvider>
            <div className={`flex flex-col h-full bg-background text-foreground ${store.theme}`}>
                {/* Toolbar */}
                <header className="flex h-12 items-center px-4 border-b shrink-0 bg-card gap-4">
                    <div className="flex items-center gap-2 font-semibold">
                        <Braces className="h-5 w-5 text-primary" />
                        <span className="hidden sm:inline-block">GraphQL Playground</span>
                    </div>

                    {/* URL Bar */}
                    <div className="flex-1 flex items-center max-w-2xl mx-auto gap-0 bg-muted/50 rounded-md border overflow-hidden">
                        <div className="px-3 py-1 text-xs font-bold text-muted-foreground border-r bg-muted">POST</div>
                        <Input
                            className="border-none bg-transparent focus-visible:ring-0 h-8 rounded-none px-3"
                            placeholder="https://your-graphql-endpoint.com/graphql"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <Button
                            variant={store.connectionStatus === 'connected' ? "secondary" : "default"}
                            size="sm"
                            className="h-8 rounded-none border-l h-full"
                            onClick={store.connectionStatus === 'connected' ? handleDisconnect : handleConnect}
                            disabled={store.connectionStatus === 'connecting' || !urlInput.trim()}
                        >
                            {store.connectionStatus === 'connecting' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                getStatusIcon()
                            )}
                            <span className="ml-2">{store.connectionStatus === 'connected' ? 'Connected' : 'Connect'}</span>
                        </Button>
                    </div>

                    {/* Toolbar actions */}
                    <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={activeView === 'docs' && store.docsOpen ? "secondary" : "ghost"}
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => {
                                        if (activeView === 'docs') store.toggleDocs();
                                        else {
                                            setActiveView('docs');
                                            if (!store.docsOpen) store.toggleDocs();
                                        }
                                    }}
                                >
                                    <BookOpen className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Docs</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={activeView === 'schema' && store.docsOpen ? "secondary" : "ghost"}
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => {
                                        if (activeView === 'schema') store.toggleDocs();
                                        else {
                                            setActiveView('schema');
                                            if (!store.docsOpen) store.toggleDocs();
                                        }
                                    }}
                                >
                                    <Database className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>SDL</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={activeView === 'history' && store.docsOpen ? "secondary" : "ghost"}
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => {
                                        if (activeView === 'history') store.toggleDocs();
                                        else {
                                            setActiveView('history');
                                            if (!store.docsOpen) store.toggleDocs();
                                        }
                                    }}
                                >
                                    <Clock className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>History</TooltipContent>
                        </Tooltip>

                        <Separator orientation="vertical" className="h-6 mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}>
                                    {store.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Toggle Theme</TooltipContent>
                        </Tooltip>
                    </div>
                </header>

                {/* Main content */}
                <main className="flex-1 overflow-hidden">
                    <PanelGroup
                        orientation="horizontal"
                        className="h-full w-full"
                    >
                        {/* Left panel */}
                        {store.docsOpen && (
                            <>
                                <Panel
                                    id="left"
                                    defaultSize={"25%"}
                                    minSize={"5%"}
                                    maxSize={"33%"}
                                    collapsible
                                    collapsedSize={0}
                                    className="min-w-0"
                                >
                                    {renderLeftPanel()}
                                </Panel>
                                <PanelResizeHandle className="w-2 bg-border/80 hover:bg-primary/60 transition-colors cursor-col-resize" />
                            </>
                        )}

                        {/* Center: Editor */}
                        <Panel id="editor" minSize={"5%"} className="min-w-0">
                            <QueryEditor />
                        </Panel>

                        <PanelResizeHandle className="w-2 bg-border/80 hover:bg-primary/60 transition-colors cursor-col-resize" />

                        {/* Right: Response */}
                        <Panel id="response" defaultSize={"25%"} minSize={"5%"} maxSize={"33%"} className="min-w-0">
                            <ResponsePanel />
                        </Panel>
                    </PanelGroup>
                </main>

                <Toaster />
            </div>
        </TooltipProvider>
    );
}
