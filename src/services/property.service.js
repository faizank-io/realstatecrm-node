const prisma = require("../config/db.config");
const ApiError = require("../utils/ApiError");
const { StatusCodes } = require("http-status-codes");
const S3Service = require("./s3.service");
const { logActivity, formatPrice } = require("../utils/activityLogger");

class PropertyService {
  /**
   * Create a new property
   */
  async createProperty(agencyId, userId, role, data) {
    const prefix = data.type === "RENT" ? "RNT" : "SLS";
    const refNum = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    let approvalStatus = "PENDING";
    if (role === "AGENCY_OWNER" || role === "OFFICE_MANAGER" || role === "SUPER_ADMIN") {
      approvalStatus = "APPROVED";
    }

    const { amenities, ...propertyData } = data;

    const createQuery = {
      ...propertyData,
      referenceNumber: refNum,
      approvalStatus,
      agencyId,
      createdById: userId,
      assignedToId: userId,
    };

    if (amenities && Array.isArray(amenities) && amenities.length > 0) {
      createQuery.amenities = {
        create: amenities.map(amenityId => ({
          amenity: { connect: { id: amenityId } }
        }))
      };
    }

    const property = await prisma.property.create({
      data: createQuery,
      include: {
        images: true,
        propertyType: true,
        category: true,
        listingStatus: true,
        amenities: { include: { amenity: true } }
      }
    });

    // Log: Listing created
    await logActivity({ action: "Listing created", propertyId: property.id, userId });

    // If auto-approved (owner/manager created it), also log the first price as Listed
    if (approvalStatus === "APPROVED" && property.price > 0) {
      await prisma.priceHistory.create({
        data: { price: property.price, note: "Listed", propertyId: property.id }
      });
      await logActivity({ action: "Listing approved", propertyId: property.id, userId });
    }

    return property;
  }

