/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEFAULT_SETTINGS } from '../src/main';
import { FileManager, TFile } from 'obsidian';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	test,
} from '@jest/globals';
import { writeTargetFrontMatter } from '../src/update-front-matter';
import { DayOneItem } from '../src/schema';

const makeItem = (overrides: Partial<DayOneItem> = {}): DayOneItem =>
	({
		creationDate: '2024-04-21T22:45:51Z',
		modifiedDate: '2024-04-21T22:46:02Z',
		timeZone: 'Europe/London',
		uuid: '959E7A13B3B649D681DC573DB7E07967',
		text: 'testing 123',
		starred: false,
		isAllDay: false,
		...overrides,
	}) as DayOneItem;

describe('writeTargetFrontMatter', () => {
	let fileManager: jest.Mocked<FileManager>;
	let frontmatterObjs: any[] = [];
	const fakeFile = {} as TFile;

	beforeEach(() => {
		fileManager = {
			processFrontMatter: (file: any, cb: any) => {
				const frontMatter: Record<string, any> = {};
				cb(frontMatter);
				frontmatterObjs.push(frontMatter);
			},
		} as unknown as jest.Mocked<FileManager>;
	});

	afterEach(() => {
		jest.clearAllMocks();
		frontmatterObjs = [];
	});

	test('writes basic frontmatter with date offset', async () => {
		const item = makeItem();
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].date).toBe('2024-04-21T23:45:51+01:00');
		expect(frontmatterObjs[0].modified).toBe('2024-04-21T23:46:02+01:00');
		expect(frontmatterObjs[0].uuid).toBe('959E7A13B3B649D681DC573DB7E07967');
		expect(frontmatterObjs[0].favorite).toBe(false);
	});

	test('omits modified when equal to creationDate', async () => {
		const item = makeItem({
			modifiedDate: '2024-04-21T22:45:51Z',
		});
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].date).toBe('2024-04-21T23:45:51+01:00');
		expect(frontmatterObjs[0].modified).toBeUndefined();
	});

	test('writes coordinates as string when separateCoordinateFields is false', async () => {
		const item = makeItem({
			location: {
				placeName: 'London Eye',
				localityName: 'London',
				country: 'United Kingdom',
				latitude: 51.503,
				longitude: -0.119,
			},
		});
		await writeTargetFrontMatter(
			fakeFile,
			item,
			{ ...DEFAULT_SETTINGS, separateCoordinateFields: false },
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].coordinates).toBe('51.503,-0.119');
		expect(frontmatterObjs[0].location).toBe(
			'London Eye, London, United Kingdom'
		);
	});

	test('writes coordinates as array when separateCoordinateFields is true', async () => {
		const item = makeItem({
			location: {
				placeName: 'London Eye',
				localityName: 'London',
				country: 'United Kingdom',
				latitude: 51.503,
				longitude: -0.119,
			},
		});
		await writeTargetFrontMatter(
			fakeFile,
			item,
			{ ...DEFAULT_SETTINGS, separateCoordinateFields: true },
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].coordinates).toEqual(['51.503', '-0.119']);
		expect(frontmatterObjs[0].location).toBe(
			'London Eye, London, United Kingdom'
		);
	});

	test('omits location and coordinates when no location data', async () => {
		const item = makeItem();
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].coordinates).toBeUndefined();
		expect(frontmatterObjs[0].location).toBeUndefined();
	});

	test('writes weather when present', async () => {
		const item = makeItem({
			weather: {
				temperatureCelsius: 22.3,
				conditionsDescription: 'Partly Cloudy',
			},
		});
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].weather).toBe('22°C Partly Cloudy');
	});

	test('omits weather when not present', async () => {
		const item = makeItem();
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].weather).toBeUndefined();
	});

	test('maps starred to favorite', async () => {
		const item = makeItem({ starred: true });
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'fakefile/2024/04',
			[]
		);

		expect(frontmatterObjs[0].favorite).toBe(true);
	});

	test('merges journal tag, entry tags, and inline tags into sorted deduplicated array', async () => {
		const item = makeItem({
			tags: ['beta-tag', 'alpha-tag'],
		});
		await writeTargetFrontMatter(
			fakeFile,
			item,
			DEFAULT_SETTINGS,
			fileManager,
			'myjournal/2024/04',
			['inline-tag', 'alpha-tag'] // alpha-tag is a duplicate
		);

		expect(frontmatterObjs[0].tags).toEqual([
			'alpha-tag',
			'beta-tag',
			'inline-tag',
			'myjournal/2024/04',
		]);
	});

	test('location uses most specific available fields', async () => {
		// Only localityName + country
		const item1 = makeItem({
			location: {
				localityName: 'Lugano',
				country: 'Switzerland',
				latitude: 46.0,
				longitude: 8.9,
			},
		});
		await writeTargetFrontMatter(
			fakeFile,
			item1,
			DEFAULT_SETTINGS,
			fileManager,
			'j/2024/04',
			[]
		);
		expect(frontmatterObjs[0].location).toBe('Lugano, Switzerland');
	});
});
