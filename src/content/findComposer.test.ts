import { describe, expect, test } from 'vitest';
import { findComposer } from './findComposer';

describe('findComposer', () => {
  test('returns the first element in the path matching the selector', () => {
    const ta = document.createElement('textarea');
    ta.id = 'prompt-textarea';
    const wrapper = document.createElement('div');
    const path: EventTarget[] = [document.createTextNode('x'), ta, wrapper, document];
    expect(findComposer(path, '#prompt-textarea')).toBe(ta);
  });
  test('returns null when nothing in the path matches', () => {
    const div = document.createElement('div');
    expect(findComposer([div, document], '#prompt-textarea')).toBeNull();
  });
  test('matches a contenteditable composer anywhere in the path (e.g. via shadow boundary)', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('data-testid', 'chat-input');
    const inner = document.createElement('span'); // a node inside the editor
    const path: EventTarget[] = [inner, editor, document.createElement('section'), document];
    expect(findComposer(path, 'div[contenteditable="true"][data-testid="chat-input"]')).toBe(
      editor,
    );
  });
});
