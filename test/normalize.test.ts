/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeEntries } from '../src/normalize';
import { DEFAULT_SETTINGS } from '../src/main';
import { FileManager, TFile, TFolder, Vault } from 'obsidian';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	test,
} from '@jest/globals';
import { UuidMapStore } from '../src/uuid-map';

jest.mock('obsidian', () => {
	const actual = jest.requireActual('obsidian');
	return Object.assign({}, actual, {
		Notice: jest.fn(),
	});
});

const makeTFile = (path: string, name: string): TFile =>
	({
		path,
		name,
		basename: name.replace(/\.md$/, ''),
		extension: 'md',
		stat: {},
	}) as unknown as TFile;

describe('normalizeEntries', () => {
	let vault: jest.Mocked<Vault>;
	let fileManager: jest.Mocked<FileManager>;
	let mockUuidMapStore: jest.Mocked<UuidMapStore>;
	let frontmatterObjs: Record<string, any>[];

	beforeEach(() => {
		frontmatterObjs = [];
		vault = {
			getAbstractFileByPath: jest.fn(),
			getMarkdownFiles: jest.fn(),
			cachedRead: jest.fn(),
			modify: jest.fn(),
			delete: jest.fn(),
			rename: jest.fn(),
		} as unknown as jest.Mocked<Vault>;
		fileManager = {
			processFrontMatter: jest.fn((file: any, cb: any) => {
				const fm: Record<string, any> = {};
				cb(fm);
				frontmatterObjs.push(fm);
			}),
		} as unknown as jest.Mocked<FileManager>;
		mockUuidMapStore = {
			read: jest
				.fn<() => Promise<Record<string, string>>>()
				.mockResolvedValue({}),
			write: jest
				.fn<(map: Record<string, string>) => Promise<void>>()
				.mockResolvedValue(undefined),
		} as jest.Mocked<UuidMapStore>;
	});

	afterEach(() => {
		jest.clearAllMocks();
		frontmatterObjs = [];
	});

	test('Case 1a: keep-imported deletes migrated file when UUID is in map', async () => {
		const file = makeTFile('_migrate/entry.md', 'entry.md');

		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '_migrate') {
				return { children: [file] } as unknown as TFolder;
			}
			return null;
		});
		vault.cachedRead.mockResolvedValue(
			'Some text with [link](dayone://view?entryId=ABC123DEF456) here'
		);
		mockUuidMapStore.read.mockResolvedValue({
			ABC123DEF456: '2024-04-19 22.48.36.md',
		});

		const res = await normalizeEntries(
			vault,
			fileManager,
			{
				...DEFAULT_SETTINGS,
				normalizeScanFolder: '_migrate',
				normalizeConflictResolution: 'keep-imported',
			},
			mockUuidMapStore
		);

		expect(res.deleted).toBe(1);
		expect(res.normalized).toBe(0);
		expect(vault.delete).toHaveBeenCalledWith(file);
	});

	test('Case 1b: keep-migrated deletes imported and normalizes migrated', async () => {
		const file = makeTFile('_migrate/entry.md', 'entry.md');
		const importedFile = makeTFile(
			'day-one-out/2024-04-19 22.48.36.md',
			'2024-04-19 22.48.36.md'
		);

		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '_migrate') {
				return { children: [file] } as unknown as TFolder;
			}
			if (path === 'day-one-out/2024-04-19 22.48.36.md') {
				return importedFile;
			}
			return null;
		});
		vault.cachedRead.mockResolvedValue(
			'---\ndate: 2024-04-19T22:48:36+01:00\n---\n> Dayone: [View in Day One](dayone://view?entryId=ABC123DEF456)\n\nSome content'
		);
		mockUuidMapStore.read.mockResolvedValue({
			ABC123DEF456: '2024-04-19 22.48.36.md',
		});

		const res = await normalizeEntries(
			vault,
			fileManager,
			{
				...DEFAULT_SETTINGS,
				normalizeScanFolder: '_migrate',
				normalizeConflictResolution: 'keep-migrated',
			},
			mockUuidMapStore
		);

		expect(res.normalized).toBe(1);
		expect(vault.delete).toHaveBeenCalledWith(importedFile);
		expect(vault.modify).toHaveBeenCalled();
	});

	test('Case 2: normalizes ghost entry when UUID not in map', async () => {
		const file = makeTFile('_migrate/entry.md', 'entry.md');

		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '_migrate') {
				return { children: [file] } as unknown as TFolder;
			}
			return null;
		});
		vault.cachedRead.mockResolvedValue(
			'> Date: April 19, 2024\n' +
				'> [Open in Day One](dayone://view?entryId=UNKNOWN123)\n\n' +
				'# 2024-04-19 22.48.36\n\n' +
				'Entry content #inline-tag here'
		);
		mockUuidMapStore.read.mockResolvedValue({});

		const res = await normalizeEntries(
			vault,
			fileManager,
			{ ...DEFAULT_SETTINGS, normalizeScanFolder: '_migrate' },
			mockUuidMapStore
		);

		expect(res.normalized).toBe(1);
		expect(res.deleted).toBe(0);
		expect(vault.modify).toHaveBeenCalled();
		expect(vault.rename).toHaveBeenCalledWith(file, 'entry.md');

		// Check that inline tags were collected
		expect(frontmatterObjs[0].tags).toContain('inline-tag');
	});

	test('Case 3: normalizes native entry with no Day One link', async () => {
		const file = makeTFile('_migrate/native.md', 'native.md');

		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '_migrate') {
				return { children: [file] } as unknown as TFolder;
			}
			return null;
		});
		vault.cachedRead.mockResolvedValue(
			'Some native content #my-tag with no Day One links'
		);
		mockUuidMapStore.read.mockResolvedValue({});

		const res = await normalizeEntries(
			vault,
			fileManager,
			{ ...DEFAULT_SETTINGS, normalizeScanFolder: '_migrate' },
			mockUuidMapStore
		);

		expect(res.normalized).toBe(1);
		expect(res.deleted).toBe(0);
		expect(frontmatterObjs[0].tags).toContain('my-tag');
	});

	test('scans entire vault when normalizeScanFolder is empty', async () => {
		const files = [
			makeTFile('note1.md', 'note1.md'),
			makeTFile('note2.md', 'note2.md'),
		];
		vault.getMarkdownFiles.mockReturnValue(files);
		vault.cachedRead.mockResolvedValue('plain content');
		mockUuidMapStore.read.mockResolvedValue({});

		const res = await normalizeEntries(
			vault,
			fileManager,
			{ ...DEFAULT_SETTINGS, normalizeScanFolder: '' },
			mockUuidMapStore
		);

		expect(vault.getMarkdownFiles).toHaveBeenCalled();
		expect(res.total).toBe(2);
	});

	test('returns empty result for non-existent scan folder', async () => {
		vault.getAbstractFileByPath.mockReturnValue(null);

		const res = await normalizeEntries(
			vault,
			fileManager,
			{ ...DEFAULT_SETTINGS, normalizeScanFolder: 'nonexistent' },
			mockUuidMapStore
		);

		expect(res.total).toBe(0);
	});

	test('strips ghost dayone2:// links from native entries', async () => {
		const file = makeTFile('_migrate/native.md', 'native.md');

		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '_migrate') {
				return { children: [file] } as unknown as TFolder;
			}
			return null;
		});
		vault.cachedRead.mockResolvedValue(
			'Text with [dead link](dayone2://view?entryId=DEADBEEF) here'
		);
		mockUuidMapStore.read.mockResolvedValue({});

		await normalizeEntries(
			vault,
			fileManager,
			{ ...DEFAULT_SETTINGS, normalizeScanFolder: '_migrate' },
			mockUuidMapStore
		);

		const writtenBody = vault.modify.mock.calls[0][1] as string;
		expect(writtenBody).not.toContain('dayone2://');
		expect(writtenBody).toContain('dead link');
	});
});
