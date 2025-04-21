import { buildFileBody } from '../src/import-json';
import { DayOneItemSchema } from '../src/schema';
import * as fs from 'fs';
import * as path from 'path';

describe('buildFileBody', () => {
	test('should properly clean up text with special characters', async () => {
		// Read the test JSON file and expected output
		const jsonPath = path.join(
			__dirname,
			'__test_data__/day-one-in/Journal.json'
		);
		const jsonContent = fs.readFileSync(jsonPath, 'utf8');
		const journal = JSON.parse(jsonContent);

		// Get the first entry from the sample
		const rawEntry = journal.entries[0];

		// Parse through Zod schema to validate entry - just like in collectDayOneEntries
		const parsedEntry = DayOneItemSchema.safeParse(rawEntry);
		expect(parsedEntry.success).toBe(true);

		if (!parsedEntry.success) {
			console.error('Entry validation failed:', parsedEntry.error);
			throw new Error('Entry validation failed');
		}

		// Call buildFileBody with the validated entry
		const result = buildFileBody(parsedEntry.data, {});

		// Read expected output for comparison
		const expectedPath = path.join(
			__dirname,
			'__test_data__/day-one-out/Journal.md'
		);
		const expectedContent = fs.readFileSync(expectedPath, 'utf8');

		// Remove frontmatter from expected content (first several lines up to the second ---)
		const frontmatterEndIndex = expectedContent.indexOf('---', 3) + 3;
		const expectedBodyContent = expectedContent
			.substring(frontmatterEndIndex)
			.trim();

		// Normalize both texts for comparison (remove extra whitespace, normalize newlines)
		// This is just for testing - the actual changes are made in buildFileBody
		const normalizeText = (text: string): string => {
			return text
				.replace(/\r\n/g, '\n') // Normalize line endings
				.replace(/\n{3,}/g, '\n\n') // Replace 3+ consecutive newlines with 2
				.replace(/\s+$/gm, '') // Remove trailing whitespace from each line
				.trim(); // Trim the entire string
		};

		// Log differences if they exist
		if (normalizeText(result) !== normalizeText(expectedBodyContent)) {
			console.log(
				'Expected:\n',
				normalizeText(expectedBodyContent).substring(0, 200) + '...'
			);
			console.log('Result:\n', normalizeText(result).substring(0, 200) + '...');
		}

		// Compare normalized texts
		expect(normalizeText(result)).toBe(normalizeText(expectedBodyContent));
	});
});
