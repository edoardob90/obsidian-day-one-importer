import { DayOneImporterSettings } from './main';
import { DayOneItem, MediaObject } from './schema';
import { normalizePath } from 'obsidian';
import { ZodError } from 'zod';
import { TFile, TFolder, Vault, Notice } from 'obsidian';
import { DayOneItemSchema } from './schema';
import { DateTime } from 'luxon';

export const ILLEGAL_FILENAME_CHARACTERS = [
	'[',
	']',
	':',
	'\\',
	'/',
	'^',
	'|',
	'#',
];

export function buildFileName(
	settings: DayOneImporterSettings,
	item: DayOneItem
) {
	if (settings.dateBasedFileNames) {
		const dt = DateTime.fromISO(
			settings.localizedDateMode === 'none' || !item.localizedDate
				? item.creationDate
				: item.localizedDate
		);
		if (item.isAllDay) {
			return normalizePath(
				`${dt.toFormat(settings.dateBasedAllDayFileNameFormat)}.md`
			);
		} else {
			return normalizePath(
				`${dt.toFormat(settings.dateBasedFileNameFormat)}.md`
			);
		}
	} else {
		return normalizePath(`${item.uuid}.md`);
	}
}

export type ImportFailure = { entry: DayOneItem; reason: string };
export type ImportInvalidEntry = {
	entryId?: string;
	creationDate?: string;
	reason: ZodError;
};

export type ImportResult = {
	total: number;
	successCount: number;
	ignoreCount: number;
	failures: ImportFailure[];
	invalidEntries: ImportInvalidEntry[];
};

export function isIllegalFileName(fileName: string): boolean {
	return ILLEGAL_FILENAME_CHARACTERS.some((illegal) =>
		fileName.contains(illegal)
	);
}

/**
 * Utility for resolving Day One internal links to Obsidian wiki-links using a UUID-to-filename map.
 * Returns the updated text along with statistics about how many links were resolved.
 */
export function resolveInternalLinks(
	text: string,
	uuidToFileName: Record<string, string>
): { text: string; resolvedCount: number; totalCount: number } {
	let resolvedCount = 0;
	let totalCount = 0;

	const updatedText = text.replace(
		/\[([^\]]+)\]\(dayone:\/\/view\?entryId=([A-F0-9]+)\)/g,
		(match, linkText, uuid) => {
			totalCount++;
			const fileName = uuidToFileName[uuid];
			if (fileName) {
				resolvedCount++;
				return `[[${fileName}|${linkText}]]`;
			}
			return match;
		}
	);

	return { text: updatedText, resolvedCount, totalCount };
}

/**
 * Checks if the given object is an instance of TFolder or TFile
 * without relying on 'instanceof' operator since it breaks testing
 */
export function isTFolder(obj: unknown): obj is TFolder {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'children' in obj &&
		Array.isArray((obj as { children?: unknown }).children)
	);
}

export function isTFile(obj: unknown): obj is TFile {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'basename' in obj &&
		'extension' in obj &&
		'stat' in obj
	);
}

/**
 * Collects and validates entries from Day One JSON files.
 * Shared function used by both importJson and updateFrontMatter.
 */
export async function collectDayOneEntries(
	vault: Vault,
	settings: DayOneImporterSettings
): Promise<{
	allEntries: { item: DayOneItem; fileName: string }[];
	allInvalidEntries: ImportInvalidEntry[];
}> {
	const folder = settings.inDirectory;
	const fileNameOverride = settings.inFileName;

	const folderFiles = vault.getAbstractFileByPath(folder);
	if (!folderFiles || !isTFolder(folderFiles)) {
		new Notice('Input directory does not exist. Please check your settings.');
		throw new Error('Input directory does not exist.');
	}

	let filesToProcess: string[] = [];
	if (fileNameOverride && fileNameOverride.trim() !== '') {
		filesToProcess = [fileNameOverride];
		const file = vault.getAbstractFileByPath(folder + '/' + fileNameOverride);
		if (!file || !isTFile(file)) {
			new Notice(
				`File ${fileNameOverride} does not exist in the input directory.`
			);
			throw new Error(
				`File ${fileNameOverride} does not exist in the input directory.`
			);
		}
	} else {
		filesToProcess = folderFiles.children
			.filter((f) => isTFile(f) && f.name.endsWith('.json'))
			.map((f) => f.name);
	}

	if (!filesToProcess.length) {
		new Notice('No JSON files found in the input directory.');
		return {
			allEntries: [],
			allInvalidEntries: [],
		};
	}

	// Collect all entries from all files
	const allEntries: { item: DayOneItem; fileName: string }[] = [];
	const allInvalidEntries: ImportInvalidEntry[] = [];

	for (const fileName of filesToProcess) {
		const file = vault.getAbstractFileByPath(folder + '/' + fileName);
		if (!file || !isTFile(file)) {
			console.error(`No file found: ${folder}/${fileName}`);
			continue;
		}
		const fileData = await vault.read(file);
		const parsedFileData = JSON.parse(fileData);
		if (!Array.isArray(parsedFileData.entries)) {
			console.error('Invalid file format in ' + fileName);
			continue;
		}
		parsedFileData.entries.forEach((entry: unknown) => {
			const parsedEntry = DayOneItemSchema.safeParse(entry);
			if (parsedEntry.success) {
				const item = parsedEntry.data;

				// Transform tags if tagStyle is set
				if (item.tags && settings.tagStyle) {
					item.tags = item.tags.map((tag) =>
						transformTag(tag, settings.tagStyle)
					);
				}

				// Add localizedDate if timeZone is valid
				let localizedDate: string | null = null;
				if (settings.localizedDateMode === 'event') {
					localizedDate = DateTime.fromISO(item.creationDate, {
						zone: item.timeZone,
					})
						.setZone(item.timeZone)
						.toISO({ includeOffset: false });
				} else if (settings.localizedDateMode === 'local') {
					localizedDate = DateTime.fromISO(item.creationDate, {
						zone: 'utc',
					})
						.setZone(DateTime.local().zone)
						.toISO({ includeOffset: false });
				}
				item.localizedDate = localizedDate;

				// Add the entry to the list
				allEntries.push({ item, fileName });
			} else {
				const entryId = (entry as DayOneItem)?.uuid;
				const entryCreationDate = (entry as DayOneItem)?.creationDate;
				allInvalidEntries.push({
					entryId,
					creationDate: entryCreationDate,
					reason: parsedEntry.error,
				});
				console.error(
					`Invalid entry: ${entryId} ${entryCreationDate} - ${parsedEntry.error}`
				);
			}
		});
	}

	return {
		allEntries,
		allInvalidEntries,
	};
}

