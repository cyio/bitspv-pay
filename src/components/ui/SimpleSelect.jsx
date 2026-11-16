import React, { useState, useRef, useEffect } from 'react';

/**
 * 轻量下拉。以前只有鼠标能操作：Tab 进得去、方向键和回车都没反应，
 * 屏幕阅读器也看不出它是列表。这里补上 listbox 语义和键盘操作。
 */
const SimpleSelect = ({ value, onValueChange, children, className, ariaLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectRef = useRef(null);

  const items = React.Children.toArray(children).filter(Boolean);
  const selectedIndex = items.findIndex(child => child.props.value === value);

  useEffect(() => {
    const handleClickOutside = event => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, selectedIndex]);

  const handleSelect = nextValue => {
    onValueChange(nextValue);
    setIsOpen(false);
  };

  const moveActive = delta => {
    if (items.length === 0) return;
    setActiveIndex(prev => {
      const base = prev < 0 ? 0 : prev;
      return (base + delta + items.length) % items.length;
    });
  };

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) handleSelect(item.props.value);
    } else if (event.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  return (
    <div className={`relative ${className || ''}`} ref={selectRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-[var(--radius)] border border-input bg-transparent px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">
          {selectedItem ? selectedItem.props.children : 'Select...'}
        </span>
        <svg
          className={`ml-2 h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius)] border bg-popover text-popover-foreground shadow-md"
        >
          <div className="p-1">
            {items.map((child, index) =>
              React.cloneElement(child, {
                key: child.key ?? child.props.value,
                onSelect: handleSelect,
                isSelected: child.props.value === value,
                isActive: index === activeIndex,
                onHover: () => setActiveIndex(index),
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SimpleSelectItem = ({ value, children, onSelect, isSelected, isActive, onHover }) => {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      className={`relative flex w-full cursor-pointer select-none items-center rounded-[var(--radius)] py-1.5 pl-2 pr-8 text-sm outline-none ${
        isActive ? 'bg-accent text-accent-foreground' : ''
      } ${isSelected ? 'font-medium' : ''}`}
      onClick={() => onSelect(value)}
      onMouseEnter={onHover}
    >
      <span className="flex-1 text-left">{children}</span>
      {isSelected && (
        <svg
          className="absolute right-2 h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
};

export { SimpleSelect, SimpleSelectItem };
