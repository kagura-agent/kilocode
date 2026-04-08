import { createSignal } from "solid-js"
import {
  ACCEPTED_IMAGE_TYPES,
  inferMimeType,
  isAcceptedImageType,
  isDragLeavingComponent,
} from "./image-attachments-utils"
import { extractDropPaths } from "../utils/path-mentions"

export interface ImageAttachment {
  id: string
  filename: string
  mime: string
  dataUrl: string
}

/** Callback for handling text/URI file path drops. */
export type FilePathDropHandler = (paths: string[]) => void

export function useImageAttachments() {
  const [images, setImages] = createSignal<ImageAttachment[]>([])
  const [dragging, setDragging] = createSignal(false)
  let onFilePaths: FilePathDropHandler | undefined

  /** Register a handler for file path drops (text/URI-list). */
  const setFilePathDropHandler = (handler: FilePathDropHandler) => {
    onFilePaths = handler
  }

  const add = (file: File) => {
    const mime = inferMimeType(file.name, file.type)
    if (!isAcceptedImageType(mime)) return
    const reader = new FileReader()
    reader.onload = () => {
      let dataUrl = reader.result as string
      // On Windows, dragged files often have an empty type, producing
      // "data:;base64,..." which breaks downstream consumers like
      // parseImage(). Rewrite the header with the inferred MIME type.
      if (!file.type && dataUrl.startsWith("data:;")) {
        dataUrl = `data:${mime};${dataUrl.slice(6)}`
      }
      const attachment: ImageAttachment = {
        id: crypto.randomUUID(),
        filename: file.name || "image",
        mime,
        dataUrl,
      }
      setImages((prev) => [...prev, attachment])
    }
    reader.readAsDataURL(file)
  }

  const remove = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const clear = () => setImages([])

  const replace = (next: ImageAttachment[]) => setImages(next)

  const handlePaste = (event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const imageItems = items.filter((item) => item.kind === "file" && ACCEPTED_IMAGE_TYPES.includes(item.type))
    if (imageItems.length === 0) return
    event.preventDefault()
    for (const item of imageItems) {
      const file = item.getAsFile()
      if (file) add(file)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    const types = event.dataTransfer?.types
    if (!types) return
    // Accept file drops and VS Code URI-list drops (explorer, editor tabs).
    // Do NOT accept bare text/plain here — that would intercept normal text drags.
    // NOTE: VS Code disables webview pointer-events during drag. Users must hold
    // Shift while dragging to re-enable drops into the webview (VS Code 1.91+).
    const acceptable = types.includes("Files") || types.includes("application/vnd.code.uri-list")
    if (!acceptable) return
    event.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    if (isDragLeavingComponent(event.relatedTarget, event.currentTarget as HTMLElement)) {
      setDragging(false)
    }
  }

  const handleDrop = (event: DragEvent) => {
    setDragging(false)
    event.preventDefault()
    const dt = event.dataTransfer
    if (!dt) return

    // First: check for text/URI file path drops (VS Code explorer, editor tabs)
    const paths = extractDropPaths(dt)
    if (paths && paths.length > 0 && onFilePaths) {
      onFilePaths(paths)
      return
    }

    // Second: fall through to image file drops
    const files = dt.files
    if (!files) return
    for (const file of Array.from(files)) add(file)
  }

  return {
    images,
    dragging,
    add,
    remove,
    clear,
    replace,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    setFilePathDropHandler,
  }
}