  /**
   * Upload and attach images to a property
   * FormData fields:
   *   - images: (multiple files)
   *   - names:  (optional JSON array, e.g. ["Floor plan — level 1", "Elevation 1"])
   *   - mainIndex: (optional number, which file index is the main/cover image, default 0)
   */
  async uploadImages(propertyId, files, namesJson, mainIndex = 0) {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");

    // Parse optional names array
    let names = [];
    if (namesJson) {
      try {
        names = JSON.parse(namesJson);
      } catch {
        // If not valid JSON, ignore — names will just be null
      }
    }

    // Check if property already has images (to determine isMain logic)
    const existingCount = await prisma.propertyImage.count({ where: { propertyId } });

    const uploadPromises = files.map(file => S3Service.uploadFile(file, "properties"));
    const results = await Promise.all(uploadPromises);

    const imagesToCreate = results.map((res, index) => ({
      url:       res.url,
      name:      names[index] || null,
      isMain:    existingCount === 0 && index === parseInt(mainIndex), // Only first-ever upload sets isMain
      sortOrder: existingCount + index,
      propertyId
    }));

    await prisma.propertyImage.createMany({ data: imagesToCreate });

    // Log: photos uploaded
    await logActivity({
      action: `${files.length} photo${files.length > 1 ? 's' : ''} uploaded`,
      propertyId,
      userId: property.createdById
    });

    return prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] }
      }
    });
  }

  /**
   * Delete a single property image by imageId.
   * Also deletes the file from S3.
   * If the deleted image was the cover (isMain), the next image becomes the new cover.
   */
  async deleteImage(propertyId, imageId) {
    const image = await prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId }
    });
    if (!image) throw new ApiError(StatusCodes.NOT_FOUND, "Image not found on this property");

    // Delete from S3 — extract the S3 key from the URL
    // URL format: https://bucket.s3.region.amazonaws.com/properties/filename.ext
    try {
      const url = new URL(image.url);
      const s3Key = url.pathname.slice(1); // remove leading '/'
      await S3Service.deleteFile(s3Key);
    } catch {
      // Even if S3 delete fails, continue to remove the DB record
    }

    await prisma.propertyImage.delete({ where: { id: imageId } });

    // If deleted image was main → promote the next image as cover
    if (image.isMain) {
      const nextImage = await prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { sortOrder: 'asc' }
      });
      if (nextImage) {
        await prisma.propertyImage.update({
          where: { id: nextImage.id },
          data: { isMain: true }
        });
      }
    }

    return { deleted: true, imageId };
  }

  /**
   * Set a specific image as the main/cover image for a property.
   * Unsets isMain on all other images first.
   */
  async setMainImage(propertyId, imageId) {
    const image = await prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId }
    });
    if (!image) throw new ApiError(StatusCodes.NOT_FOUND, "Image not found on this property");

    // Unset all → then set the chosen one
    await prisma.propertyImage.updateMany({
      where: { propertyId },
      data: { isMain: false }
    });
    await prisma.propertyImage.update({
      where: { id: imageId },
      data: { isMain: true }
    });

    return prisma.property.findUnique({
      where: { id: propertyId },
      include: { images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] } }
    });
  }

  /**
   * Get all properties (paginated, filtered)
   */
  async getProperties({ agencyId, type, listingStatusSlug, approvalStatus, city, propertyTypeSlug, sortBy, page = 1, limit = 10 }) {
    page = Math.max(1, parseInt(page));
    limit = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (page - 1) * limit;

    const where = {};
    if (agencyId)          where.agencyId      = agencyId;
    if (type)              where.type           = type.toUpperCase();
    if (approvalStatus)    where.approvalStatus = approvalStatus.toUpperCase();
    if (listingStatusSlug) where.listingStatus  = { slug: listingStatusSlug.toLowerCase() };
    if (city)              where.city           = { contains: city };
    if (propertyTypeSlug)  where.propertyType   = { slug: propertyTypeSlug.toLowerCase() };

    // Sort logic
    let orderBy;
    switch (sortBy) {
      case 'price_high':  orderBy = { price: 'desc' };      break;
      case 'price_low':   orderBy = { price: 'asc' };       break;
      case 'most_leads':  orderBy = { leads: { _count: 'desc' } }; break;
      default:            orderBy = { createdAt: 'desc' };  // newest
    }

    const [data, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          type: true,
          price: true,
          city: true,
          location: true,
          bedrooms: true,
          bathrooms: true,
          size: true,
          category:      { select: { name: true } },
          listingStatus: { select: { name: true, colorCode: true } },
          images:        { select: { url: true }, where: { isMain: true }, take: 1 },
          _count:        { select: { leads: true } }
        }
      }),
      prisma.property.count({ where })
    ]);

    return {
      properties: data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Export properties as a CSV string.
   * Supports the same filters as getProperties (no pagination — exports all matching records).
   */
  async exportPropertiesCSV({ agencyId, type, listingStatusSlug, approvalStatus, city, propertyTypeSlug }) {
    const where = {};
    if (agencyId)          where.agencyId       = agencyId;
    if (type)              where.type            = type.toUpperCase();
    if (approvalStatus)    where.approvalStatus  = approvalStatus.toUpperCase();
    if (listingStatusSlug) where.listingStatus   = { slug: listingStatusSlug.toLowerCase() };
    if (city)              where.city            = { contains: city };
    if (propertyTypeSlug)  where.propertyType    = { slug: propertyTypeSlug.toLowerCase() };

    const properties = await prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        referenceNumber: true,
        title:           true,
        type:            true,
        price:           true,
        city:            true,
        area:            true,
        location:        true,
        address:         true,
        bedrooms:        true,
        bathrooms:       true,
        parking:         true,
        floors:          true,
        size:            true,
        builtYear:       true,
        isFurnished:     true,
        approvalStatus:  true,
        listingViews:    true,
        propertyType:    { select: { name: true } },
        category:        { select: { name: true } },
        listingStatus:   { select: { name: true } },
        assignedTo:      { select: { name: true } },
        createdBy:       { select: { name: true } },
        createdAt:       true,
      }
    });

    const headers = [
      "Reference No.", "Title", "Type", "Price (PKR)",
      "Property Type", "Category", "Listing Status",
      "City", "Area", "Location", "Address",
      "Beds", "Baths", "Parking", "Floors", "Size (sq ft)", "Built Year", "Furnished",
      "Approval", "Views", "Assigned To", "Created By", "Created Date"
    ];

    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = properties.map(p => [
      escape(p.referenceNumber),
      escape(p.title),
      escape(p.type),
      p.price,
      escape(p.propertyType?.name ?? ''),
      escape(p.category?.name ?? ''),
      escape(p.listingStatus?.name ?? ''),
      escape(p.city ?? ''),
      escape(p.area ?? ''),
      escape(p.location ?? ''),
      escape(p.address ?? ''),
      p.bedrooms,
      p.bathrooms,
      p.parking,
      p.floors,
      p.size,
      p.builtYear ?? '',
      p.isFurnished ? 'Yes' : 'No',
      escape(p.approvalStatus),
      p.listingViews,
      escape(p.assignedTo?.name ?? ''),
      escape(p.createdBy?.name ?? ''),
      new Date(p.createdAt).toISOString().split('T')[0]
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async getPropertyById(id) {
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        // Media & plans tab
        images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] },

        // Overview sidebar
        propertyType:  { select: { name: true, slug: true } },
        category:      { select: { name: true, slug: true } },
        listingStatus: { select: { name: true, colorCode: true } },
        createdBy:     { select: { id: true, name: true, role: true } },
        assignedTo:    { select: { id: true, name: true, avatar: true } },
        agency:        { select: { id: true, name: true, city: true } },

        // Price history sidebar panel (always small, no pagination needed)
        priceHistory: { orderBy: { createdAt: 'desc' }, take: 10 },

        // Amenities tab (finite list, no pagination)
        amenities: {
          include: { amenity: { select: { name: true, slug: true, icon: true } } }
        },

        // Quick counts for the overview sidebar stats
        _count: {
          select: {
            leads:     true,
            viewings:  true,
            activities: true
          }
        }
      }
    });

    if (!property) throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
    return property;
  }

  // ─── PAGINATED TAB METHODS ───────────────────────────────────────────────────

  async getPropertyLeads(propertyId, { page = 1, limit = 12 } = {}) {
    page  = Math.max(1, parseInt(page));
    limit = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (page - 1) * limit;

    const where = { propertyId };
    const [data, total] = await Promise.all([
      prisma.propertyLead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true, firstName: true, lastName: true, phone: true,
              type: true, stage: true, budget: true,
              source:     { select: { name: true } },
              assignedTo: { select: { name: true } }
            }
          }
        }
      }),
      prisma.propertyLead.count({ where })
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPropertyViewings(propertyId, { page = 1, limit = 12 } = {}) {
    page  = Math.max(1, parseInt(page));
    limit = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (page - 1) * limit;

    const where = { propertyId };
    const [data, total] = await Promise.all([
      prisma.viewing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startAt: 'desc' },
        include: {
          client:     { select: { firstName: true, lastName: true, phone: true } },
          assignedTo: { select: { name: true, avatar: true } }
        }
      }),
      prisma.viewing.count({ where })
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPropertyDocuments(propertyId, { page = 1, limit = 12 } = {}) {
    page  = Math.max(1, parseInt(page));
    limit = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (page - 1) * limit;

    const where = { attachedToType: 'PROPERTY', attachedToId: propertyId };
    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { name: true } } }
      }),
      prisma.document.count({ where })
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPropertyActivity(propertyId, { page = 1, limit = 15 } = {}) {
    page  = Math.max(1, parseInt(page));
    limit = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (page - 1) * limit;

    const where = { propertyId };
    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, avatar: true } } }
      }),
      prisma.activityLog.count({ where })
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async updateProperty(id, userId, data) {
    const { amenities, ...propertyData } = data;

    // Fetch current state to detect what changed
    const current = await prisma.property.findUnique({
      where: { id },
      select: { price: true, listingStatusId: true, assignedToId: true }
    });
    if (!current) throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");

    const updated = await prisma.property.update({
      where: { id },
      data: propertyData
    });

    // ── Price changed → PriceHistory + Activity ───────────────────────────────
    if (propertyData.price !== undefined && propertyData.price !== current.price) {
      const direction = propertyData.price < current.price ? "Reduced" : "Increased";
      await prisma.priceHistory.create({
        data: { price: propertyData.price, note: direction, propertyId: id }
      });
      await logActivity({
        action: `Price ${direction.toLowerCase()} to ${formatPrice(propertyData.price)}`,
        propertyId: id, userId
      });
    }

    // ── Listing status changed → Activity ────────────────────────────────────
    if (propertyData.listingStatusId && propertyData.listingStatusId !== current.listingStatusId) {
      const newStatus = await prisma.listingStatus.findUnique({
        where: { id: propertyData.listingStatusId },
        select: { name: true }
      });
      if (newStatus) {
        await logActivity({
          action: `Status set to ${newStatus.name}`,
          propertyId: id, userId
        });
      }
    }

    // ── Agent assigned → Activity ─────────────────────────────────────────────
    if (propertyData.assignedToId && propertyData.assignedToId !== current.assignedToId) {
      const agent = await prisma.user.findUnique({
        where: { id: propertyData.assignedToId },
        select: { name: true }
      });
      if (agent) {
        await logActivity({
          action: `Assigned to ${agent.name}`,
          propertyId: id, userId
        });
      }
    }

    // ── Amenities update ──────────────────────────────────────────────────────
    if (amenities && Array.isArray(amenities)) {
      await prisma.propertyAmenity.deleteMany({ where: { propertyId: id } });
      if (amenities.length > 0) {
        await prisma.propertyAmenity.createMany({
          data: amenities.map(amenityId => ({ propertyId: id, amenityId }))
        });
      }
    }

    // Return the same rich response as createProperty
    return prisma.property.findUnique({
      where: { id },
      include: {
        images:        { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] },
        propertyType:  { select: { name: true, slug: true } },
        category:      { select: { name: true, slug: true } },
        listingStatus: { select: { name: true, colorCode: true } },
        amenities:     { include: { amenity: { select: { name: true, slug: true, icon: true } } } },
        assignedTo:    { select: { id: true, name: true, avatar: true } },
        createdBy:     { select: { id: true, name: true, role: true } },
        agency:        { select: { id: true, name: true, city: true } },
        priceHistory:  { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });
  }

  async deleteProperty(id) {
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        images: { select: { url: true } }
      }
    });

    if (property) {
      const s3Service = require("./s3.service");
      // Delete all property images from S3
      for (const img of property.images) {
        await s3Service.deleteFileByUrl(img.url);
      }
      
      // Delete all attached documents from S3
      const docs = await prisma.document.findMany({
        where: { attachedToType: 'PROPERTY', attachedToId: id },
        select: { url: true }
      });
      for (const doc of docs) {
        await s3Service.deleteFileByUrl(doc.url);
      }
    }

    return prisma.property.delete({ where: { id } });
  }

  async approveListing(id, userId) {
    const property = await prisma.property.findUnique({
      where: { id },
      select: { price: true, approvalStatus: true }
    });
    if (!property) throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
    if (property.approvalStatus === "APPROVED") {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Property is already approved");
    }

    const updated = await prisma.property.update({
      where: { id },
      data: { approvalStatus: "APPROVED" }
    });

    // Log first price as "Listed" in price history
    if (property.price > 0) {
      await prisma.priceHistory.create({
        data: { price: property.price, note: "Listed", propertyId: id }
      });
    }

    await logActivity({ action: "Listing approved", propertyId: id, userId });

    return updated;
  }
}

module.exports = new PropertyService();
