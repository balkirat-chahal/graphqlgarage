import { useCallback } from 'react';
import { useStore, HistoryItem } from '@/store/useStore';
import { Clock, Trash2, X } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"

export default function HistoryPanel() {
    const store = useStore();
    const { toast } = useToast();

    const restoreHistory = useCallback(
        (item: HistoryItem) => {
            const activeTab = store.getActiveTab();
            store.updateTab(activeTab.id, {
                query: item.query,
                variables: item.variables || '{}',
                headers: item.headers || '{}',
                name: item.operationName || 'Restored',
            });

            if (item.endpoint && item.endpoint !== store.endpoint) {
                store.setEndpoint(item.endpoint);
            }

            toast({
                title: "Query Restored",
                description: `Restored ${item.operationName || 'query'} from history.`,
            });
        },
        [store, toast]
    );

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    return (
        <div className="flex flex-col h-full bg-card border-r">
            <div className="flex items-center justify-between px-4 h-11 border-b shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock size={14} className="text-primary" />
                    <span>History</span>
                </div>
                <div className="flex items-center gap-1">
                    {store.history.length > 0 && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => store.clearHistory()}
                            title="Clear all history"
                        >
                            <Trash2 size={13} />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => store.toggleDocs()}
                        title="Close history"
                    >
                        <X size={14} />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                {store.history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center gap-4 opacity-50 grayscale">
                        <Clock size={40} />
                        <div className="space-y-1">
                            <h3 className="text-sm font-bold uppercase tracking-widest">No History</h3>
                            <p className="text-xs text-balance">
                                Executed queries will appear here.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col p-2 space-y-1">
                        {store.history.map((item, idx) => (
                            <div
                                key={item.id || idx}
                                className="group flex flex-col p-3 rounded-md border border-transparent hover:border-border hover:bg-muted/50 transition-all cursor-pointer relative overflow-hidden"
                                onClick={() => restoreHistory(item)}
                            >
                                <div className="flex items-center justify-between gap-4 mb-1">
                                    <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                                        {item.operationName || 'Anonymous'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                                        {formatTime(item.timestamp)}
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate mb-3">
                                    {item.endpoint}
                                </div>

                                <div className="flex items-center justify-between gap-2 mt-auto">
                                    <div className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded border leading-none">
                                        {item.query.substring(0, 30).replace(/\n/g, ' ')}...
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            store.deleteHistoryItem(idx);
                                        }}
                                    >
                                        <Trash2 size={10} className="text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
