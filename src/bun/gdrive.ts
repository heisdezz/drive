import fs from "node:fs";
import { google } from "googleapis";
import { addLog } from "./logger";

export async function uploadFileToGDrive(
	auth: any,
	filePath: string,
	filename: string,
	folderId?: string
): Promise<string | null> {
	const drive = google.drive({ version: "v3", auth });
	const fileMetadata: any = {
		name: filename,
	};
	if (folderId) {
		fileMetadata.parents = [folderId];
	}

	const media = {
		mimeType: "application/x-sqlite3",
		body: fs.createReadStream(filePath),
	};

	let existingFileId: string | null = null;
	try {
		const q = `name = '${filename}'${folderId ? ` and '${folderId}' in parents` : ""}`;
		const response = await drive.files.list({
			q,
			fields: "files(id)",
			spaces: "drive",
		});
		const files = response.data.files || [];
		if (files.length > 0 && files[0].id) {
			existingFileId = files[0].id;
		}
	} catch (err: any) {
		addLog("warn", `Google Drive check file failed (will create new): ${err.message}`);
	}

	if (existingFileId) {
		addLog("info", `Updating existing file on Google Drive: ${filename} (ID: ${existingFileId})`);
		const response = await drive.files.update({
			fileId: existingFileId,
			media: media,
			fields: "id",
		});
		return response.data.id || null;
	} else {
		addLog("info", `Creating new file on Google Drive: ${filename}`);
		const response = await drive.files.create({
			requestBody: fileMetadata,
			media: media,
			fields: "id",
		});
		return response.data.id || null;
	}
}
