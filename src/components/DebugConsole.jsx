import React, { useRef, useEffect } from 'react';
import { useLog } from '../contexts/LogContext';
import { ChevronUp, ChevronDown, Trash2, X } from 'lucide-react';

const DebugConsole = () => {
  const { logs, clearLogs, isConsoleVisible, toggleConsole } = useLog();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isConsoleVisible) {
    return (
      <button
        onClick={toggleConsole}
        className="fixed bottom-4 right-4 bg-gray-800 text-white p-2 rounded-full shadow-lg hover:bg-gray-700 transition-colors z-50 flex items-center gap-2 px-4"
      >
        <ChevronUp size={16} />
        <span className="text-xs font-mono">Console</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-100 shadow-2xl z-50 border-t border-gray-700 flex flex-col h-64 transition-all duration-300">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">System Logs</span>
          <span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded text-gray-300">{logs.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={clearLogs}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Clear Logs"
          >
            <Trash2 size={14} />
          </button>
          <button 
            onClick={toggleConsole}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 text-center py-8">No logs yet.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1 flex gap-2 border-b border-gray-800/50 pb-1 last:border-0">
              <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
              <span className={`break-all ${
                log.type === 'error' ? 'text-red-400' : 
                log.type === 'warn' ? 'text-yellow-400' : 
                log.type === 'success' ? 'text-green-400' : 
                'text-blue-300'
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugConsole;
