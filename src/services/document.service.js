const prisma = require("../config/db.config");
const ApiError = require("../utils/ApiError");
const { StatusCodes } = require("http-status-codes");
const { logActivity } = require("../utils/activityLogger");

class DocumentService {
  async addDocument(agencyId, userId, data) {
    const document = await prisma.document.create({
      data: {
        ...data,
        agencyId,
        uploadedById: userId
      },
      include: {
        uploadedBy: { select: { name: true } }
      }
    });

    logActivity({
      agencyId,
      userId,
      action: "UPLOADED_DOCUMENT",
      entityType: data.attachedToType,
      entityId: data.attachedToId,
      description: `Uploaded document: ${data.name}`
    });

    return document;
  }

  async getDocuments(agencyId, query) {
    const { attachedToType, attachedToId, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = { agencyId };
    if (attachedToType) where.attachedToType = attachedToType.toUpperCase();
    if (attachedToId) where.attachedToId = attachedToId;

    if (search) {
      where.name = { contains: search };
    }

    const [data, total, agency] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          uploadedBy: { select: { name: true, avatar: true } }
        }
      }),
      prisma.document.count({ where }),
      prisma.agency.findUnique({
        where: { id: agencyId },
        include: { subscriptionPlan: { select: { maxStorageGB: true } } }
      })
    ]);

    // Calculate total storage used from DB
    const storageResult = await prisma.document.aggregate({
      where: { agencyId },
      _sum: { sizeBytes: true }
    });
    
    const totalFilesAgency = await prisma.document.count({ where: { agencyId } });
    
    const storageUsedBytes = storageResult._sum.sizeBytes || 0;
    const storageLimitBytes = (agency?.subscriptionPlan?.maxStorageGB || 20) * 1024 * 1024 * 1024;

    return {
      stats: {
        totalFiles: totalFilesAgency,
        storageUsedBytes,
        storageLimitBytes
      },
      documents: data,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  async deleteDocument(id, agencyId, userId) {
    const document = await prisma.document.findFirst({ where: { id, agencyId } });
    if (!document) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Document not found");
    }

    const s3Service = require("./s3.service");
    await s3Service.deleteFileByUrl(document.url);

    await prisma.document.delete({ where: { id } });

    logActivity({
      agencyId,
      userId,
      action: "DELETED_DOCUMENT",
      entityType: document.attachedToType,
      entityId: document.attachedToId,
      description: `Deleted document: ${document.name}`
    });

    return true;
  }
}

module.exports = new DocumentService();
