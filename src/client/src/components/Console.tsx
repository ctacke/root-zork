import React, { useState, useEffect, useRef } from "react";

export interface LogEntry {
  id: string;
  type: "output" | "command" | "system";
  text: string;
}

interface ConsoleProps {
  logs: LogEntry[];
  isExecuting: boolean;
  onSendCommand: (cmd: string) => void;
  disabled?: boolean;
}

const QUICK_COMMANDS = [
  { label: "N", cmd: "n" },
  { label: "S", cmd: "s" },
  { label: "E", cmd: "e" },
  { label: "W", cmd: "w" },
  { label: "UP", cmd: "up" },
  { label: "DOWN", cmd: "down" },
  { label: "LOOK", cmd: "look" },
  { label: "INV", cmd: "inventory" },
  { label: "WAIT", cmd: "wait" }
];

export const Console: React.FC<ConsoleProps> = ({
  logs,
  isExecuting,
  onSendCommand,
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [showQuickKeys, setShowQuickKeys] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExecuting]);

  // Keep input focused
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled, logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isExecuting || disabled) return;

    // Add to command history
    setHistory(prev => [...prev, trimmed]);
    setHistoryIdx(-1);
    setInputValue("");

    onSendCommand(trimmed);
  };

  const handleQuickCommand = (cmd: string) => {
    if (isExecuting || disabled) return;
    setHistory(prev => [...prev, cmd]);
    setHistoryIdx(-1);
    onSendCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInputValue(history[nextIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= history.length) {
        setHistoryIdx(-1);
        setInputValue("");
      } else {
        setHistoryIdx(nextIdx);
        setInputValue(history[nextIdx] || "");
      }
    }
  };

  return (
    <div
      className="terminal-main-content"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Continuous Scrolling Monospace Text Field */}
      <div className="terminal-scroll-area" ref={scrollRef}>
        {logs.map(log => {
          let className = "output-chunk";
          if (log.type === "command") className += " command-echo";
          if (log.type === "system") className += " system-msg";

          return (
            <div key={log.id} className={className}>
              {log.text}
            </div>
          );
        })}

        {isExecuting && (
          <div className="output-chunk system-msg">
            <span>[Processing command...]</span>
          </div>
        )}
      </div>

      {/* Mobile-Friendly Quick Command Toolbar */}
      {showQuickKeys && (
        <div className="console-quick-toolbar" onClick={e => e.stopPropagation()}>
          <div className="quick-keys-list">
            {QUICK_COMMANDS.map(qc => (
              <button
                key={qc.cmd}
                type="button"
                className="quick-key-btn"
                onClick={() => handleQuickCommand(qc.cmd)}
                disabled={disabled || isExecuting}
              >
                {qc.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="quick-key-toggle-btn"
            onClick={() => setShowQuickKeys(false)}
            title="Hide Quick Action Bar"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Prompt Bar */}
      <form className="terminal-input-bar" onSubmit={handleSubmit}>
        {!showQuickKeys && (
          <button
            type="button"
            className="quick-keys-reopen-btn"
            onClick={e => {
              e.stopPropagation();
              setShowQuickKeys(true);
            }}
            title="Show Quick Direction / Action Buttons"
          >
            ⌨
          </button>
        )}
        <span className="input-prompt-symbol">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input-field"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isExecuting}
          placeholder={disabled ? "" : "Enter command ('look', 'take lamp', 'n', 'save')..."}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button
          type="submit"
          className="terminal-submit-btn"
          disabled={disabled || isExecuting || !inputValue.trim()}
        >
          SEND
        </button>
      </form>
    </div>
  );
};
