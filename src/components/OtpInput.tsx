import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last box is filled — used to auto-submit. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Renders the error state (red ring + shake), e.g. after a rejected code. */
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * One box per digit. The value stays a plain string (`"1234"`); the boxes are
 * just a view of it, so the parent never deals with per-cell state.
 *
 * Handles the things people actually do with codes: pasting the whole thing,
 * SMS autofill dumping every digit into one box, backspacing back through the
 * boxes, and arrow-key navigation.
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = false,
}: Props) {
  const { t } = useTranslation();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // Focus is moved synchronously, before React re-renders with the new value —
  // so the focus handler has to read the value from a ref, not from props.
  const latest = useRef(value);
  latest.current = value;

  const cells = Array.from({ length }, (_, i) => value[i] ?? '');

  const focusAt = (i: number) => {
    const el = boxes.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    latest.current = clean;
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const insertAt = (start: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    const next = [...cells];
    let cursor = start;
    for (const d of digits) {
      if (cursor >= length) break;
      next[cursor] = d;
      cursor += 1;
    }
    commit(next.join(''));
    focusAt(cursor);
  };

  const handleChange = (i: number, raw: string) => {
    // Typing into a filled box appends, so drop the digit that was already
    // there and treat the rest as new input.
    const incoming = raw.length > 1 && raw[0] === cells[i] ? raw.slice(1) : raw;
    insertAt(i, incoming);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cells[i]) {
        commit(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i));
        focusAt(i - 1);
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      commit(value.slice(0, i) + value.slice(i + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    insertAt(i, e.clipboardData.getData('text'));
  };

  // Keep the caret on the first empty box so the string never gets holes.
  const handleFocus = (i: number) => {
    if (i > latest.current.length) focusAt(latest.current.length);
  };

  return (
    <div className={`otp-input${invalid ? ' invalid' : ''}`}>
      {cells.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (boxes.current[i] = el)}
          className={`otp-box${digit ? ' filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={digit}
          aria-label={t('login.otpDigit', { index: i + 1, total: length })}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={() => handleFocus(i)}
        />
      ))}
    </div>
  );
}
