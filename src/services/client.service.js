const prisma = require("../config/db.config");
const ApiError = require("../utils/ApiError");
const { statusCodes } = require("http-status-codes");
const { logActivity } = require("../utils/activityLogger");

class ClientService {
  // create client
  async createClient(agencyId, userId, data) {
    const { ...clientData } = data;
    const refNum = `CLI-${Math.floor(1000 + Math.random() * 9000)}`;
    const createQuery = {
      ...clientData,
      referenceNumber: refNum,
      agencyId,
      createdById: userId,
      assignedToId: clientData.assignedToId || userId,
    };

    const client = await prisma.client.create({
      data: createQuery,
      include: {
        source: { select: { name: true } },
        assignedTo: { select: { name: true, avatar: true } },
      },
    });

    await logActivity({
      action: `Lead Created: ${client.firstName}${client.lastName}`,
      entityType: "CLIENT",
      entityId: client.id,
      userId,
    });
    return client;
  }
  // list clients
  async getClients({
    agencyId,
    search,
    type,
    stage,
    assignedToId,
    sortBy,
    page = 1,
    limit = 10,
  }) {
    page = Math.max(1, parseInt(page));
    limit = Math.min(100, parseInt(limit));
    const skip = (page - 1) * limit;

    const where = { agencyId };

    if (type) where.type = type.toUpperCase();
    if (stage) where.stage = stage.toUpperCase();
    if (assignedToId) where.assignedToId = assignedToId;

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { referenceNumber: { contains: search } },
      ];
    }

    let orderBy = {};
    switch (sortBy) {
      case "budget_high":
        orderBy = { budget: "desc" };
        break;
      case "budget_low":
        orderBy = { budget: "asc" };
        break;
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const [data, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          referenceNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          type: true,
          stage: true,
          budget: true,
          lastTouchedAt: true,
          createdAt: true,
          source: { select: { name: true } },
          assignedTo: { select: { name: true, avatar: true } },
          _count: { select: { propertyLeads: true, viewings: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);
    return {
      clients: data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
  // get client by id
  async getClientById(id, agencyId) {
    const client = await prisma.client.findFirst({
      where: { id, agencyId },
      include: {
        source: { select: { name: true } },
        assignedTo: { select: { id: true, name: true, avatar: true } },
        createdBy: { select: { id: true, name: true } },
        _count: {
          select: {
            propertyLeads: true, // "Properties of interest" count
            viewings: true       // Viewings count
          }
        }
      }
    });

    if (!client) {
      const { StatusCodes } = require("http-status-codes");
      throw new ApiError(StatusCodes.NOT_FOUND, "Client not found");
    }
    
    return client;
  }

  // 1. Timeline (Activity Logs)
  async getClientTimeline(clientId, { page = 1, limit = 15 } = {}) {
    const skip = (page - 1) * limit;
    const where = { entityType: "CLIENT", entityId: clientId };

    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } }
      }),
      prisma.activityLog.count({ where })
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // 2. Matched Properties (Property Leads)
  async getClientMatchedProperties(clientId, { page = 1, limit = 12 } = {}) {
    const skip = (page - 1) * limit;
    const where = { clientId };

    const [data, total] = await Promise.all([
      prisma.propertyLead.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          property: {
            select: {
              id: true, title: true, referenceNumber: true, price: true,
              city: true, area: true, bedrooms: true, bathrooms: true, size: true,
              listingStatus: { select: { name: true, colorCode: true } },
              images: { select: { url: true }, where: { isMain: true }, take: 1 }
            }
          }
        }
      }),
      prisma.propertyLead.count({ where })
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // 3. Viewings
  async getClientViewings(clientId, { page = 1, limit = 12 } = {}) {
    const skip = (page - 1) * limit;
    const where = { clientId };

    const [data, total] = await Promise.all([
      prisma.viewing.findMany({
        where, skip, take: Number(limit),
        orderBy: { startAt: "desc" },
        include: {
          property: { select: { title: true, referenceNumber: true } },
          assignedTo: { select: { name: true } }
        }
      }),
      prisma.viewing.count({ where })
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // 4. Documents
  async getClientDocuments(clientId, { page = 1, limit = 12 } = {}) {
    const skip = (page - 1) * limit;
    const where = { attachedToType: "CLIENT", attachedToId: clientId };

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } }
      }),
      prisma.document.count({ where })
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // update client
  async updateClient(id, agencyId, userId, data) {
    const client = await prisma.client.findFirst({ where: { id, agencyId } });
    if (!client) {
      const { StatusCodes } = require("http-status-codes");
      throw new ApiError(StatusCodes.NOT_FOUND, "Client not found");
    }

    if (!data || Object.keys(data).length === 0) {
      return client; // No changes to make
    }

    const updated = await prisma.client.update({
      where: { id },
      data
    });

    logActivity({
      agencyId,
      userId,
      action: "UPDATED_CLIENT",
      entityType: "CLIENT",
      entityId: id,
      description: `Updated client: ${updated.firstName} ${updated.lastName || ''}`
    });

    return updated;
  }

  // delete client
  async deleteClient(id, agencyId, userId) {
    const client = await prisma.client.findFirst({ where: { id, agencyId } });
    if (!client) {
      const { StatusCodes } = require("http-status-codes");
      throw new ApiError(StatusCodes.NOT_FOUND, "Client not found");
    }

    // Delete all attached documents from S3
    const docs = await prisma.document.findMany({
      where: { attachedToType: 'CLIENT', attachedToId: id },
      select: { url: true }
    });
    const s3Service = require("./s3.service");
    for (const doc of docs) {
      await s3Service.deleteFileByUrl(doc.url);
    }

    await prisma.client.delete({ where: { id } });

    logActivity({
      agencyId,
      userId,
      action: "DELETED_CLIENT",
      entityType: "CLIENT",
      entityId: id,
      description: `Deleted client: ${client.firstName} ${client.lastName || ''}`
    });

    return true;
  }

  // export clients to CSV
  async exportClientsCSV(filters) {
    const { agencyId, search, type, stage, assignedToId } = filters;
    const where = { agencyId };

    if (type) where.type = type.toUpperCase();
    if (stage) where.stage = stage.toUpperCase();
    if (assignedToId) where.assignedToId = assignedToId;
    
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { referenceNumber: { contains: search } },
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        source: { select: { name: true } },
        assignedTo: { select: { name: true } }
      }
    });

    const headers = [
      "Reference No", "First Name", "Last Name", "Email", "Phone",
      "Type", "Stage", "Budget", "Source", "Assigned To", "Created Date"
    ];

    const rows = clients.map(client => {
      return [
        client.referenceNumber,
        client.firstName || "",
        client.lastName || "",
        client.email || "",
        client.phone || "",
        client.type,
        client.stage,
        client.budget,
        client.source?.name || "",
        client.assignedTo?.name || "",
        client.createdAt.toISOString().split("T")[0]
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }
}

module.exports = new ClientService();
