// Create this file at: /root/app_follow-up/scripts/manager-helper.js

// Simple implementation of parseTimeString
export function parseTimeString(timeStr) {
  if (!timeStr || timeStr.trim() === "") {
    return 30 * 60 * 1000 // 30 minutes default
  }

  const units = {
    s: 1000, // seconds
    m: 60 * 1000, // minutes
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
  }

  // Format: "30m", "2h", "1d"
  const match = timeStr.match(/^(\d+)([smhd])$/i)
  if (match) {
    const value = Number.parseInt(match[1])
    const unit = match[2].toLowerCase()

    if (unit in units) {
      return value * units[unit]
    }
  }

  // If just numbers, assume minutes
  if (/^\d+$/.test(timeStr.trim())) {
    return Number.parseInt(timeStr.trim()) * 60 * 1000
  }

  return 30 * 60 * 1000 // Default 30 minutes
}

// Mock implementations of other functions
export function processFollowUpSteps(followUpId) {
  console.log(`[MOCK] Processing follow-up steps for: ${followUpId}`)
  return Promise.resolve()
}

export function scheduleNextStep(followUpId, nextStepIndex, scheduledTime) {
  console.log(`[MOCK] Scheduling next step: ${nextStepIndex} for follow-up: ${followUpId} at ${scheduledTime}`)
  return Promise.resolve()
}

