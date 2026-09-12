"use client";

interface QuickOptionsProps {
  choices: string[];
  onSelect: (choice: string) => void;
}

export function QuickOptions({ choices, onSelect }: QuickOptionsProps) {
  return (
    <fieldset className="quick-options">
      <legend className="sr-only">Quick replies</legend>
      {choices.map((choice) => (
        <button
          key={choice}
          className="quick-options__chip"
          onClick={() => onSelect(choice)}
          type="button"
        >
          {choice}
        </button>
      ))}
    </fieldset>
  );
}
