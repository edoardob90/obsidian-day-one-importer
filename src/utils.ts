import { DayOneImporterSettings } from './main';
import { DayOneItem } from './schema';
import { moment, normalizePath } from 'obsidian';
import { ZodError } from 'zod';

export function buildFileName(
	settings: DayOneImporterSettings,
	item: DayOneItem
) {
	if (settings.dateBasedFileNames) {
		if (item.isAllDay) {
			return normalizePath(
				`${moment(item.creationDate).format(settings.dateBasedAllDayFileNameFormat)}.md`
			);
		} else {
			return normalizePath(
				`${moment(item.creationDate).format(settings.dateBasedFileNameFormat)}.md`
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

/**
 * Resolves Day One internal links to Obsidian wiki-links using a UUID-to-filename map.
 * Handles both markdown-wrapped links and bare/raw links:
 * - `[link text](dayone://view?entryId=UUID)` -> `[[filename|link text]]`
 * - `dayone://view?entryId=UUID` -> `[[filename]]`
 */
export function resolveInternalLinks(
	text: string,
	uuidToFileName: Record<string, string>
): { text: string; resolvedCount: number; totalCount: number } {
	let resolvedCount = 0;
	let totalCount = 0;

	// First pass: markdown-wrapped links [text](dayone://view?entryId=UUID)
	let updatedText = text.replace(
		/\[([^\]]+)\]\(dayone:\/\/view\?entryId=([A-Za-z0-9]+)\)/g,
		(match, linkText, uuid) => {
			totalCount++;
			const fileName = uuidToFileName[uuid];
			if (fileName) {
				resolvedCount++;
				// Strip .md extension for wiki-link
				const linkTarget = fileName.replace(/\.md$/, '');
				return `[[${linkTarget}|${linkText}]]`;
			}
			return match;
		}
	);

	// Second pass: bare/raw links dayone://view?entryId=UUID (not already inside markdown link syntax)
	updatedText = updatedText.replace(
		/(?<!\]\()dayone:\/\/view\?entryId=([A-Za-z0-9]+)/g,
		(match, uuid) => {
			totalCount++;
			const fileName = uuidToFileName[uuid];
			if (fileName) {
				resolvedCount++;
				const linkTarget = fileName.replace(/\.md$/, '');
				return `[[${linkTarget}]]`;
			}
			return match;
		}
	);

	return { text: updatedText, resolvedCount, totalCount };
}
