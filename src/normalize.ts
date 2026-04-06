import { FileManager, Notice, TFile, TFolder, Vault } from 'obsidian';
import { DayOneImporterSettings } from './main';
import { UuidMapStore } from './uuid-map';
import {
	DAYONE_LINK_REGEX,
	isTFile,
	isTFolder,
	stripInlineTags,
} from './utils';
import { DateTime } from 'luxon';
import { normalizePath } from 'obsidian';

/**
 * Build a vault path from a directory and filename, handling root dir properly.
 */
function vaultPath(dir: string, fileName: string): string {
	const cleanDir = dir.replace(/^\/+|\/+$/g, '');
	return normalizePath(cleanDir ? `${cleanDir}/${fileName}` : fileName);
}

export type NormalizeResult = {
	total: number;
	deleted: number;
	normalized: number;
	skipped: number;
	renameFailures: number;
	errors: { file: string; reason: string }[];
};

const BLOCKQUOTE_METADATA_REGEX =
	/^>\s*(Date:|Dayone:|Day One:|\[.*?\]\(dayone2?:\/\/.*?\)).*$/gm;

const DATE_HEADING_REGEX =
	/^#\s+\d{4}-\d{2}-\d{2}[\s.:]\d{2}[.:]\d{2}[.:]\d{2}\s*$/gm;

const GHOST_DAYONE_LINK_REGEX =
	/\[([^\]]*)\]\(dayone2?:\/\/view\?entryId=[A-Fa-f0-9]+\)/g;

function splitContent(content: string): { frontmatter: string; body: string } {
	const match = content.match(/^(---\n[\s\S]*?\n---)\n?([\s\S]*)$/);
	if (match) {
		return { frontmatter: match[1], body: match[2] };
	}
	return { frontmatter: '', body: content };
}

