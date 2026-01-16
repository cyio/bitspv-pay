import React, { useState, useRef, useEffect } from 'react';

const SimpleSelect = ({ value, onValueChange, children, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (value) => {
    onValueChange(value);
    setIsOpen(false);
  };

  const selectedItem = React.Children.toArray(children).find(
    child => child.props.value === value
  );

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">
          {selectedItem ? selectedItem.props.children : 'Select...'}
        </span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md max-h-60">
          <div className="p-1">
            {React.Children.map(children, (child) => 
              React.cloneElement(child, {
                onSelect: handleSelect,
                isSelected: child.props.value === value
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SimpleSelectItem = ({ value, children, onSelect, isSelected }) => {
  return (
    <div
      className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
        isSelected ? 'bg-accent text-accent-foreground' : ''
      }`}
      onClick={() => onSelect(value)}
    >
      <span className="flex-1 text-left">{children}</span>
      {isSelected && (
        <svg
          className="absolute right-2 h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
};

export { SimpleSelect, SimpleSelectItem };
