"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary"

const REAUTH_ERROR_MESSAGE = "Sesi Anda sudah tidak valid. Silakan login ulang."

async function getCurrentUserId() {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false as const, error: "Unauthorized" }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  })

  if (!user) {
    return { success: false as const, error: REAUTH_ERROR_MESSAGE }
  }

  return { success: true as const, userId: user.id }
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

// ── Project CRUD ────────────────────────────────────────────────

export async function createProject(name: string, description?: string) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return userResult

    const project = await prisma.project.create({
      data: { userId: userResult.userId, name, description },
      include: { assets: true },
    })

    revalidatePath("/dashboard/projects")
    return { success: true, project }
  } catch (error) {
    console.error("Error creating project:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal membuat project"),
    }
  }
}

export async function getProjects() {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return { ...userResult, projects: [] }

    const projects = await prisma.project.findMany({
      where: { userId: userResult.userId },
      include: { assets: { orderBy: { createdAt: "desc" } } },
      orderBy: { updatedAt: "desc" },
    })

    return { success: true, projects }
  } catch (error) {
    console.error("Error getting projects:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal memuat project"),
      projects: [],
    }
  }
}

export async function getProject(projectId: string) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return { ...userResult, project: null }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: userResult.userId },
      include: { assets: { orderBy: { createdAt: "desc" } } },
    })

    if (!project) return { success: false, error: "Project not found", project: null }
    return { success: true, project }
  } catch (error) {
    console.error("Error getting project:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal memuat project"),
      project: null,
    }
  }
}

export async function updateProject(projectId: string, name: string, description?: string) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return userResult

    await prisma.project.updateMany({
      where: { id: projectId, userId: userResult.userId },
      data: { name, description },
    })

    revalidatePath("/dashboard/projects")
    revalidatePath(`/dashboard/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error("Error updating project:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal memperbarui project"),
    }
  }
}

export async function deleteProject(projectId: string) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return userResult

    await prisma.project.deleteMany({
      where: { id: projectId, userId: userResult.userId },
    })

    revalidatePath("/dashboard/projects")
    return { success: true }
  } catch (error) {
    console.error("Error deleting project:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal menghapus project"),
    }
  }
}

// ── Project Assets ───────────────────────────────────────────────

export async function addProjectAsset(
  projectId: string,
  asset: {
    type: "image" | "video"
    source: "uploaded" | "generated" | "upscaled" | "extended"
    name: string
    url: string
    prompt?: string
    aspectRatio?: string
    mediaGenerationId?: string
  }
) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return userResult

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: userResult.userId },
    })
    if (!project) return { success: false, error: "Project not found" }

    // Upload to Cloudinary if URL is not already hosted there
    let finalUrl = asset.url
    if (asset.url && !asset.url.includes("res.cloudinary.com")) {
      try {
        const { url: cloudUrl } = await uploadToCloudinary(asset.url, "affiliator-pro")
        finalUrl = cloudUrl
      } catch (e) {
        console.error("Cloudinary upload failed, using original URL:", e)
      }
    }

    const created = await prisma.projectAsset.create({
      data: { projectId, ...asset, url: finalUrl },
    })

    // Touch the project's updatedAt
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    })

    revalidatePath(`/dashboard/projects/${projectId}`)
    return { success: true, asset: created }
  } catch (error) {
    console.error("Error adding project asset:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal menambahkan asset ke project"),
    }
  }
}

export async function deleteProjectAsset(projectId: string, assetId: string) {
  try {
    const userResult = await getCurrentUserId()
    if (!userResult.success) return userResult

    // Find the asset first to get Cloudinary public_id
    const asset = await prisma.projectAsset.findFirst({
      where: {
        id: assetId,
        projectId,
        project: { userId: userResult.userId },
      },
    })

    if (!asset) return { success: false, error: "Asset not found" }

    // Delete from Cloudinary if hosted there
    if (asset.url.includes("res.cloudinary.com")) {
      try {
        const parts = asset.url.split("/upload/")
        if (parts[1]) {
          // Remove version and extension: v1234567890/folder/file.ext -> folder/file
          const pathAfterUpload = parts[1].replace(/^v\d+\//, "")
          const publicId = pathAfterUpload.replace(/\.[^.]+$/, "")
          const resourceType = asset.type === "video" ? "video" : "image"
          await deleteFromCloudinary(publicId, resourceType)
        }
      } catch (e) {
        console.error("Cloudinary delete failed:", e)
      }
    }

    await prisma.projectAsset.delete({ where: { id: assetId } })

    revalidatePath(`/dashboard/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error("Error deleting project asset:", error)
    return {
      success: false,
      error: getActionErrorMessage(error, "Gagal menghapus asset project"),
    }
  }
}