function cleanupBody(text: string): string {
	return text
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^\s*---\s*$/m, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function joinContent(frontmatter: string, body: string): string {
	if (frontmatter) {
		return frontmatter + '\n\n' + body + '\n';
	}
	return body + '\n';
}

/**
 * Build the target filename from frontmatter `date` field using the same
 * pattern settings as the Day One import.
 * Returns null if the date cannot be parsed.
 */
function buildTargetFileName(
	settings: DayOneImporterSettings,
	frontmatterDate: string | undefined,
	currentName: string
): string | null {
	if (!settings.dateBasedFileNames) {
		// UUID-based: keep the current filename
		return currentName;
	}

	if (!frontmatterDate) {
		return null;
	}

	const dt = DateTime.fromISO(frontmatterDate, { setZone: true });
	if (!dt.isValid) {
		return null;
	}

	const formatted = dt.toFormat(settings.dateBasedFileNameFormat);
	return normalizePath(`${formatted}.md`);
}

/**
 * Strip metadata from body: blockquote lines, date headings, ghost links, inline tags.
 */
function normalizeBody(body: string): { body: string; tags: string[] } {
	let cleaned = body;
	cleaned = cleaned.replace(BLOCKQUOTE_METADATA_REGEX, '');
	cleaned = cleaned.replace(DATE_HEADING_REGEX, '');
	cleaned = cleaned.replace(GHOST_DAYONE_LINK_REGEX, '$1');

	const { text: tagStripped, tags } = stripInlineTags(cleaned);
	return { body: cleanupBody(tagStripped), tags };
}

export async function normalizeEntries(
	vault: Vault,
	fileManager: FileManager,
	settings: DayOneImporterSettings,
	uuidMapStore: UuidMapStore
): Promise<NormalizeResult> {
	const result: NormalizeResult = {
		total: 0,
		deleted: 0,
		normalized: 0,
		skipped: 0,
		renameFailures: 0,
		errors: [],
	};

	let files: TFile[];
	if (
		settings.normalizeScanFolder &&
		settings.normalizeScanFolder.trim() !== ''
	) {
		const folder = vault.getAbstractFileByPath(settings.normalizeScanFolder);
		if (!folder || !isTFolder(folder)) {
			new Notice(
				`Normalize scan folder "${settings.normalizeScanFolder}" does not exist.`
			);
			return result;
		}
		files = (folder as TFolder).children.filter(
			(f) => isTFile(f) && (f as TFile).extension === 'md'
		) as TFile[];
	} else {
		files = vault.getMarkdownFiles();
	}

	result.total = files.length;

	let uuidMap: Record<string, string> = {};
	try {
		uuidMap = await uuidMapStore.read();
	} catch {
		uuidMap = {};
	}

	console.log(
		`[normalize] Processing ${files.length} files, UUID map has ${Object.keys(uuidMap).length} entries`
	);

	for (const file of files) {
		try {
			console.log(
				`[normalize] Processing: ${file.path} (exists: ${!!vault.getAbstractFileByPath(file.path)})`
			);
			const content = await vault.cachedRead(file);
			const { frontmatter, body } = splitContent(content);

			const linkRegex = new RegExp(DAYONE_LINK_REGEX.source, 'g');
			const match = linkRegex.exec(body);

			if (match) {
				const uuid = match[1];
				const importedFileName = uuidMap[uuid];
				console.log(
					`[normalize]   Day One link found, UUID=${uuid}, imported=${importedFileName ?? 'NOT IN MAP'}`
				);

				if (importedFileName) {
					if (settings.normalizeConflictResolution === 'keep-imported') {
						console.log(
							`[normalize]   Case 1a: keep-imported → deleting migrated`
						);
						await vault.delete(file);
						result.deleted++;
					} else {
						const importedPath = vaultPath(
							settings.outDirectory,
							importedFileName
						);
						const importedFile = vault.getAbstractFileByPath(importedPath);
						console.log(
							`[normalize]   Case 1b: keep-migrated → imported at "${importedPath}" (found: ${!!importedFile})`
						);
						if (importedFile && isTFile(importedFile)) {
							await vault.delete(importedFile as TFile);
						}

						// Normalize the migrated file
						const { body: cleanedBody, tags: inlineTags } = normalizeBody(body);
						await vault.modify(file, joinContent(frontmatter, cleanedBody));

						if (inlineTags.length > 0) {
							await fileManager.processFrontMatter(file, (fm) => {
								const existing: string[] = fm['tags'] ?? [];
								const merged = new Set([...existing, ...inlineTags]);
								fm['tags'] = Array.from(merged).sort();
							});
						}

						// Rename + move
						await renameAndMove(vault, fileManager, file, settings, result);
						result.normalized++;
					}
				} else {
					// Case 2: Ghost entry — UUID not in map
					const { body: cleanedBody, tags: inlineTags } = normalizeBody(body);
					await vault.modify(file, joinContent(frontmatter, cleanedBody));

					if (inlineTags.length > 0) {
						await fileManager.processFrontMatter(file, (fm) => {
							const existing: string[] = fm['tags'] ?? [];
							const merged = new Set([...existing, ...inlineTags]);
							fm['tags'] = Array.from(merged).sort();
						});
					}

					await renameAndMove(vault, fileManager, file, settings, result);
					result.normalized++;
				}
			} else {
				console.log(`[normalize]   No Day One link — Case 3 (native)`);
				// Case 3: No Day One link — native entry
				const { body: cleanedBody, tags: inlineTags } = normalizeBody(body);
				const finalBody = cleanedBody;
				const bodyChanged = finalBody !== body.trim();

				if (bodyChanged) {
					await vault.modify(file, joinContent(frontmatter, finalBody));
				}

				if (inlineTags.length > 0) {
					await fileManager.processFrontMatter(file, (fm) => {
						const existing: string[] = fm['tags'] ?? [];
						const merged = new Set([...existing, ...inlineTags]);
						fm['tags'] = Array.from(merged).sort();
					});
				}

				await renameAndMove(vault, fileManager, file, settings, result);
				result.normalized++;
			}
		} catch (e) {
			const reason = e instanceof Error ? e.message : String(e);
			console.error(`[normalize] ERROR on ${file.path}: ${reason}`);
			result.errors.push({
				file: file.path,
				reason,
			});
		}
	}

	if (result.renameFailures > 0) {
		new Notice(
			`${result.renameFailures} notes could not be renamed — missing or unparseable date in frontmatter. Files were moved but kept their original names.`
		);
	}

	return result;
}

/**
 * Rename file to match the date-based pattern from settings, then move to vault root.
 * If the date can't be parsed from frontmatter, the file keeps its current name
 * and a rename failure is logged.
 */
async function renameAndMove(
	vault: Vault,
	fileManager: FileManager,
	file: TFile,
	settings: DayOneImporterSettings,
	result: NormalizeResult
): Promise<void> {
	// Read frontmatter date to build target filename
	let fmDate: string | undefined;
	await fileManager.processFrontMatter(file, (fm) => {
		fmDate = fm['date'];
	});

	const targetName = buildTargetFileName(settings, fmDate, file.name);
	console.log(
		`[normalize]   renameAndMove: fmDate=${fmDate}, targetName=${targetName}, currentPath=${file.path}`
	);

	if (targetName === null) {
		result.renameFailures++;
		const newPath = file.name;
		console.log(
			`[normalize]   rename FAILED (no date), moving as-is: ${file.path} → ${newPath}`
		);
		if (file.path !== newPath) {
			await vault.rename(file, newPath);
		}
	} else {
		const newPath = targetName;
		console.log(`[normalize]   rename: ${file.path} → ${newPath}`);
		if (file.path !== newPath) {
			await vault.rename(file, newPath);
		}
	}
}
