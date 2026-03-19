type Status = {
  state: "Disabled" | "In Progress" | "Complete" | "Error"
  message: string
  processedFiles: number
  totalFiles: number
  percent: number
}

export function formatIndexingLabel(status: Status): string {
  if (status.state === "In Progress") {
    if (status.totalFiles <= 0) return "IDX In Progress"
    return `IDX ${status.percent}% ${status.processedFiles}/${status.totalFiles}`
  }

  if (status.state === "Error") {
    return `IDX ${status.message}`
  }

  return `IDX ${status.state}`
}
