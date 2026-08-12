const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const path = require("path");
const crypto = require("crypto");
const logger = require("../utils/logger");
const adminSettingsService = require("./adminSettings.service");

class S3Service {
  /**
   * Build a fresh S3Client using credentials from DB (adminSettings)
   */
  async _getClient() {
    const settings = await adminSettingsService.getSystemSettings();
    const { accessKeyId, secretAccessKey, region } = settings.integrations.s3;

    return new S3Client({
      region: region || "eu-north-1",
      credentials: {
        accessKeyId: accessKeyId || "",
        secretAccessKey: secretAccessKey || "",
      },
    });
  }

  /**
   * Upload file buffer to S3 bucket
   * @param {Object} file - Multer file object (file.buffer, file.originalname, file.mimetype)
   * @param {String} folder - Target folder in bucket e.g. 'properties', 'avatars', 'documents'
   */
  async uploadFile(file, folder = "uploads") {
    try {
      const settings = await adminSettingsService.getSystemSettings();
      const { region, bucket } = settings.integrations.s3;

      const s3Client = await this._getClient();

      const ext = path.extname(file.originalname);
      const randomFilename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
      const s3Key = `${folder}/${randomFilename}`;

      const command = new PutObjectCommand({
        Bucket: bucket || "freehold-crm-storage",
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      const bucketRegion = region || "eu-north-1";
      const bucketName = bucket || "freehold-crm-storage";
      const fileUrl = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${s3Key}`;

      logger.info(`✅ File Uploaded to S3: ${fileUrl}`);

      return {
        key: s3Key,
        url: fileUrl,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      };
    } catch (error) {
      logger.error(`❌ S3 Upload Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file from S3 bucket by Key
   */
  async deleteFile(s3Key) {
    try {
      const settings = await adminSettingsService.getSystemSettings();
      const { bucket } = settings.integrations.s3;

      const s3Client = await this._getClient();

      const command = new DeleteObjectCommand({
        Bucket: bucket || "freehold-crm-storage",
        Key: s3Key,
      });

      await s3Client.send(command);
      logger.info(`✅ File Deleted from S3: ${s3Key}`);
      return true;
    } catch (error) {
      logger.error(`❌ S3 Delete Error: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete file from S3 bucket by full URL
   */
  async deleteFileByUrl(fileUrl) {
    if (!fileUrl || !fileUrl.includes(".amazonaws.com/")) return false;
    try {
      const s3Key = fileUrl.split(".amazonaws.com/")[1];
      if (s3Key) {
        return await this.deleteFile(decodeURIComponent(s3Key));
      }
    } catch (error) {
      logger.error(`❌ S3 Delete by URL Error: ${error.message}`);
    }
    return false;
  }
}

module.exports = new S3Service();
