import { describe, expect, test } from '@jest/globals';
import { resolveInternalLinks } from '../src/utils';

describe('resolveInternalLinks', () => {
	const uuidMap: Record<string, string> = {
		ABC123: 'ABC123.md',
		DEF456: '2024-04-19 215553.md',
	};

	test('should resolve markdown-wrapped links', () => {
		const text =
			'See [my other entry](dayone://view?entryId=ABC123) for details';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe('See [[ABC123|my other entry]] for details');
		expect(result.resolvedCount).toBe(1);
		expect(result.totalCount).toBe(1);
	});

	test('should resolve bare/raw links', () => {
		const text = 'Another entry: dayone://view?entryId=ABC123';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe('Another entry: [[ABC123]]');
		expect(result.resolvedCount).toBe(1);
		expect(result.totalCount).toBe(1);
	});

	test('should handle both link types in the same text', () => {
		const text =
			'See [linked](dayone://view?entryId=ABC123) and also dayone://view?entryId=DEF456';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe(
			'See [[ABC123|linked]] and also [[2024-04-19 215553]]'
		);
		expect(result.resolvedCount).toBe(2);
		expect(result.totalCount).toBe(2);
	});

	test('should leave unresolved links unchanged', () => {
		const text =
			'See [missing](dayone://view?entryId=UNKNOWN) and dayone://view?entryId=ALSO_UNKNOWN';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe(text);
		expect(result.resolvedCount).toBe(0);
		expect(result.totalCount).toBe(2);
	});

	test('should handle text with no links', () => {
		const text = 'Just some regular text with no links';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe(text);
		expect(result.resolvedCount).toBe(0);
		expect(result.totalCount).toBe(0);
	});

	test('should handle empty UUID map', () => {
		const text =
			'See [entry](dayone://view?entryId=ABC123) and dayone://view?entryId=DEF456';
		const result = resolveInternalLinks(text, {});

		expect(result.text).toBe(text);
		expect(result.resolvedCount).toBe(0);
		expect(result.totalCount).toBe(2);
	});

	test('should strip .md extension from wiki-link targets', () => {
		const text = 'dayone://view?entryId=DEF456';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe('[[2024-04-19 215553]]');
	});

	test('should handle lowercase hex in UUIDs', () => {
		const map = { abc123def: 'some-file.md' };
		const text = 'dayone://view?entryId=abc123def';
		const result = resolveInternalLinks(text, map);

		expect(result.text).toBe('[[some-file]]');
		expect(result.resolvedCount).toBe(1);
	});

	test('should handle multiple links to the same entry', () => {
		const text =
			'[first ref](dayone://view?entryId=ABC123) and [second ref](dayone://view?entryId=ABC123)';
		const result = resolveInternalLinks(text, uuidMap);

		expect(result.text).toBe('[[ABC123|first ref]] and [[ABC123|second ref]]');
		expect(result.resolvedCount).toBe(2);
		expect(result.totalCount).toBe(2);
	});
});