/**
 * Perform a tag-style conversion on the tag string.
 */
export function transformTag(tag: string, style?: string): string {
	if (!style) return tag;
	const words = tag.split(/\s+/);
	switch (style) {
		case 'camelCase':
			return words
				.map((word, index) =>
					index === 0
						? word.toLowerCase()
						: word.charAt(0).toUpperCase() + word.slice(1)
				)
				.join('');
		case 'PascalCase':
			return words
				.map(
					(word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
				)
				.join('');
		case 'snake_case':
			return words.map((word) => word.toLowerCase()).join('_');
		case 'kebab-case':
			return words.map((word) => word.toLowerCase()).join('-');
		default:
			return tag;
	}
}

/**
 * Builds the file body for a Day One entry
 * Cleans up text from unwanted characters or sequences
 */
export function buildFileBody(
	item: DayOneItem,
	uuidToFileName: Record<string, string>
): string {
	// Clean up text by removing unwanted characters and sequences
	let text = `${(item.text as string)
		.replace(/\\/gm, '')
		.replace(/```\s+```/gm, '')
		.replace(/\u2028/g, '\n')
		.replace(/\u1C6A/g, '\n\n')
		.replace(/\u200b/g, '')}`;

	const photoMoments = Array.from(
		text.matchAll(/!\[]\(dayone-moment:\/\/([^)]+)\)/g)
	);

	const videoMoments = Array.from(
		text.matchAll(/!\[]\(dayone-moment:\/video\/([^)]+)\)/g)
	);

	const audioMoments = Array.from(
		text.matchAll(/!\[]\(dayone-moment:\/audio\/([^)]+)\)/g)
	);

	const pdfMoments = Array.from(
		text.matchAll(/!\[]\(dayone-moment:\/pdfAttachment\/([^)]+)\)/g)
	);

	const replacements = [
		...photoMoments,
		...videoMoments,
		...audioMoments,
		...pdfMoments,
	].map((match) => buildMediaReplacement(item, match));

	if (replacements.length > 0) {
		replacements.forEach((replacement) => {
			text = text.replace(replacement.replace, replacement.with);
		});
	}

	// Only resolve internal links if we have a UUID map
	text =
		Object.keys(uuidToFileName).length > 0
			? resolveInternalLinks(text, uuidToFileName).text
			: text;

	return text;
}

/**
 * Builds the markdown replacement for a media object
 * @param item - The Day One item containing the media
 * @param match - The regex match for the media identifier
 * @returns The markdown replacement for the media object
 */
export function buildMediaReplacement(
	item: DayOneItem,
	match: RegExpMatchArray
) {
	// Define media collections with optional custom transform for audio
	// Audio files:
	// 	I tried a few different formats but Day One always seems to convert them to m4a
	// 	May get some bug reports about this in the future if Day One isn't consistent
	const mediaTypes: Array<{
		collection?: MediaObject[];
		fn?: (m: MediaObject) => MediaObject;
	}> = [
		{ collection: item.photos },
		{ collection: item.videos },
		{ collection: item.pdfAttachments },
		{
			collection: item.audios,
			fn: (audio: MediaObject) => ({ ...audio, type: 'm4a' }),
		},
	];

	// Find the media object in any of the collections
	let mediaObj: MediaObject | null = null;
	for (const { collection, fn = (media: MediaObject) => media } of mediaTypes) {
		if (!collection) continue;

		const found = collection.find((media) => media.identifier === match[1]);
		console.log(`Found media with identifier ${found?.identifier}`);
		if (found) {
			mediaObj = fn(found);
			break;
		}
	}

	// Create markdown link if media was found
	if (mediaObj) {
		// Ensure we have a type value, default to extension-less format if not provided
		const mediaFileName = mediaObj.type
			? `${mediaObj.md5}.${mediaObj.type}`
			: mediaObj.md5;

		return {
			replace: match[0],
			with: `![](${mediaFileName})`,
		};
	}

	// Log error and return unchanged if no media found
	console.error(
		`Could not find media with identifier ${match[1]} in entry ${item.uuid}`
	);

	return {
		replace: match[0],
		with: match[0],
	};
}
