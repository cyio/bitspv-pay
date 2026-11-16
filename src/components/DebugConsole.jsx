import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLog } from '../contexts/LogContext';
import { collectDiagnostics, formatDiagnosticsReport, logSecurityAudit } from '../utils/runtimeDiagnostics';
import { ChevronUp, ChevronDown, Trash2, ShieldCheck, ClipboardCopy } from 'lucide-react';

const DebugConsole = () => {
  const { t } = useTranslation();
  const { logs, clearLogs, isConsoleVisible, toggleConsole, addLog } = useLog();
  const scrollRef = useRef(null);
  const [isChecking, setIsChecking] = React.useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSecurityCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      await logSecurityAudit(addLog);
    } catch (err) {
      addLog(`${t('bsvPayment.debugConsole.securityCheckFailed')}: ${err?.message || err}`, 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCopyReport = async () => {
    try {
      const report = formatDiagnosticsReport(await collectDiagnostics());
      await navigator.clipboard.writeText(report);
      addLog(t('bsvPayment.debugConsole.reportCopied'), 'success');
    } catch (err) {
      addLog(`${t('bsvPayment.debugConsole.reportCopyFailed')}: ${err?.message || err}`, 'error');
    }
  };

  if (!isConsoleVisible) {
    return (
      <button
        onClick={toggleConsole}
        aria-label={t('bsvPayment.debugConsole.open')}
        aria-expanded={false}
        // 右下角浮标会压住主操作（发送 / 确认），挪到左下角避开 CTA。
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-40 flex items-center gap-1.5 rounded-full bg-gray-800/90 px-3 py-2 text-white opacity-80 shadow-lg transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronUp size={16} />
        <span className="hidden text-xs font-mono sm:inline">Console</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-64 max-h-[60dvh] flex-col border-t border-gray-700 bg-gray-900 pb-[env(safe-area-inset-bottom)] text-gray-100 shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('bsvPayment.debugConsole.title')}</span>
          <span className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300">{t('bsvPayment.debugConsole.entries', { count: logs.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSecurityCheck}
            disabled={isChecking}
            aria-label={t('bsvPayment.debugConsole.securityCheck')}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title={t('bsvPayment.debugConsole.securityCheck')}
          >
            <ShieldCheck size={14} className={isChecking ? 'animate-pulse' : ''} />
          </button>
          <button 
            onClick={handleCopyReport}
            aria-label={t('bsvPayment.debugConsole.copyReport')}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title={t('bsvPayment.debugConsole.copyReport')}
          >
            <ClipboardCopy size={14} />
          </button>
          <button 
            onClick={clearLogs}
            aria-label={t('bsvPayment.debugConsole.clear')}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title={t('bsvPayment.debugConsole.clear')}
          >
            <Trash2 size={14} />
          </button>
          <button 
            onClick={toggleConsole}
            aria-label={t('bsvPayment.debugConsole.close')}
            aria-expanded={true}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
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
          <div className="py-8 text-center text-gray-600">{t('bsvPayment.debugConsole.empty')}</div>
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
