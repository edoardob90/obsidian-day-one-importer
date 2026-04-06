import {
	slugifyJournalName,
	buildJournalTag,
	formatDateWithOffset,
	formatWeather,
	formatLocation,
	stripInlineTags,
	DAYONE_LINK_REGEX,
} from '../src/utils';
import { DayOneItem } from '../src/schema';

describe('slugifyJournalName', () => {
	it('lowercases and replaces spaces with hyphens', () => {
		expect(slugifyJournalName('Dev Journal')).toBe('dev-journal');
	});

	it('handles single word', () => {
		expect(slugifyJournalName('PCT')).toBe('pct');
	});

	it('strips special characters', () => {
		expect(slugifyJournalName('My Journal! (2024)')).toBe('my-journal-2024');
	});

	it('strips leading/trailing hyphens', () => {
		expect(slugifyJournalName('  Journal  ')).toBe('journal');
	});

	it('preserves underscores and hyphens', () => {
		expect(slugifyJournalName('my_journal-name')).toBe('my_journal-name');
	});

	it('collapses multiple hyphens', () => {
		expect(slugifyJournalName('A  B  C')).toBe('a-b-c');
	});
});

describe('buildJournalTag', () => {
	const makeItem = (creationDate: string, timeZone: string): DayOneItem =>
		({
			creationDate,
			timeZone,
			modifiedDate: creationDate,
			uuid: 'test',
			text: '',
		}) as DayOneItem;

	it('builds tag from filename and date with no prefix', () => {
		const item = makeItem('2025-09-13T06:50:38Z', 'Europe/Rome');
		expect(buildJournalTag('Dev Journal.json', item, '')).toBe(
			'dev-journal/2025/09'
		);
	});

	it('builds tag with prefix', () => {
		const item = makeItem('2025-09-13T06:50:38Z', 'Europe/Rome');
		expect(buildJournalTag('Dev Journal.json', item, 'journal/')).toBe(
			'journal/dev-journal/2025/09'
		);
	});

	it('respects timezone for month boundary', () => {
		// UTC is still August 31, but in +02:00 it's September 1
		const item = makeItem('2025-08-31T22:30:00Z', 'Europe/Rome');
		expect(buildJournalTag('Test.json', item, '')).toBe('test/2025/09');
	});

	it('strips .json extension case-insensitively', () => {
		const item = makeItem('2025-01-15T12:00:00Z', 'UTC');
		expect(buildJournalTag('MyJournal.JSON', item, '')).toBe(
			'myjournal/2025/01'
		);
	});
});

describe('formatDateWithOffset', () => {
	it('converts UTC date to timezone with offset', () => {
		const result = formatDateWithOffset('2025-09-13T06:50:38Z', 'Europe/Rome');
		expect(result).toBe('2025-09-13T08:50:38+02:00');
	});

	it('keeps UTC as Z', () => {
		const result = formatDateWithOffset('2025-01-15T12:00:00Z', 'UTC');
		expect(result).toBe('2025-01-15T12:00:00Z');
	});

	it('handles negative offset', () => {
		const result = formatDateWithOffset(
			'2025-01-15T12:00:00Z',
			'America/New_York'
		);
		expect(result).toBe('2025-01-15T07:00:00-05:00');
	});

	it('strips milliseconds', () => {
		const result = formatDateWithOffset('2025-01-15T12:00:00.123Z', 'UTC');
		expect(result).toBe('2025-01-15T12:00:00Z');
	});
});

describe('formatWeather', () => {
	it('formats temperature and condition', () => {
		expect(
			formatWeather({
				temperatureCelsius: 22.3,
				conditionsDescription: 'Partly Cloudy',
			})
		).toBe('22°C Partly Cloudy');
	});

	it('formats temperature only', () => {
		expect(formatWeather({ temperatureCelsius: -1.7 })).toBe('-2°C');
	});

	it('formats condition only', () => {
		expect(formatWeather({ conditionsDescription: 'Clear' })).toBe('Clear');
	});

	it('returns null for empty weather', () => {
		expect(formatWeather({})).toBeNull();
	});

	it('returns null for undefined', () => {
		expect(formatWeather(undefined)).toBeNull();
	});

	it('rounds temperature to nearest integer', () => {
		expect(formatWeather({ temperatureCelsius: 0.5 })).toBe('1°C');
		expect(formatWeather({ temperatureCelsius: 0.4 })).toBe('0°C');
	});
});

describe('formatLocation', () => {
	it('formats placeName + localityName + country', () => {
		expect(
			formatLocation({
				placeName: 'London Eye',
				localityName: 'London',
				country: 'United Kingdom',
				latitude: 51.5,
				longitude: -0.1,
			})
		).toBe('London Eye, London, United Kingdom');
	});

	it('formats localityName + country when no placeName', () => {
		expect(
			formatLocation({
				localityName: 'Lugano',
				country: 'Switzerland',
				latitude: 46.0,
				longitude: 8.9,
			})
		).toBe('Lugano, Switzerland');
	});

	it('formats placeName + country when no localityName', () => {
		expect(
			formatLocation({
				placeName: 'Eiffel Tower',
				country: 'France',
				latitude: 48.8,
				longitude: 2.3,
			})
		).toBe('Eiffel Tower, France');
	});

	it('returns null for undefined location', () => {
		expect(formatLocation(undefined)).toBeNull();
	});

	it('returns null when no name fields are present', () => {
		expect(formatLocation({ latitude: 51.5, longitude: -0.1 })).toBeNull();
	});
});

describe('stripInlineTags', () => {
	it('strips tags and returns them', () => {
		const result = stripInlineTags('Hello #world this is #test');
		expect(result.tags).toEqual(['world', 'test']);
		expect(result.text).not.toContain('#world');
		expect(result.text).not.toContain('#test');
	});

	it('handles tags at start of line', () => {
		const result = stripInlineTags('#first line\n#second line');
		expect(result.tags).toContain('first');
		expect(result.tags).toContain('second');
	});

	it('handles nested/slash tags', () => {
		const result = stripInlineTags('Some #journal/2025/09 text');
		expect(result.tags).toContain('journal/2025/09');
	});

	it('deduplicates tags', () => {
		const result = stripInlineTags('#dup text #dup again');
		expect(result.tags).toEqual(['dup']);
	});

	it('returns empty array when no tags', () => {
		const result = stripInlineTags('No tags here');
		expect(result.tags).toEqual([]);
		expect(result.text).toBe('No tags here');
	});

	it('collapses excessive newlines', () => {
		const result = stripInlineTags('Before\n\n\n\nAfter');
		expect(result.text).toBe('Before\n\nAfter');
	});
});

describe('DAYONE_LINK_REGEX', () => {
	it('matches dayone:// links', () => {
		const text = 'See [entry](dayone://view?entryId=ABC123DEF456)';
		const matches = [...text.matchAll(DAYONE_LINK_REGEX)];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe('ABC123DEF456');
	});

	it('matches dayone2:// links', () => {
		const text = 'See [entry](dayone2://view?entryId=abc123def)';
		const matches = [...text.matchAll(DAYONE_LINK_REGEX)];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe('abc123def');
	});

	it('matches multiple links', () => {
		const text =
			'Link1 dayone://view?entryId=AAA111 and dayone2://view?entryId=BBB222';
		const matches = [...text.matchAll(DAYONE_LINK_REGEX)];
		expect(matches).toHaveLength(2);
	});

	it('does not match unrelated URLs', () => {
		const text = 'https://example.com/view?entryId=ABC123';
		const matches = [...text.matchAll(DAYONE_LINK_REGEX)];
		expect(matches).toHaveLength(0);
	});
});
