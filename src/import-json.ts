/* eslint-disable @typescript-eslint/no-explicit-any */
import { Events, FileManager, Vault } from 'obsidian';
import { DayOneImporterSettings } from './main';
import {
	buildFileName,
	buildFileBody,
	ImportFailure,
	ImportResult,
	collectDayOneEntries,
} from './utils';
import { writeFrontMatter } from './update-front-matter';
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

		// Only build UUID map if internal links are enabled
		let uuidToFileName: Record<string, string> = {};
		const useInternalLinks = settings.enableInternalLinks && !!uuidMapStore;

		if (useInternalLinks) {
			try {
				// Try to read an existing UUID map
				uuidToFileName = await uuidMapStore!.read();
			} catch (e) {
				uuidToFileName = {};
				console.log('Failed to read UUID map, starting with an empty map.');
			}

			// Update with new entries
			allEntries.forEach(({ item }) => {
				uuidToFileName[item.uuid] = buildFileName(settings, item);
			});
		}

		// Ensure output directory exists
		if (!vault.getAbstractFileByPath(settings.outDirectory)) {
			console.log(`Creating output directory: ${settings.outDirectory}`);
			await vault.createFolder(settings.outDirectory);
		}

		// Process each entry (create notes)
		const fileNames = new Set();
		let successCount = 0;
		let ignoreCount = 0;
		const failures: ImportFailure[] = [];
		const totalEntries = allEntries.length + allInvalidEntries.length;

		for (const [index, { item }] of allEntries.entries()) {
			try {
				const outFileName = useInternalLinks
					? uuidToFileName[item.uuid]
					: buildFileName(settings, item);

				if (fileNames.has(outFileName)) {
					throw new Error(
						`A file named ${outFileName} has already been created in this import`
					);
				} else {
					fileNames.add(outFileName);
				}

				// Create the actual note file
				const file = await vault.create(
					`${settings.outDirectory}/${outFileName}`,
					buildFileBody(item, useInternalLinks ? uuidToFileName : {}),
					{
						ctime: new Date(item.creationDate).getTime(),
						mtime: new Date(item.modifiedDate).getTime(),
					}
				);

				await writeFrontMatter(file, item, settings, fileManager);
				successCount++;
			} catch (e) {
				if (
					e.message === 'File already exists.' &&
					settings.ignoreExistingFiles
				) {
					ignoreCount++;
				} else {
					console.error(e);
					failures.push({
						entry: item,
						reason: e.message,
					});
				}
			}
			const globalProgress = ((index + 1) / allEntries.length) * 100;
			importEvents.trigger('percentage-import', globalProgress);
		}

		// Persist UUID map if needed
		if (useInternalLinks) {
			await uuidMapStore!.write(uuidToFileName);
		}

		return {
			total: totalEntries,
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
