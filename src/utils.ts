import { DayOneImporterSettings } from './main';
import { DayOneItem, MediaObject } from './schema';
import { normalizePath } from 'obsidian';
import { ZodError } from 'zod';
import { TFile, TFolder, Vault, Notice } from 'obsidian';
import { DayOneItemSchema } from './schema';
import { DateTime } from 'luxon';

export const ILLEGAL_FILENAME_CHARACTERS = [
	':',
	'\\',
	'/',
	'^',
	'|',
	'#',
	// Paired square brackets are illegal (single brackets are handled by the
	// unpaired bracket check in isIllegalFileName)
	'[[',
	']]',
];

export function buildFileName(
	settings: DayOneImporterSettings,
	item: DayOneItem
) {
	if (settings.dateBasedFileNames) {
		let dt: DateTime;
		if (settings.localizedDateMode === 'event' && item.timeZone) {
			// Use the entry's original timezone
			dt = DateTime.fromISO(item.creationDate, {
				zone: item.timeZone,
			});
		} else if (settings.localizedDateMode === 'local') {
			// Use system local timezone
			dt = DateTime.fromISO(item.creationDate).toLocal();
		} else {
			// 'none': use UTC as-is
			dt = DateTime.fromISO(item.creationDate, { zone: 'utc' });
		}
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

const UNPAIRED_SQUARE_BRACKET_REGEX = new RegExp('(\\[[^\\]]*$)|(^[^\\[]*])');

export function isIllegalFileName(fileName: string): boolean {
	return (
		ILLEGAL_FILENAME_CHARACTERS.some((illegal) => fileName.contains(illegal)) ||
		UNPAIRED_SQUARE_BRACKET_REGEX.test(fileName)
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

	const folderFiles = vault.getAbstractFileByPath(folder);
	if (!folderFiles || !isTFolder(folderFiles)) {
		new Notice('Input directory does not exist. Please check your settings.');
		throw new Error('Input directory does not exist.');
	}

	// Recursively collect all JSON files from directory
	const collectJsonFiles = (
		parent: { children: import('obsidian').TAbstractFile[] },
		basePath: string
	): { name: string; path: string }[] => {
		const result: { name: string; path: string }[] = [];
		for (const child of parent.children) {
			if (isTFile(child) && child.name.endsWith('.json')) {
				result.push({ name: child.name, path: child.path });
			} else if (isTFolder(child)) {
				result.push(...collectJsonFiles(child, child.path));
			}
		}
		return result;
	};

	let filesToProcess = collectJsonFiles(folderFiles, folder);

	// Apply file pattern filter if set
	if (settings.filePattern && settings.filePattern.trim() !== '') {
		try {
			const regex = new RegExp(settings.filePattern);
			if (settings.filePatternMode === 'exclude') {
				filesToProcess = filesToProcess.filter((f) => !regex.test(f.name));
			} else {
				filesToProcess = filesToProcess.filter((f) => regex.test(f.name));
			}
		} catch {
			new Notice(`Invalid file pattern regex: ${settings.filePattern}`);
			throw new Error(`Invalid file pattern regex: ${settings.filePattern}`);
		}
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

	for (const { name: jsonFileName, path: jsonPath } of filesToProcess) {
		const file = vault.getAbstractFileByPath(jsonPath);
		if (!file || !isTFile(file)) {
			console.error(`No file found: ${jsonPath}`);
			continue;
		}
		const fileData = await vault.read(file);
		const parsedFileData = JSON.parse(fileData);
		if (!Array.isArray(parsedFileData.entries)) {
			console.error('Invalid file format in ' + jsonFileName);
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
				allEntries.push({ item, fileName: jsonFileName });
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

/**
 * Regex to find Day One deep links in note bodies.
 */
export const DAYONE_LINK_REGEX = /dayone2?:\/\/view\?entryId=([A-Fa-f0-9]+)/g;

/**
 * Slugify a journal name for use as an Obsidian tag.
 * Lowercase, replace spaces/special chars with hyphens, strip leading/trailing hyphens.
 */
export function slugifyJournalName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Build the auto-generated journal tag from a Day One JSON filename and entry date.
 * Example: "Dev Journal.json" + entry in Sept 2025 + prefix "" → "dev-journal/2025/09"
 * Example: same + prefix "journal/" → "journal/dev-journal/2025/09"
 */
export function buildJournalTag(
	jsonFileName: string,
	item: DayOneItem,
	prefix: string
): string {
	const journalName = slugifyJournalName(jsonFileName.replace(/\.json$/i, ''));
	const dt = DateTime.fromISO(item.creationDate, { zone: item.timeZone });
	return `${prefix}${journalName}/${dt.toFormat('yyyy')}/${dt.toFormat('MM')}`;
}

/**
 * Format an ISO date string with timezone offset.
 */
export function formatDateWithOffset(
	isoDate: string,
	timeZone: string
): string {
	return DateTime.fromISO(isoDate, { zone: timeZone })
		.set({ millisecond: 0 })
		.toISO({ suppressMilliseconds: true })!;
}

/**
 * Format weather data into a human-readable string.
 * Returns null if no meaningful data is present.
 */
export function formatWeather(
	weather:
		| { temperatureCelsius?: number; conditionsDescription?: string }
		| undefined
): string | null {
	if (!weather) return null;
	const parts: string[] = [];
	if (weather.temperatureCelsius !== undefined) {
		parts.push(`${Math.round(weather.temperatureCelsius)}\u00B0C`);
	}
	if (weather.conditionsDescription) {
		parts.push(weather.conditionsDescription);
	}
	return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Format location data into a human-readable string.
 * Uses most specific available fields, always appends country if present.
 * Returns null if no meaningful data is present.
 */
export function formatLocation(
	location: DayOneItem['location']
): string | null {
	if (!location) return null;
	const parts = [
		location.placeName,
		location.localityName,
		location.country,
	].filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Strip inline #tags from text and return them separately.
 * Only matches tags that are at the start of a line or preceded by whitespace.
 */
export function stripInlineTags(text: string): {
	text: string;
	tags: string[];
} {
	const tags: string[] = [];
	const stripped = text.replace(
		/(?:^|\s)#([a-zA-Z0-9_\-/]+)/g,
		(match, tag, offset) => {
			tags.push(tag);
			// Preserve leading whitespace if the match started with it
			return match.startsWith('#') ? '' : match[0];
		}
	);
	return {
		text: stripped.replace(/\n{3,}/g, '\n\n').trim(),
		tags: [...new Set(tags)],
	};
}
