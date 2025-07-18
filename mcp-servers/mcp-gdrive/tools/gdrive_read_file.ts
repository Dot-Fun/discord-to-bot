import { google } from "googleapis";
import { GDriveReadFileInput, InternalToolResponse } from "./types.js";

export const schema = {
  name: "gdrive_read_file",
  description: "Read contents of a file from Google Drive",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the file to read",
      },
    },
    required: ["fileId"],
  },
} as const;

const drive = google.drive("v3");

interface FileContent {
  uri?: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

export async function readFile(
  args: GDriveReadFileInput,
): Promise<InternalToolResponse> {
  try {
    const result = await readGoogleDriveFile(args.fileId);
    return {
      content: [
        {
          type: "text",
          text: `Contents of ${result.name}:\n\n${result.contents.text || result.contents.blob}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error("Error reading file from Google Drive:", error);
    
    if (error instanceof Error) {
      const apiError = error as any;
      
      if (apiError.code === 404) {
        return {
          content: [
            {
              type: "text",
              text: `File not found: The file with ID '${args.fileId}' does not exist or you don't have access to it.`,
            },
          ],
          isError: true,
        };
      }
      
      if (apiError.code === 401 || apiError.message?.includes("unauthorized")) {
        return {
          content: [
            {
              type: "text",
              text: "Authentication error: Please ensure you are authenticated with Google Drive. You may need to restart the MCP server to re-authenticate.",
            },
          ],
          isError: true,
        };
      }
      
      if (apiError.code === 403) {
        return {
          content: [
            {
              type: "text",
              text: "Permission denied: You don't have permission to read this file.",
            },
          ],
          isError: true,
        };
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error reading file: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        },
      ],
      isError: true,
    };
  }
}

async function readGoogleDriveFile(
  fileId: string,
): Promise<{ name: string; contents: FileContent }> {
  try {
    // First get file metadata to check mime type
    const file = await drive.files.get({
      fileId,
      fields: "mimeType,name",
    });

    // For Google Docs/Sheets/etc we need to export
    if (file.data.mimeType?.startsWith("application/vnd.google-apps")) {
      let exportMimeType: string;
      switch (file.data.mimeType) {
        case "application/vnd.google-apps.document":
          exportMimeType = "text/markdown";
          break;
        case "application/vnd.google-apps.spreadsheet":
          exportMimeType = "text/csv";
          break;
        case "application/vnd.google-apps.presentation":
          exportMimeType = "text/plain";
          break;
        case "application/vnd.google-apps.drawing":
          exportMimeType = "image/png";
          break;
        default:
          exportMimeType = "text/plain";
      }

      const res = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "text" },
      );

      return {
        name: file.data.name || fileId,
        contents: {
          mimeType: exportMimeType,
          text: res.data as string,
        },
      };
    }

    // For regular files download content
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const mimeType = file.data.mimeType || "application/octet-stream";
    const isText =
      mimeType.startsWith("text/") || mimeType === "application/json";
    const content = Buffer.from(res.data as ArrayBuffer);

    return {
      name: file.data.name || fileId,
      contents: {
        mimeType,
        ...(isText
          ? { text: content.toString("utf-8") }
          : { blob: content.toString("base64") }),
      },
    };
  } catch (error) {
    // Re-throw the error to be handled by the main function
    throw error;
  }
}

