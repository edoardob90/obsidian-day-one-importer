import { Events, FileManager, normalizePath, Vault } from 'obsidian';
import { DayOneImporterSettings } from './main';
import {
	buildFileName,
	buildFileBody,
	buildJournalTag,
	ImportFailure,
	ImportResult,
	collectDayOneEntries,
} from './utils';
import { writeTargetFrontMatter } from './update-front-matter';
import { UuidMapStore } from './uuid-map';

export async function importJson(
	vault: Vault,
	settings: DayOneImporterSettings,
	fileManager: FileManager,
	importEvents: Events,
	uuidMapStore?: UuidMapStore
): Promise<ImportResult> {
	try {
		// Use the shared utility to collect entries
		const { allEntries, allInvalidEntries } = await collectDayOneEntries(
			vault,
			settings
		);

		// If no entries were found
		if (allEntries.length === 0) {
			return {
				total: 0,
				successCount: 0,
				ignoreCount: 0,
				failures: [],
				invalidEntries: allInvalidEntries,
			};
		}

		// Always build UUID map if store is available
		let uuidToFileName: Record<string, string> = {};
		if (uuidMapStore) {
			try {
				uuidToFileName = await uuidMapStore.read();
			} catch {
				uuidToFileName = {};
				console.log('Failed to read UUID map, starting with an empty map.');
			}

			// Update with new entries
			allEntries.forEach(({ item }) => {
				uuidToFileName[item.uuid] = buildFileName(settings, item);
			});
		}

		// Ensure output directory exists (skip for vault root)
		const cleanOutDir = settings.outDirectory.replace(/^\/+|\/+$/g, '');
		if (cleanOutDir && !vault.getAbstractFileByPath(cleanOutDir)) {
			console.log(`Creating output directory: ${cleanOutDir}`);
			await vault.createFolder(cleanOutDir);
		}

		// Internal link resolution is still gated on the setting
		const resolveLinks =
			settings.enableInternalLinks && Object.keys(uuidToFileName).length > 0;

		// Process each entry (create notes)
		const fileNames = new Set();
		let successCount = 0;
		let ignoreCount = 0;
		const failures: ImportFailure[] = [];

		for (const [index, { item, fileName }] of allEntries.entries()) {
			try {
				const outFileName = buildFileName(settings, item);

				if (fileNames.has(outFileName)) {
					throw new Error(
						`A file named ${outFileName} has already been created in this import`
					);
				} else {
					fileNames.add(outFileName);
				}

				// Create the actual note file
				const outDir = settings.outDirectory.replace(/^\/+|\/+$/g, '');
				const outPath = normalizePath(
					outDir ? `${outDir}/${outFileName}` : outFileName
				);
				const file = await vault.create(
					outPath,
					buildFileBody(item, resolveLinks ? uuidToFileName : {}),
					{
						ctime: new Date(item.creationDate).getTime(),
						mtime: new Date(item.modifiedDate).getTime(),
					}
				);

				const journalTag = buildJournalTag(
					fileName,
					item,
					settings.journalTagPrefix
				);
				await writeTargetFrontMatter(
					file,
					item,
					settings,
					fileManager,
					journalTag,
					[]
				);
				successCount++;
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				if (
					message === 'File already exists.' &&
					settings.ignoreExistingFiles
				) {
					ignoreCount++;
				} else {
					console.error(e);
					failures.push({
						entry: item,
						reason: message,
					});
				}
			}
			const globalProgress = ((index + 1) / allEntries.length) * 100;
			importEvents.trigger('percentage-import', globalProgress);
		}

		// Always persist UUID map
		if (uuidMapStore) {
			await uuidMapStore.write(uuidToFileName);
		}

		return {
			total: allEntries.length + allInvalidEntries.length,
			successCount,
			ignoreCount,
			failures,
			invalidEntries: allInvalidEntries,
		};
	} catch (err) {
		console.error(err);
		throw err;
	}
}
