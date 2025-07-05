class RequestLogManager implements LogManager {
    private logs: RequestLogEntry[] = [];
    private maxLogs: number = 1000; // Keep last 1000 requests

    addLog(entry: RequestLogEntry): void {
        this.logs.unshift(entry); // Add to beginning for latest-first ordering
        
        // Keep only the most recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        console.log(`📝 Log added: ${entry.method} ${entry.path} (${entry.statusCode}) - Total logs: ${this.logs.length}`);
    }

    getLogs(): RequestLogEntry[] {
        return [...this.logs]; // Return copy to prevent external modification
    }

    clearLogs(): void {
        this.logs = [];
    }

    getLogById(id: string): RequestLogEntry | undefined {
        return this.logs.find(log => log.id === id);
    }

    updateLogResponse(id: string, updates: Partial<RequestLogEntry>): void {
        const logIndex = this.logs.findIndex(log => log.id === id);
        if (logIndex !== -1) {
            this.logs[logIndex] = { ...this.logs[logIndex], ...updates };
        }
    }

    getLogCount(): number {
        return this.logs.length;
    }

    getLogsByStatus(status?: number): RequestLogEntry[] {
        if (status === undefined) {
            return this.getLogs();
        }
        return this.logs.filter(log => log.statusCode === status);
    }

    getLogsByMethod(method: string): RequestLogEntry[] {
        return this.logs.filter(log => log.method.toLowerCase() === method.toLowerCase());
    }
}

export default RequestLogManager; 