const prisma = require("../config/db.config");
const ApiError = require("../utils/ApiError");
const { StatusCodes } = require("http-status-codes");
const { logActivity } = require("../utils/activityLogger");

class ViewingService {
  // 1. Create Viewing
  async createViewing(agencyId, userId, data) {
    // Check if client already has a pending viewing for this property
    const existingViewing = await prisma.viewing.findFirst({
      where: {
        propertyId: data.propertyId,
        clientId: data.clientId,
        status: { in: ["SCHEDULED", "CONFIRMED"] }
      }
    });

    if (existingViewing) {
      const { StatusCodes } = require("http-status-codes");
      throw new ApiError(StatusCodes.BAD_REQUEST, "Client already has a scheduled or confirmed viewing for this property.");
    }

    const viewing = await prisma.viewing.create({
      data: {
        ...data,
        agencyId,
        assignedToId: data.assignedToId || userId // Default to creator if not assigned
      },
      include: {
        property: { select: { title: true, referenceNumber: true } },
        client: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true } }
      }
    });

    logActivity({
      agencyId,
      userId,
      action: "CREATED_VIEWING",
      entityType: "VIEWING",
      entityId: viewing.id,
      description: `Scheduled a viewing for property ${viewing.property.referenceNumber}`
    });

    return viewing;
  }

  // 2. Get Viewings (List & Calendar)
  async getViewings({ agencyId, status, assignedToId, startDate, endDate, page = 1, limit = 100 }) {
    page = Math.max(1, parseInt(page));
    limit = Math.min(500, parseInt(limit));
    const skip = (page - 1) * limit;

    const where = { agencyId };
    
    if (status) where.status = status.toUpperCase();
    if (assignedToId) where.assignedToId = assignedToId;
    
    if (startDate && endDate) {
      where.startAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Date for calculating "This Month" stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [data, total, monthTotal, confirmed, completed, noShows] = await Promise.all([
      prisma.viewing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startAt: "asc" },
        include: {
          property: { select: { title: true, referenceNumber: true, city: true, area: true } },
          client: { select: { firstName: true, lastName: true, phone: true } },
          assignedTo: { select: { name: true, avatar: true } }
        }
      }),
      prisma.viewing.count({ where }),
      prisma.viewing.count({ where: { agencyId, startAt: { gte: startOfMonth } } }),
      prisma.viewing.count({ where: { agencyId, status: "CONFIRMED", startAt: { gte: startOfMonth } } }),
      prisma.viewing.count({ where: { agencyId, status: "COMPLETED", startAt: { gte: startOfMonth } } }),
      prisma.viewing.count({ where: { agencyId, status: "NO_SHOW", startAt: { gte: startOfMonth } } }),
    ]);

    return {
      stats: {
        thisMonth: monthTotal,
        confirmed: confirmed,
        completed: completed,
        noShows: noShows
      },
      viewings: data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  // 3. Update Viewing (Status & Feedback)
  async updateViewing(id, agencyId, userId, data) {
    const viewing = await prisma.viewing.findFirst({ where: { id, agencyId } });
    if (!viewing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Viewing not found");
    }

    // if user wants to change dates
    if (data.startAt) data.startAt = new Date(data.startAt);
    if (data.endAt) data.endAt = new Date(data.endAt);

    const updated = await prisma.viewing.update({
      where: { id },
      data,
      include: {
        property: { select: { referenceNumber: true } }
      }
    });

    logActivity({
      agencyId,
      userId,
      action: "UPDATED_VIEWING",
      entityType: "VIEWING",
      entityId: id,
      description: `Updated viewing status/details for ${updated.property.referenceNumber}`
    });

    return updated;
  }

  // 4. Delete Viewing
  async deleteViewing(id, agencyId, userId) {
    const viewing = await prisma.viewing.findFirst({ where: { id, agencyId } });
    if (!viewing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Viewing not found");
    }

    await prisma.viewing.delete({ where: { id } });

    logActivity({
      agencyId,
      userId,
      action: "DELETED_VIEWING",
      entityType: "VIEWING",
      entityId: id,
      description: `Deleted a viewing`
    });

    return true;
  }
}

module.exports = new ViewingService();