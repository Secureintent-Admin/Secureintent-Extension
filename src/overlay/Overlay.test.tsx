import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Detection } from '@/lib/detection';
import { Overlay, type OverlayAction } from './Overlay';

const secret = 'sk-' + 'a'.repeat(30);
const text = `here is ${secret} ok`;
const start = text.indexOf(secret);
const detections: Detection[] = [
  { type: 'known-key', label: 'OpenAI API key', match: secret, start, end: start + secret.length },
];

function renderOverlay(onAction: (a: OverlayAction) => void = () => {}) {
  return render(<Overlay site="ChatGPT" text={text} detections={detections} onAction={onAction} />);
}

afterEach(() => document.body.replaceChildren());

describe('Overlay', () => {
  test('shows each detection label and an accessible name with the site', () => {
    renderOverlay();
    expect(screen.getByText('OpenAI API key')).toBeTruthy();
    expect(screen.getByRole('alertdialog', { name: /ChatGPT/ })).toBeTruthy();
  });

  test('never renders the raw secret', () => {
    const { container } = renderOverlay();
    expect(container.textContent).not.toContain(secret);
  });

  test('"Paste anyway" emits the paste action', () => {
    const onAction = vi.fn();
    renderOverlay(onAction);
    fireEvent.click(screen.getByText('Paste anyway'));
    expect(onAction).toHaveBeenCalledWith('paste');
  });

  test('"Paste anonymously" emits the redact action', () => {
    const onAction = vi.fn();
    renderOverlay(onAction);
    fireEvent.click(screen.getByText('Paste anonymously'));
    expect(onAction).toHaveBeenCalledWith('redact');
  });

  test('"Cancel" emits the cancel action', () => {
    const onAction = vi.fn();
    renderOverlay(onAction);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onAction).toHaveBeenCalledWith('cancel');
  });

  test('Escape key emits the cancel action', () => {
    const onAction = vi.fn();
    renderOverlay(onAction);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onAction).toHaveBeenCalledWith('cancel');
  });

  test('shows the line number in the header, always visible', () => {
    const multiline = `first\nsecond\nkey ${secret} end`;
    const at = multiline.indexOf(secret);
    const dets: Detection[] = [
      {
        type: 'known-key',
        label: 'OpenAI API key',
        match: secret,
        start: at,
        end: at + secret.length,
      },
    ];
    render(<Overlay site="ChatGPT" text={multiline} detections={dets} onAction={() => {}} />);

    // Line number lives in the header meta now, not behind the expander.
    expect(screen.getByText(/line 3/i)).toBeTruthy();
  });

  test('summary (Ghost) mode shows category counts instead of a finding list', () => {
    render(
      <Overlay
        site="ChatGPT"
        text={text}
        detections={detections}
        summary={{
          total: 3,
          items: [
            { label: 'Internal IP', count: 2 },
            { label: 'Email address', count: 1 },
          ],
        }}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText(/Internal IP/)).toBeTruthy();
    expect(screen.getByText(/2/)).toBeTruthy();
    expect(screen.getByText(/Email address/)).toBeTruthy();
  });

  test('summary mode "Sanitize & paste" emits the sanitize action', () => {
    const onAction = vi.fn();
    render(
      <Overlay
        site="ChatGPT"
        text={text}
        detections={detections}
        summary={{ total: 1, items: [{ label: 'Internal IP', count: 1 }] }}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByText('Sanitize & paste'));
    expect(onAction).toHaveBeenCalledWith('sanitize');
  });

  test('summary mode never renders the raw secret', () => {
    const { container } = render(
      <Overlay
        site="ChatGPT"
        text={text}
        detections={detections}
        summary={{ total: 1, items: [{ label: 'OpenAI API key', count: 1 }] }}
        onAction={() => {}}
      />,
    );
    expect(container.textContent).not.toContain(secret);
  });

  test('clicking a finding expands a masked snippet without the raw secret', () => {
    const multiline = `first\nsecond\nkey ${secret} end`;
    const at = multiline.indexOf(secret);
    const dets: Detection[] = [
      {
        type: 'known-key',
        label: 'OpenAI API key',
        match: secret,
        start: at,
        end: at + secret.length,
      },
    ];
    const { container } = render(
      <Overlay site="ChatGPT" text={multiline} detections={dets} onAction={() => {}} />,
    );

    expect(container.querySelector('.si-snippet')).toBeNull();
    fireEvent.click(screen.getByText('OpenAI API key'));

    expect(container.querySelector('.si-snippet')).toBeTruthy();
    expect(screen.getByRole('alertdialog').textContent).not.toContain(secret);
  });
});
